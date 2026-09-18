import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { LAYER_MARK } from "../prompt/assemble.js";

/** `next: done` — zinciri kapatan değer. */
export const DONE = "done";

/** Parmak izine giren varsayılan alanlar; akış yazmadıysa bunlar kullanılır. */
const DEFAULT_FINGERPRINT = ["task", "recipients", "commit", "draft"];

const DEFAULT_REJECT_LIMIT = 2;

export type Receive = "task" | "batch";
export type GateType = "approval" | "none";

/**
 * Rule 8'in ihtiyaç duyduğu yüzey. `AdapterRegistry` bunu karşılar; test ve
 * `flow check` gibi kullanımlar adaptör örneklemeden doğrulama yapabilsin
 * diye arayüz olarak duruyor.
 */
export interface ProviderSet {
  has(id: string): boolean;
  ids(): string[];
}

export interface FlowRole {
  id: string;
  provider: string;
  /** "main" ya da worktree adı. */
  workspace: string;
  /** Mutlak yol; akış dosyasına göre çözülmüş. */
  promptPath: string;
  receive: Receive;
  /** Sonraki rolün id'si ya da `DONE`. */
  next: string;
  syncBack: string[];
  /**
   * Ret hâlinde kartın döneceği rol. Yükleme sırasında çözülür: akış
   * yazmadıysa gönderen. Zincirin başında `null` — geri dönecek rol yok.
   */
  reject: string | null;
  /**
   * Hedef akışta açıkça yazılı mıydı, yoksa gönderenden mi türetildi.
   *
   * Yalnızca raporlama için: `hash` çözülmüş hedefi kullanır, bu yüzden
   * varsayılanı açıkça yazmak yolda olan kartların topolojisini bozmaz.
   */
  rejectExplicit: boolean;
}

export interface FlowGate {
  after: string;
  type: GateType;
  message?: string;
}

export interface RejectPolicy {
  /** Aynı kenarda üst üste en fazla kaç ret. */
  limit: number;
  /** Limit dolunca ne olur. Şimdilik tek değer: kart insan kapısında bekler. */
  onExhausted: "gate";
}

export interface AuditPolicy {
  enabled: boolean;
  fingerprint: string[];
}

/**
 * Planlama politikası — `PLANLAMA.md`'nin 6a aşaması.
 *
 * Bugün taşıdığı tek şey: planı kimin yazacağı ve nereye. Alışveriş (itiraz
 * turları) 6b'de gelecek; o gelene kadar `tur` ve `ilk-tur-kor` alanları
 * AÇIKÇA reddediliyor. Sessizce yok saymak, akış dosyasına yazılmış ama
 * hiçbir şey yapmayan bir alan bırakırdı — `audit.enabled`'ın bir dönem
 * yaptığı ve bir kez yakalanan hata bu.
 */
export interface PlanPolicy {
  /**
   * Planlamaya katılan roller, zincir sırasında. İlki planı YAZAR;
   * sonrakiler itiraz eder. 6b'de en fazla iki.
   */
  katilimcilar: string[];
  /** Plan dosyasının yolu; `{kart}` kart kimliğiyle değişir. */
  plan: string;
  /** İtiraz→cevap döngüsü sayısı üst sınırı. 6b'de 1. */
  tur: number;
  /** İtiraz dosyasının yolu; plan yolundan türetilir. */
  itiraz: string;
}

export interface Flow {
  name: string;
  description?: string;
  /** Mutlak yollar, sıra anlamlı. */
  constitution: string[];
  /** Zincir sırasında — tanım dosyasındaki sırada değil. */
  roles: FlowRole[];
  /** `roles` ile aynı sıradaki id listesi. */
  order: string[];
  gates: FlowGate[];
  reject: RejectPolicy;
  audit: AuditPolicy;
  /** Planlama politikası; akış tanımlamadıysa yok. */
  plan?: PlanPolicy;
  /**
   * Topolojinin SHA-256'sı. Koşan bir kart bunu yanında taşır: akış dosyası
   * değişse bile kartın hangi topolojiyle koştuğu sonradan bilinebilir.
   */
  hash: string;
  path: string;
}

