import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Adapter, InvokeResult } from "../adapters/contract.js";
import { assemblePrompt, type PromptLayer } from "../prompt/assemble.js";

export interface JudgeVerdict {
  /** Kancanın adı — kusurun tarifi. */
  hook: string;
  /** Hakemin kararı, alıntı doğrulamasından SONRA. */
  caught: boolean;
  quote?: string;
  /** Hakem alıntı verdi ama raporda birebir bulunamadı. */
  unverified?: boolean;
  reason?: string;
}

export interface JudgeResult {
  verdicts: JudgeVerdict[];
  caught: string[];
  missed: string[];
  /** Doğrulanamayan alıntı yüzünden kaçırma sayılanlar. */
  unverified: string[];
  /** Raporda kaç kimlik ifadesi maskelendi. */
  scrubbed: number;
  promptHash: string;
  invoke: InvokeResult;
}

export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeError";
  }
}

/**
 * Model ve satıcı adları.
 *
 * Denetçinin raporu kendi kimliğini ele verebilir ("Claude olarak…",
 * "GPT-5.5 ile incelendi"). Hakem bunu görürse artık kör değildir ve
 * puanlama, ölçmek istediğimiz şeyin yerine hakemin model tercihini
 * ölçmeye başlar. Liste satıcı adlarını da içeriyor çünkü kimlik genelde
 * model adıyla değil satıcı adıyla sızıyor.
 */
const IDENTITY =
  /\b(claude|anthropic|codex|openai|chatgpt|gpt(?:-[0-9][0-9.]*)?|opus|sonnet|haiku|gemini|llama|mistral|copilot|cursor)\b/gi;

export const MASK = "<model>";

/** Raporu kimliksizleştirir; kaç yerde maskelediğini de söyler. */
export function scrubIdentity(text: string): { text: string; count: number } {
  let count = 0;
  const out = text.replace(IDENTITY, () => {
    count += 1;
    return MASK;
  });
  return { text: out, count };
}

/** Boşluk ve büyük/küçük harf farkını siler; alıntı karşılaştırması için. */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Alıntı raporda gerçekten var mı.
 *
 * Hakemin "yakalandı" demesi tek başına veri değil: model, olmayan bir
 * cümleyi hatırladığını sanabilir ya da kusuru raporun yerine kendi
 * bilgisinden tarif edebilir. Alıntının raporda birebir bulunması, bu iki
 * durumu da makineyle eler — hakeme güvenmek yerine hakemi doğruluyoruz.
 */
export function quoteFound(report: string, quote: string): boolean {
  const q = normalize(quote);
  // Çok kısa alıntı her metinde bulunur ("the", "null") ve doğrulamayı
  // anlamsız kılar.
  if (q.length < 12) return false;
  return normalize(report).includes(q);
}

interface RawVerdict {
  no?: unknown;
  yakalandi?: unknown;
  alinti?: unknown;
  gerekce?: unknown;
}

/**
 * Hakemin çıktısından JSON dizisini çıkarır.
 *
 * Prompt "yalnızca JSON" diyor ama modeller sık sık açıklama cümlesi ya da
 * kod çiti ekliyor. Bunu ayrıştıramamak, pahalı bir denetim hücresini
 * puansız bırakır; o yüzden hem çitli hem çitsiz biçim okunuyor.
 */
export function extractJson(raw: string): RawVerdict[] {
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  const candidates = [...fenced, raw];
  for (const text of candidates) {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed as RawVerdict[];
    } catch {
      continue;
    }
  }
  throw new JudgeError(
    `Hakem çıktısında JSON dizisi yok. İlk 200 karakter: ${raw.trim().slice(0, 200)}`,
  );
}

/**
 * Ham kararları kancalarla eşleştirir ve alıntıları doğrular.
 *
 * Eksik bırakılan kanca kaçırma sayılır: hakem bir kusur hakkında hiçbir
 * şey söylemediyse, o kusurun raporda bulunduğuna dair kanıt yok demektir.
 */
