import type { Flow } from "./load.js";

/**
 * Audit kapısı açıkken bir rolün ortalama aktivasyon sayısı.
 *
 * Kapı disiplini: ilk devir teslim her zaman reddedilir, düzeltme parmak izini
 * değiştirip yeni tur açar, teslim ancak değişmeyen bir turdan sonra olur.
 * Pratikte rol başına iki uyandırma — biri işi yapmak, biri kendi işini
 * denetlemek.
 */
export const AUDIT_ROUNDS = 2;

/**
 * Gözcü audit kapısını uyguluyor mu.
 *
 * `false`, ve bunu bir canlı koşu ortaya çıkardı: 4 rollü `spec` akışı
 * `audit.enabled: true` ile koştu, tahmin 11 aktivasyon dedi, gerçekte **4**
 * oldu. `src/audit/gate.ts` yalnızca deneyde kullanılıyor; `src/watch/` onu
 * hiç çağırmıyor.
 *
 * Tahmin, tasarımın niyetini değil kodun yaptığını anlatmak zorunda:
 * kullanıcı topoloji derinliğine bu sayıya bakarak karar veriyor ve şişirilmiş
 * bir sayı, rol eklemekten gereksiz yere caydırır. Kapı uygulandığı gün bu
 * sabit `true` olur ve tahmin kendiliğinden düzelir.
 */
export const AUDIT_IMPLEMENTED = false;

export interface RejectEdge {
  from: string;
  to: string;
  /** Bu kenar bir kez tetiklenirse baştan koşacak aktivasyon sayısı. */
  segment: number;
}

export interface CostEstimate {
  /** Hiç ret olmazsa kart başına ajan uyandırması. */
  base: number;
  /** Her ret kenarı limitine kadar tetiklenirse. */
  worst: number;
  perRole: number;
  syncBacks: number;
  rejectEdges: RejectEdge[];
}

/**
 * Bir topolojinin kart başına maliyetini tahmin eder.
 *
 * Sayının burada olmasının sebebi: derinlik serbest ama bedava değil.
 * Altıncı rolü eklemeden önce kaça mal olacağını görebilmelisin — ve ret
 * limiti, farkında olmadan verilen bir bütçe kararıdır.
 *
 * SCHEMA.md'deki formülün kod karşılığı:
 *   temel   ≈ rol × audit turu
 *   en kötü ≈ temel + Σ (kenarın ret limiti × o parçanın maliyeti)
 *
 * `syncBack` bu toplama GİRMEZ: git birleştirmesi, ajan çağrısı değil.
 * Eskiden alıcı başına bir aktivasyon sayılıyordu ve canlı koşu bunun yanlış
 * olduğunu gösterdi — 3 syncBack alıcılı 4 rollü akış tam 4 ajan çağırdı.
 */
export function estimateCost(flow: Flow): CostEstimate {
  const perRole = flow.audit.enabled && AUDIT_IMPLEMENTED ? AUDIT_ROUNDS : 1;
  // Bilgi olarak duruyor (akış kaç kopyalama yapacak), maliyete girmiyor.
  const syncBacks = flow.roles.reduce((sum, role) => sum + role.syncBack.length, 0);
  const base = flow.roles.length * perRole;

  const indexOf = new Map(flow.order.map((id, i) => [id, i]));
  const rejectEdges: RejectEdge[] = [];
  for (const [i, role] of flow.roles.entries()) {
    if (role.reject === null) continue;
    const target = indexOf.get(role.reject);
    if (target === undefined) continue;
    // Kart geri döndüğünde hedeften reddedene kadarki her rol yeniden koşar.
    rejectEdges.push({ from: role.id, to: role.reject, segment: (i - target + 1) * perRole });
  }

  const worst = rejectEdges.reduce((sum, edge) => sum + flow.reject.limit * edge.segment, base);
  return { base, worst, perRole, syncBacks, rejectEdges };
}