export interface LoadOptions {
  /**
   * Yolların dışına çıkamayacağı kök. Çözülmüş her prompt yolu bunun
   * altında kalmak zorunda.
   */
  root: string;
  providers: ProviderSet;
  /**
   * İçerik dosyadan değil buradan okunur.
   *
   * Ekrandan kurulan bir TASLAĞI, dosyaya yazmadan doğrulamak için.
   * `path` yine de gerekli ve gerçek olmalı: göreli prompt yolları ona göre
   * çözülüyor, yani taslak da gerçek dosyayla aynı dizindeymiş gibi
   * doğrulanıyor. Geçici bir dosyaya yazıp doğrulamak aynı şeyi vermezdi.
   */
  text?: string;
}

export class FlowError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "FlowError";
  }
}

/**
 * Hata metnini SCHEMA.md'deki kural numarasına bağlar.
 *
 * Numara taşımanın sebebi: bir akış reddedildiğinde hangi kuralın çiğnendiği
 * belgeden aranabilsin. "Geçersiz akış" mesajı, kuralı olmayan bir sistemden
 * farksızdır.
 */
function rule(n: number, message: string): string {
  return `[kural ${n}] ${message}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(doc: Record<string, unknown>, field: string, file: string): string {
  const value = doc[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new FlowError(file, `zorunlu alan eksik ya da metin değil: \`${field}\``);
  }
  return value.trim();
}

function optionalStringList(value: unknown, field: string, file: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new FlowError(file, `\`${field}\` metin dizisi olmalı`);
  }
  return value.map((v) => v.trim());
}

/**
 * Akış dosyasına göre bir yol çözer ve kökün içinde kaldığını doğrular.
 *
 * `../` serbest: gönderilen akışlar `hub/flows/`'tan `java-kit/`'e bu şekilde
 * uzanıyor ve bu kasıtlı — anayasa maddeleri ile rol tanımları aynı dizinde
 * durmak zorunda değil. Yasak olan, deponun dışına çıkmak.
 */
function resolveInside(fromDir: string, root: string, raw: string, label: string, file: string): string {
  if (isAbsolute(raw)) {
    throw new FlowError(file, `\`${label}\` mutlak yol olamaz: ${raw}`);
  }
  const abs = resolve(fromDir, raw);
  const rel = relative(root, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new FlowError(file, `\`${label}\` kök dizinin dışına çıkıyor: ${raw}`);
  }
  return abs;
}

