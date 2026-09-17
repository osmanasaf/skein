import { rename, writeFile } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { stringify } from "yaml";
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
export function toYaml(draft: FlowDraft): string {
  const doc: Record<string, unknown> = { name: draft.name };
  if (draft.description !== undefined && draft.description.trim() !== "") {
    doc["description"] = draft.description;
  }
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
  if (draft.gates !== undefined && draft.gates.length > 0) doc["gates"] = draft.gates;
  if (draft.reject !== undefined) doc["reject"] = draft.reject;
  if (draft.audit !== undefined) doc["audit"] = draft.audit;

  return `${stringify(doc, { lineWidth: 0 })}`;
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
  const yaml = toYaml(draft);
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
