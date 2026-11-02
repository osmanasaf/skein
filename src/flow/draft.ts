import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { parseDocument, stringify } from "yaml";
import { estimateCost, type CostEstimate } from "./cost.js";
import { loadFlow, type Flow, type LoadOptions } from "./load.js";

/**
 * Ekrandan kurulan akış taslağı.
 *
 * Şeklen `hub/flows/*.yaml` ile aynı — çünkü ekranın ürettiği şey tam olarak
 * o dosya. Ayrı bir "ekran biçimi" olsaydı, iki temsil arasında sürüklenme
 * kaçınılmazdı ve akış dosyası tek doğruluk kaynağı olmaktan çıkardı.
 */
export interface FlowDraft {
  name: string;
  description?: string;
  constitution: string[];
  roles: DraftRole[];
  gates?: { after: string; type: string; message?: string }[];
  reject?: { limit?: number; onExhausted?: string };
  audit?: { enabled?: boolean; fingerprint?: string[] };
}

export interface DraftRole {
  id: string;
  provider: string;
  workspace: string;
  prompt: string;
  receive?: string;
  next: string;
  syncBack?: string[];
  reject?: string;
}

/**
 * Yüklenmiş bir akışın taslak karşılığı — düzenleyicinin başlangıç hâli.
 *
 * İki tuzak burada kapanıyor:
 *
 * 1. **Kapı mesajı.** Dondurulmuş topolojide yok (hash'e girmiyor, düzyazı).
 *    Taslağı oradan kursaydık, ekrandan yapılan ilk kaydetme kapı metnini
 *    sessizce silerdi.
 * 2. **Yol biçimi.** `Flow` mutlak yol taşıyor, YAML ise akış DOSYASINA göre
 *    göreli yol bekliyor. Mutlak yolu olduğu gibi yazmak kural ihlali,
 *    köke göre yazmak ise sessizce yanlış dosyayı gösterirdi.
 */
export function fromFlow(flow: Flow): FlowDraft {
  const dir = dirname(flow.path);
  const goreli = (abs: string): string => {
    const r = relative(dir, abs).split(sep).join("/");
    return r.startsWith(".") ? r : `./${r}`;
  };

  return {
    name: flow.name,
    ...(flow.description === undefined ? {} : { description: flow.description }),
    constitution: flow.constitution.map(goreli),
    roles: flow.roles.map((role) => ({
      id: role.id,
      provider: role.provider,
      workspace: role.workspace,
      prompt: goreli(role.promptPath),
      receive: role.receive,
      next: role.next,
      ...(role.syncBack.length > 0 ? { syncBack: [...role.syncBack] } : {}),
      // Yalnızca AÇIKÇA yazılmış ret hedefi taşınıyor: varsayılanı dosyaya
      // yazmak, "bu kasıtlı" anlamını sulandırırdı.
      ...(role.rejectExplicit && role.reject !== null ? { reject: role.reject } : {}),
    })),
    ...(flow.gates.length > 0 ? { gates: flow.gates.map((g) => ({ ...g })) } : {}),
    reject: { limit: flow.reject.limit, onExhausted: flow.reject.onExhausted },
    audit: { enabled: flow.audit.enabled, fingerprint: [...flow.audit.fingerprint] },
  };
}

export type DraftCheck =
  | { ok: true; yaml: string; hash: string; cost: CostEstimate }
  | { ok: false; yaml: string; message: string };

/**
 * Taslağı YAML'a çevirir.
 *
 * Boş alanlar yazılmıyor: varsayılanı olan bir alanı açıkça yazmak, akış
 * dosyasını okunmaz yapardı ve `reject: coder` gibi satırların "bu kasıtlı"
 * anlamını sulandırırdı.
 */
/**
 * Ekrandan kaydetmek dosyanın GERİ KALANINI bozmuyor.
 *
 * İki ölçülmüş kayıp vardı ve ikisi de aynı kökten: `toYaml` belgeyi düz
 * bir JS nesnesinden sıfırdan kuruyordu.
 *
 * 1. Ekranın modellemediği BLOKLAR düşüyordu — `planlama`, `denetci`
 *    dahil. Blok isteğe bağlı olduğu için akış hâlâ geçerli doğruluyordu,
 *    yani kayıp hiçbir yere yazılmıyordu.
 * 2. Bütün YORUMLAR düşüyordu: `plan4.yaml` için ölçüldü, 96 satır / 34
 *    yorum satırı → 55 satır / 0 yorum. Gerekçeler bu projede kodun
 *    yarısı; "ilk-tur-kor: true  # ÖLÇÜMÜN KENDİSİ" satırının yorumu
 *    silindiğinde kalan şey anlamını kaybediyor.
 *
 * Çare ikisini birden kapatıyor: dosya varsa `parseDocument` ile BELGE
 * olarak okunuyor ve yalnızca ekranın modellediği anahtarlar yerinde
 * değiştiriliyor. Dokunulmayan her şey — yorumlar, `planlama`, gelecekte
 * eklenecek bloklar — aynen kalıyor.
 *
 * Kalan sınır yazılı: rol listesi bütün olarak değiştiği için ROL
 * İÇİNDEKİ yorumlar korunmuyor. Belgenin başlığındaki ve dokunulmayan
 * blokların içindeki yorumlar korunuyor.
 */