/** Hash'e giren biçim: kökten POSIX ayracıyla relatif. Makineden bağımsız. */
function hashPath(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

/**
 * Kural 9-11: dosya var mı, boş mu, katman sınırı işareti taşıyor mu.
 *
 * Aynı üç kontrol prompt derlenirken `assemblePrompt` içinde tekrarlanır.
 * Kasıtlı: akış yüklenirken hata vermek ucuz, ajan çağrıldıktan sonra pahalı.
 */
async function checkPromptFile(path: string, label: string, ruleNo: number, file: string): Promise<void> {
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch {
    throw new FlowError(file, rule(ruleNo, `\`${label}\` dosyası okunamadı: ${path}`));
  }
  if (body.trim() === "") {
    throw new FlowError(
      file,
      rule(ruleNo, `\`${label}\` dosyası boş: ${path}. Sessizce etkisiz kalan katman, olmayandan kötüdür.`),
    );
  }
  if (body.includes(LAYER_MARK)) {
    throw new FlowError(
      file,
      rule(11, `\`${label}\` katman sınırı işareti (${LAYER_MARK}) içeriyor: ${path}. ` +
        `Bir prompt kendi sınırlarını uyduramaz.`),
    );
  }
}

interface RawRole {
  id: string;
  provider: string;
  workspace: string;
  promptRaw: string;
  receive: Receive;
  next: string;
  syncBack: string[];
  /** Akışta yazılı hali; yazılmadıysa undefined. Çözülmüş hali sonra. */
  rejectRaw: string | undefined;
}

function parseRoles(doc: Record<string, unknown>, file: string): RawRole[] {
  const raw = doc["roles"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new FlowError(file, "`roles` boş olmayan bir liste olmalı");
  }
  return raw.map((entry, i) => {
    const role = asRecord(entry);
    if (!role) throw new FlowError(file, `\`roles[${i}]\` bir eşleme olmalı`);

    const id = requireString(role, "id", file);
    const receiveRaw = role["receive"] ?? "task";
    if (receiveRaw !== "task" && receiveRaw !== "batch") {
      throw new FlowError(file, `\`${id}.receive\` yalnızca \`task\` ya da \`batch\` olabilir`);
    }
    const rejectRaw = role["reject"];
    if (rejectRaw !== undefined && (typeof rejectRaw !== "string" || rejectRaw.trim() === "")) {
      throw new FlowError(file, `\`${id}.reject\` metin olmalı`);
    }

    return {
      id,
      provider: requireString(role, "provider", file),
      workspace: requireString(role, "workspace", file),
      promptRaw: requireString(role, "prompt", file),
      receive: receiveRaw,
      next: requireString(role, "next", file),
      syncBack: optionalStringList(role["syncBack"], `${id}.syncBack`, file),
      rejectRaw: rejectRaw === undefined ? undefined : (rejectRaw as string).trim(),
    };
  });
}

function parseGates(doc: Record<string, unknown>, file: string): FlowGate[] {
  const raw = doc["gates"];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new FlowError(file, "`gates` bir liste olmalı");
  return raw.map((entry, i) => {
    const gate = asRecord(entry);
    if (!gate) throw new FlowError(file, `\`gates[${i}]\` bir eşleme olmalı`);
    const after = requireString(gate, "after", file);
    const type = gate["type"] ?? "approval";
    if (type !== "approval" && type !== "none") {
      throw new FlowError(file, `\`gates[${i}].type\` yalnızca \`approval\` ya da \`none\` olabilir`);
    }
    const message = gate["message"];
    if (message !== undefined && typeof message !== "string") {
      throw new FlowError(file, `\`gates[${i}].message\` metin olmalı`);
    }
    return message === undefined
      ? { after, type }
      : { after, type, message: message.trim() };
  });
}

function parseRejectPolicy(doc: Record<string, unknown>, file: string): RejectPolicy {
  const raw = asRecord(doc["reject"]);
  if (doc["reject"] !== undefined && doc["reject"] !== null && !raw) {
    throw new FlowError(file, "`reject` bir eşleme olmalı");
  }
  const limit = raw?.["limit"] ?? DEFAULT_REJECT_LIMIT;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    throw new FlowError(file, rule(15, `\`reject.limit\` en az 1 olan bir tamsayı olmalı: ${String(limit)}`));
  }
  const onExhausted = raw?.["onExhausted"] ?? "gate";
  if (onExhausted !== "gate") {
    throw new FlowError(
      file,
      `\`reject.onExhausted\` yalnızca \`gate\` olabilir: ${String(onExhausted)}. ` +
        `Limit dolunca sessizce kabul de, sessizce durmak da yasak — anlaşmazlık insana çıkar.`,
    );
  }
  return { limit, onExhausted };
}

/**
 * `planlama` bloğu — kural 17-20.
 *
 * `order` zincir sırası; katılımcıların zincirin BAŞINDA olması buradan
 * doğrulanıyor: plan, iş yapıldıktan sonra tartışılmaz.
 */