export function applyVerdicts(
  hooks: string[],
  raws: RawVerdict[],
  report: string,
): JudgeVerdict[] {
  return hooks.map((hook, i) => {
    const raw = raws.find((r) => typeof r.no === "number" && r.no === i + 1) ?? raws[i];
    const reason = typeof raw?.gerekce === "string" ? raw.gerekce : undefined;
    const quote = typeof raw?.alinti === "string" ? raw.alinti : undefined;
    const claimed = raw?.yakalandi === true;
    if (!claimed) {
      return { hook, caught: false, ...(reason ? { reason } : {}) };
    }
    const ok = quote !== undefined && quoteFound(report, quote);
    return {
      hook,
      caught: ok,
      ...(quote ? { quote } : {}),
      ...(ok ? {} : { unverified: true }),
      ...(reason ? { reason } : {}),
    };
  });
}

export interface JudgeOptions {
  judge: Adapter;
  /** Hakemin çalışma dizini — rapor ve karar buraya yazılır. */
  workdir: string;
  layers: PromptLayer[];
  timeoutMs: number;
  /** Görev tanımı; hakem kusurun sözlüğünü oradan öğrenir. */
  specPath: string;
  /** Denetçinin raporu, ham hâliyle. Körleme burada yapılır. */
  reportText: string;
  /** Kanıtlanmış kusurlar: kırmızı kancaların adları. */
  redHooks: string[];
}

/**
 * Bir denetim raporunu kanıtlanmış kusurlara karşı puanlar.
 *
 * Ölçmek istediğimiz şey — "kör nokta" — ancak raporun hangi kusuru
 * söylediğinden okunabilir, ve o okuma elle yapılırsa deneyi yapan kişi
 * hangi hücrenin çapraz olduğunu bilerek okur. Bu katman iki şeyi birden
 * sağlıyor: puanlama körlenmiş (hakem kimin yazdığını, kimin incelediğini
 * ve hücrenin çapraz olup olmadığını görmüyor) ve makineyle doğrulanabilir
 * (her yakalama iddiası raporda birebir bulunması gereken bir alıntıya
 * bağlı).
 *
 * Puanlanamayan hücre, kaçırılmış hücre DEĞİLDİR: ayrıştırma başarısız
 * olursa `JudgeError` atılır ve çağıran bunu ölçüm dışı bırakır. Gizli
 * süitin "koşmadı" ile "sıfır kırmızı" ayrımının puanlama tarafındaki
 * karşılığı bu.
 */
export async function judgeReport(options: JudgeOptions): Promise<JudgeResult> {
  const { judge, workdir, layers, timeoutMs, specPath, reportText, redHooks } = options;
  if (redHooks.length === 0) {
    throw new JudgeError("Kırmızı kanca yok — puanlanacak bir şey de yok.");
  }

  const prompt = await assemblePrompt(layers);
  const promptFile = join(workdir, "judge-prompt.txt");
  await writeFile(promptFile, prompt.text);

  const blind = scrubIdentity(reportText);
  await writeFile(join(workdir, "korlenmis-rapor.txt"), blind.text);

  const spec = await readFile(specPath, "utf8");
  const list = redHooks.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const taskText =
    `## Görev tanımı\n\n${spec}\n\n` +
    `## Kanıtlanmış kusurlar\n\n${list}\n\n` +
    `## İnceleme raporu\n\n${blind.text}`;

  const invoke = await judge.invoke({ workdir, promptFile, taskText, timeoutMs });
  const raw = invoke.message ?? invoke.stdout;
  const verdicts = applyVerdicts(redHooks, extractJson(raw), blind.text);

  return {
    verdicts,
    caught: verdicts.filter((v) => v.caught).map((v) => v.hook),
    missed: verdicts.filter((v) => !v.caught).map((v) => v.hook),
    unverified: verdicts.filter((v) => v.unverified === true).map((v) => v.hook),
    scrubbed: blind.count,
    promptHash: prompt.hash,
    invoke,
  };
}