export function toYaml(draft: FlowDraft, mevcut?: string): string {
  const alanlar = draftAlanlari(draft);
  if (mevcut !== undefined && mevcut.trim() !== "") {
    try {
      const belge = parseDocument(mevcut);
      // Bozuk bir dosyadan düzenleme taşımak, bozukluğu yeni dosyaya
      // taşımak olurdu: o hâlde sıfırdan kuruluyor.
      if (belge.errors.length === 0 && belge.contents !== null) {
        for (const [ad, deger] of Object.entries(alanlar)) {
          if (deger === undefined) belge.delete(ad);
          else belge.set(ad, deger);
        }
        return belge.toString({ lineWidth: 0 });
      }
    } catch {
      // düşerse sıfırdan kur
    }
  }
  const doc: Record<string, unknown> = {};
  for (const [ad, deger] of Object.entries(alanlar)) {
    if (deger !== undefined) doc[ad] = deger;
  }
  return `${stringify(doc, { lineWidth: 0 })}`;
}

/** Ekranın MODELLEDİĞİ anahtarlar; `undefined` = dosyadan silinecek. */
function draftAlanlari(draft: FlowDraft): Record<string, unknown> {
  const doc: Record<string, unknown> = { name: draft.name };
  doc["description"] = draft.description !== undefined && draft.description.trim() !== ""
    ? draft.description
    : undefined;
  doc["constitution"] = draft.constitution;
  doc["roles"] = draft.roles.map((role) => {
    const out: Record<string, unknown> = {
      id: role.id,
      provider: role.provider,
      workspace: role.workspace,
      prompt: role.prompt,
    };
    if (role.receive !== undefined && role.receive !== "") out["receive"] = role.receive;
    if (role.syncBack !== undefined && role.syncBack.length > 0) out["syncBack"] = role.syncBack;
    if (role.reject !== undefined && role.reject !== "") out["reject"] = role.reject;
    out["next"] = role.next;
    return out;
  });
  doc["gates"] = draft.gates !== undefined && draft.gates.length > 0 ? draft.gates : undefined;
  doc["reject"] = draft.reject;
  doc["audit"] = draft.audit;
  return doc;
}

/**
 * Taslağı DOSYAYA YAZMADAN doğrular ve maliyetini hesaplar.
 *
 * Doğrulama gerçek yükleyiciden geçiyor — ekrana ayrı bir kural kopyası
 * yazmak, iki kural kümesinin ayrışmasıyla biterdi. Kural numaraları da
 * kullanıcıya aynen gidiyor.
 */
export async function checkDraft(
  path: string,
  draft: FlowDraft,
  options: LoadOptions,
): Promise<DraftCheck> {
  const mevcut = await readFile(path, "utf8").catch(() => undefined);
  const yaml = toYaml(draft, mevcut);
  try {
    const flow = await loadFlow(path, { ...options, text: yaml });
    return { ok: true, yaml, hash: flow.hash, cost: estimateCost(flow) };
  } catch (error) {
    return { ok: false, yaml, message: (error as Error).message };
  }
}

export type WriteResult =
  | { ok: true; yaml: string; hash: string }
  | { ok: false; message: string };

/**
 * Geçerli bir taslağı dosyaya yazar.
 *
 * İki kural:
 *
 * 1. **Geçersiz taslak yazılmaz.** Ekranın ürettiği dosyayı gözcü de okuyor;
 *    bozuk bir YAML yazmak, çalışan bir sistemi ekrandan bozmak olurdu.
 * 2. **Yazma atomik.** Önce yan dosyaya, sonra `rename`. Gözcü her geçişte
 *    bu dosyayı okuyor ve yarı yazılmış bir hâli görmemeli.
 */
export async function writeDraft(
  path: string,
  draft: FlowDraft,
  options: LoadOptions,
): Promise<WriteResult> {
  const check = await checkDraft(path, draft, options);
  if (!check.ok) return { ok: false, message: check.message };

  const tmp = `${path}.yaziliyor`;
  await writeFile(tmp, check.yaml, "utf8");
  await rename(tmp, path);
  return { ok: true, yaml: check.yaml, hash: check.hash };
}