function parsePlan(
  doc: Record<string, unknown>,
  order: string[],
  ids: Set<string>,
  file: string,
): PlanPolicy | null {
  const raw = asRecord(doc["planlama"]);
  if (doc["planlama"] === undefined || doc["planlama"] === null) return null;
  if (!raw) throw new FlowError(file, "`planlama` bir eşleme olmalı");

  // Körleme iki katılımcıda zaten etkisiz: itiraz eden tek rol var, kimsenin
  // görmeyeceği bir itiraz yok. Anlam kazandığı yer üç ve fazlası, yani 6c.
  // Varsayılan `true` atıl; AÇIKÇA kapatmak reddediliyor ki kapatılmış
  // sanılan bir körleme diye bir şey olmasın.
  if (raw["ilk-tur-kor"] === false) {
    throw new FlowError(
      file,
      rule(18, "`planlama.ilk-tur-kor: false` henüz uygulanmadı. İki katılımcıda " +
        "körlemenin etkisi yok (itiraz eden tek rol var); anlam kazandığı yer üç " +
        "ve fazlası, yani 6c (bkz. PLANLAMA.md)."),
    );
  }
  if (raw["ilk-tur-kor"] !== undefined && raw["ilk-tur-kor"] !== true) {
    throw new FlowError(file, rule(18, "`planlama.ilk-tur-kor` mantıksal değer olmalı"));
  }

  const turRaw = raw["tur"] ?? 1;
  if (typeof turRaw !== "number" || !Number.isInteger(turRaw) || turRaw < 1 || turRaw > 5) {
    throw new FlowError(file, rule(18, `\`planlama.tur\` 1 ile 5 arasında bir tamsayı olmalı: ${String(turRaw)}`));
  }
  if (turRaw > 1) {
    throw new FlowError(
      file,
      rule(18, `\`planlama.tur\` bugün yalnızca 1 olabilir; ${turRaw} verildi. ` +
        `Çok turlu alışveriş, tur sayacı ve kilit kapısı 6c'nin konusu ` +
        `(bkz. PLANLAMA.md). Alanı yazıp hiçbir şey yapmamasındansa reddetmek ` +
        `doğru: akışta duran ama işlemeyen bir alan, çalıştığı sanılan bir alandır.`),
    );
  }

  const katilimcilar = optionalStringList(raw["katilimcilar"], "planlama.katilimcilar", file);
  if (katilimcilar.length === 0) {
    throw new FlowError(file, rule(17, "`planlama.katilimcilar` boş olamaz"));
  }
  if (new Set(katilimcilar).size !== katilimcilar.length) {
    throw new FlowError(file, rule(17, "`planlama.katilimcilar` aynı rolü iki kez sayamaz"));
  }
  if (katilimcilar.length > 2) {
    throw new FlowError(
      file,
      rule(17, `\`planlama.katilimcilar\` bugün en fazla iki rol alabilir; ${katilimcilar.length} verildi. ` +
        `Üç ve fazlası körlemeyi anlamlı kılar ve tur sayacı gerektirir — 6c'nin konusu ` +
        `(bkz. PLANLAMA.md).`),
    );
  }
  for (const id of katilimcilar) {
    if (!ids.has(id)) {
      throw new FlowError(file, rule(17, `\`planlama.katilimcilar\` var olmayan bir role işaret ediyor: ${id}`));
    }
  }

  // --- kural 19: zincirin başında ve ardışık ---
  for (const [i, id] of katilimcilar.entries()) {
    if (order[i] !== id) {
      throw new FlowError(
        file,
        rule(19, `\`planlama.katilimcilar\` zincirin başında ve zincir sırasında olmalı: ` +
          `${i + 1}. sırada \`${order[i] ?? "(yok)"}\` var, \`${id}\` yazılmış. ` +
          `Plan, iş yapıldıktan sonra tartışılmaz.`),
      );
    }
  }

  // --- kural 20: plan yolu ---
  const plan = raw["plan"];
  if (typeof plan !== "string" || plan.trim() === "") {
    throw new FlowError(file, rule(20, "`planlama.plan` boş olmayan bir yol olmalı"));
  }
  const yol = plan.trim();
  if (yol.startsWith("/") || yol.includes("..")) {
    throw new FlowError(file, rule(20, `\`planlama.plan\` depo içinde kalmalı: ${yol}`));
  }
  if (yol.startsWith("src/")) {
    throw new FlowError(
      file,
      rule(20, `\`planlama.plan\` \`src/\` altında olamaz: ${yol}. Plan bir belge; ` +
        `kod taşıma yolu git, dosya değil.`),
    );
  }
  if (!yol.includes("{kart}")) {
    throw new FlowError(
      file,
      rule(20, `\`planlama.plan\` \`{kart}\` içermeli: ${yol}. İçermezse iki kart ` +
        `aynı dosyayı ezer ve ikincisi birincisinin planını okur.`),
    );
  }

  // İtiraz dosyası plan yolundan türetiliyor: iki yol iki alan demek ve
  // ikisinin ayrı ayrı doğru yazılması gerekirdi. Tek alan, tek hata yüzeyi.
  const itiraz = yol.replace(/\.md$/u, "") + ".itiraz.md";

  return { katilimcilar, plan: yol, tur: turRaw, itiraz };
}

function parseAudit(doc: Record<string, unknown>, file: string): AuditPolicy {
  const raw = asRecord(doc["audit"]);
  if (doc["audit"] !== undefined && doc["audit"] !== null && !raw) {
    throw new FlowError(file, "`audit` bir eşleme olmalı");
  }
  const enabled = raw?.["enabled"] ?? true;
  if (typeof enabled !== "boolean") {
    throw new FlowError(file, "`audit.enabled` mantıksal değer olmalı");
  }
  const fingerprint = raw?.["fingerprint"] === undefined
    ? DEFAULT_FINGERPRINT
    : optionalStringList(raw["fingerprint"], "audit.fingerprint", file);
  if (enabled && fingerprint.length === 0) {
    throw new FlowError(file, "`audit.fingerprint` boş olamaz — parmak izi olmadan kapı yoktur");
  }
  return { enabled, fingerprint };
}

/**
 * Zincir sırasını hesaplar ve kural 3-5'i uygular.
 *
 * Sıra tanım dosyasından değil `next` bağlarından gelir: rollerin YAML'daki
 * yeri anlamsız olmalı, yoksa aynı topoloji iki farklı sırayla yazıldığında
 * iki farklı şey gibi görünür.
 */
function chainOrder(roles: RawRole[], file: string): string[] {
  const ids = new Set(roles.map((r) => r.id));
  const byId = new Map(roles.map((r) => [r.id, r]));

  for (const role of roles) {
    if (role.next !== DONE && !ids.has(role.next)) {
      throw new FlowError(file, rule(3, `\`${role.id}.next\` var olmayan bir role işaret ediyor: ${role.next}`));
    }
  }

  const finishers = roles.filter((r) => r.next === DONE).map((r) => r.id);
  if (finishers.length !== 1) {
    throw new FlowError(
      file,
      rule(4, `tam olarak bir rolün \`next\` değeri \`done\` olmalı; ${finishers.length} tane var` +
        (finishers.length > 1 ? `: ${finishers.join(", ")}` : "")),
    );
  }

  const incoming = new Set(roles.filter((r) => r.next !== DONE).map((r) => r.next));
  const heads = roles.filter((r) => !incoming.has(r.id)).map((r) => r.id);
  if (heads.length !== 1) {
    throw new FlowError(
      file,
      rule(5, heads.length === 0
        ? "zincirin başı yok — roller döngü oluşturuyor"
        : `zincir tek parça değil; birden fazla başlangıç var: ${heads.join(", ")}`),
    );
  }

  const order: string[] = [];
  const seen = new Set<string>();
  let cursor = heads[0] as string;
  while (cursor !== DONE) {
    if (seen.has(cursor)) {
      throw new FlowError(file, rule(5, `\`next\` zincirinde döngü var: ${cursor}`));
    }
    seen.add(cursor);
    order.push(cursor);
    cursor = (byId.get(cursor) as RawRole).next;
  }

  if (order.length !== roles.length) {
    const stranded = roles.filter((r) => !seen.has(r.id)).map((r) => r.id);
    throw new FlowError(
      file,
      rule(5, `zincire bağlı olmayan rol(ler) var — \`done\`'a ulaşamıyorlar: ${stranded.join(", ")}`),
    );
  }
  return order;
}

/**
 * Bir akış tanımını yükler, SCHEMA.md'deki 16 kuralı uygular ve topolojinin
 * hash'ini hesaplar.
 *
 * İhlalde akış hiç başlamaz. Yarı çalışan bir topoloji, çalışmayandan
 * pahalıdır: ajanlar uyandırılır, para harcanır, sonra kartın nereye
 * gideceği belirsiz kalır.
 */
export async function loadFlow(path: string, options: LoadOptions): Promise<Flow> {
  const flowPath = resolve(path);
  const flowDir = dirname(flowPath);
  const root = resolve(options.root);
  const file = basename(flowPath);

  let parsed: unknown;
  try {
    parsed = parseYaml(options.text ?? (await readFile(flowPath, "utf8")));
  } catch (cause) {
    throw new FlowError(file, `okunamadı ya da geçerli YAML değil: ${(cause as Error).message}`);
  }
  const doc = asRecord(parsed);
  if (!doc) throw new FlowError(file, "kök öğe bir eşleme (mapping) olmalı");

  const name = requireString(doc, "name", file);
  const description = doc["description"];
  if (description !== undefined && typeof description !== "string") {
    throw new FlowError(file, "`description` metin olmalı");
  }

  const roles = parseRoles(doc, file);

  // --- kural 1: id tekil ---
  const dupIds = roles.map((r) => r.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (dupIds.length > 0) {
    throw new FlowError(file, rule(1, `yinelenen rol id'si: ${[...new Set(dupIds)].join(", ")}`));
  }

  // --- kural 2: tam olarak bir main ---
  const mains = roles.filter((r) => r.workspace === "main").map((r) => r.id);
  if (mains.length !== 1) {
    throw new FlowError(
      file,
      rule(2, `tam olarak bir rolün \`workspace\` değeri \`main\` olmalı; ${mains.length} tane var` +
        (mains.length > 1 ? `: ${mains.join(", ")}` : "")),
    );
  }

  // --- kural 16: iki rol aynı worktree'yi paylaşamaz ---
  // Şemada 15 kural vardı; bu on altıncısı. Paylaşılan worktree, izolasyonu
  // sessizce yok eder: iki ajan aynı ağaçta çalışır ve birbirinin
  // değişikliğini ezer. Rol kopyalayıp `workspace` satırını değiştirmeyi
  // unutmak, topolojiyi büyütürken yapılacak en kolay hata.
  const dupWs = roles.map((r) => r.workspace).filter((w, i, all) => all.indexOf(w) !== i);
  if (dupWs.length > 0) {
    throw new FlowError(
      file,
      rule(16, `iki rol aynı \`workspace\` değerini paylaşamaz: ${[...new Set(dupWs)].join(", ")}`),
    );
  }

  // --- kural 3, 4, 5: zincir ---
  const order = chainOrder(roles, file);
  const indexOf = new Map(order.map((id, i) => [id, i]));
  const byId = new Map(roles.map((r) => [r.id, r]));
  const ids = new Set(order);

  // --- kural 6: syncBack yalnızca geriye ---
  for (const role of roles) {
    for (const target of role.syncBack) {
      if (!ids.has(target)) {
        throw new FlowError(file, rule(6, `\`${role.id}.syncBack\` var olmayan bir role işaret ediyor: ${target}`));
      }
      if ((indexOf.get(target) as number) >= (indexOf.get(role.id) as number)) {
        throw new FlowError(
          file,
          rule(6, `\`${role.id}.syncBack\` yalnızca zincirde daha önce gelen role işaret edebilir: ${target}`),
        );
      }
    }
  }

  // --- kural 7: gates.after var olan rol ---
  const gates = parseGates(doc, file);
  for (const gate of gates) {
    if (!ids.has(gate.after)) {
      throw new FlowError(file, rule(7, `\`gates.after\` var olmayan bir role işaret ediyor: ${gate.after}`));
    }
  }

  // --- kural 8: provider kayıtlı ---
  for (const role of roles) {
    if (!options.providers.has(role.provider)) {
      const known = options.providers.ids();
      throw new FlowError(
        file,
        rule(8, `\`${role.id}.provider\` kayıtlı bir adaptöre karşılık gelmiyor: ${role.provider}. ` +
          `Kayıtlı olanlar: ${known.length > 0 ? known.join(", ") : "(hiçbiri)"}`),
      );
    }
  }

  // --- kural 10, 11: anayasa katmanları ---
  const constitutionRaw = optionalStringList(doc["constitution"], "constitution", file);
  const seenConstitution = new Set<string>();
  const constitution: string[] = [];
  for (const raw of constitutionRaw) {
    const abs = resolveInside(flowDir, root, raw, "constitution", file);
    if (seenConstitution.has(abs)) {
      throw new FlowError(file, rule(10, `aynı anayasa dosyası iki kez verildi: ${raw}`));
    }
    seenConstitution.add(abs);
    await checkPromptFile(abs, "constitution", 10, file);
    constitution.push(abs);
  }

  // --- kural 9, 11: rol promptları ---
  const promptPaths = new Map<string, string>();
  for (const role of roles) {
    const abs = resolveInside(flowDir, root, role.promptRaw, `${role.id}.prompt`, file);
    await checkPromptFile(abs, `${role.id}.prompt`, 9, file);
    promptPaths.set(role.id, abs);
  }

  // --- kural 12, 13, 14: ret hedefi ---
  const rejectPolicy = parseRejectPolicy(doc, file);
  const rejectOf = new Map<string, string | null>();
  for (const [i, id] of order.entries()) {
    const role = byId.get(id) as RawRole;
    const sender = i === 0 ? null : (order[i - 1] as string);

    if (role.rejectRaw === undefined) {
      rejectOf.set(id, sender);
      continue;
    }
    if (sender === null) {
      throw new FlowError(
        file,
        rule(14, `zincirin başı \`${id}\` \`reject\` taşıyamaz — geri dönecek rol yok. ` +
          `O rol işi yapamıyorsa insana çıkar.`),
      );
    }
    if (role.rejectRaw === id) {
      throw new FlowError(file, rule(12, `\`${id}.reject\` rolün kendisine işaret edemez`));
    }
    if (!ids.has(role.rejectRaw)) {
      throw new FlowError(
        file,
        rule(12, `\`${id}.reject\` var olmayan bir role işaret ediyor: ${role.rejectRaw}`),
      );
    }
    if ((indexOf.get(role.rejectRaw) as number) >= i) {
      throw new FlowError(
        file,
        rule(13, `\`${id}.reject\` yalnızca zincirde daha önce gelen role işaret edebilir: ` +
          `${role.rejectRaw}. Ret ileri sıçrayamaz.`),
      );
    }
    rejectOf.set(id, role.rejectRaw);
  }

  const audit = parseAudit(doc, file);

  const ordered: FlowRole[] = order.map((id) => {
    const role = byId.get(id) as RawRole;
    return {
      id,
      provider: role.provider,
      workspace: role.workspace,
      promptPath: promptPaths.get(id) as string,
      receive: role.receive,
      next: role.next,
      syncBack: role.syncBack,
      reject: rejectOf.get(id) ?? null,
      rejectExplicit: role.rejectRaw !== undefined,
    };
  });

  const plan = parsePlan(doc, order, ids, file);

  // --- kural 21: katılımcıya kapı konamaz ---
  //
  // Alışveriş sırasında kart katılımcılar arasında `planTurn` ile dolaşıyor
  // ve o yol kapı kontrolünden GEÇMİYOR. Yani katılımcıya konmuş bir kapı
  // hiç ateşlenmez: akış dosyasında duran ama işlemeyen bir insan kapısı,
  // çalıştığı sanılan bir kapıdır ve en kötü sessiz arıza türüdür.
  if (plan !== null) {
    for (const gate of gates) {
      if (plan.katilimcilar.includes(gate.after)) {
        throw new FlowError(
          file,
          rule(21, `\`gates\` planlama katılımcısına konamaz: \`${gate.after}\`. ` +
            `Alışveriş sırasında kart kapı kontrolünden geçmiyor, yani bu kapı hiç ` +
            `ateşlenmez. Planın insan onayı 6c'nin konusu (bkz. PLANLAMA.md); ` +
            `bugün kapıyı planlamadan SONRAKİ bir role koy.`),
        );
      }
    }
  }

  const hash = topologyHash({
    root, name, constitution, roles: ordered, gates, reject: rejectPolicy, audit,
    ...(plan === null ? {} : { plan }),
  });

  return {
    name,
    ...(typeof description === "string" ? { description } : {}),
    constitution,
    roles: ordered,
    order,
    gates,
    reject: rejectPolicy,
    audit,
    ...(plan === null ? {} : { plan }),
    hash,
    path: flowPath,
  };
}

/**
 * Topolojinin kanonik hash'i.
 *
 * `description` ve kapı mesajları KASITLI olarak dışarıda: ikisi de insana
 * yazılmış düzyazı, davranışı değiştirmez. Bir yazım düzeltmesi, yolda olan
 * kartların topolojisini geçersiz kılmamalı.
 *
 * Prompt dosyalarının İÇERİĞİ de dışarıda — o `assemblePrompt`'un hash'inin
 * işi. Burası "kart hangi yoldan geçti" sorusunu yanıtlar, "ajana ne söylendi"
 * sorusunu değil. İkisi ayrı kaydedilir ki biri değiştiğinde hangisi olduğu
 * bilinsin.
 */
function topologyHash(input: {
  root: string;
  name: string;
  constitution: string[];
  roles: FlowRole[];
  gates: FlowGate[];
  reject: RejectPolicy;
  audit: AuditPolicy;
  plan?: PlanPolicy;
}): string {
  const F = " "; // alan ayracı
  const L = ""; // satır ayracı
  const M = ""; // liste ayracı
  const rel = (p: string) => hashPath(input.root, p);

  const lines: string[] = [
    ["name", input.name].join(F),
    ["constitution", input.constitution.map(rel).join(M)].join(F),
  ];
  for (const role of input.roles) {
    lines.push(
      ["role", role.id, role.provider, role.workspace, rel(role.promptPath), role.receive,
        role.next, role.syncBack.join(M), role.reject ?? ""].join(F),
    );
  }
  for (const gate of input.gates) {
    lines.push(["gate", gate.after, gate.type].join(F));
  }
  lines.push(["reject", String(input.reject.limit), input.reject.onExhausted].join(F));
  lines.push(["audit", String(input.audit.enabled), input.audit.fingerprint.join(M)].join(F));
  // Plan politikası hash'e giriyor: planın yolu ve yazarı, kartın hangi
  // topolojiden geçtiğinin parçası. Değişirse yoldaki kart eskisiyle yaşar.
  if (input.plan !== undefined) {
    lines.push(["plan", input.plan.katilimcilar.join(M), input.plan.plan].join(F));
  }

  return createHash("sha256").update(lines.join(L), "utf8").digest("hex");
}

/** `hub/flows/<name>.yaml` kısayolu. */
export function flowPath(root: string, name: string): string {
  return join(root, "hub", "flows", `${name}.yaml`);
}
