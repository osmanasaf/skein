import type { SkeinEvent } from "../events/log.js";
import { MIN_REPEATS, NEGATIVE_THRESHOLD, POSITIVE_THRESHOLD, type VerdictCode } from "./effect.js";
import type { Arm } from "./ab.js";

/**
 * Mekanizma eşikleri — `PLANLAMA.md`'nin "Nasıl bileceğiz işe yaradığını"
 * tablosundan, sonuçtan önce ilan edilmiş hâlleriyle.
 *
 * Tabloda beş metrik var ve ikisi ürüne değil MEKANİZMAYA bakıyor. İkisi de
 * hesaplanıp raporda basılıyordu ama KARARA GİRMİYORDU; 1 Ekim kampanyası
 * bu yüzden %67 ve %100 itirazsız alışverişle "OLUMSUZ" dedi. Oysa itiraz
 * yazılmayan koşuda planlı kol kontrol kolunun aynısıdır: ölçülen şey
 * planlama değil, koşmayan bir mekanizmaydı.
 *
 * Aynı kusurun 2x2'deki hâli ölçüm gücü ön kontrolünü doğurmuştu
 * (`power.ts`): ölçüt prozada duruyor, karar yolunda durmuyor. Burada da
 * karar yolunun içine konuyor.
 */
/** İtirazsız kapanan alışveriş oranı bunun ÜSTÜNDEyse mekanizma tören. */
export const CEREMONY_THRESHOLD = 0.5;
/** Kabul edilen itiraz oranı bunun ALTINDAysa mekanizma gürültü. */
export const NOISE_THRESHOLD = 0.2;

const pct = (n: number): string => `%${(n * 100).toFixed(0)}`;

/**
 * 6d'nin raporu: planlama turu ürünü daha doğru yapıyor mu?
 *
 * Ölçüt `PLANLAMA.md`'de SONUÇTAN ÖNCE yazıldı ve eşikler `effect.ts`'ten
 * ödünç alınıyor — iki ölçümün aynı kuralla okunması kasıtlı: "planlama işe
 * yaradı mı" ile "çapraz denetim işe yaradı mı" sorularının eşiği farklı
 * olsaydı, hangisinin daha cömert okunduğu tartışması açılırdı.
 */
export interface ArmSide {
  /** Kolun ölçülebilmiş koşu sayısı. */
  runs: number;
  hooks: number;
  red: number;
  /** Kırmızı kanca oranı. */
  redRate: number;
  activations: number;
  costUsd: number;
  rejects: number;
  /** Ölçülemeyen koşular: "kusur yok" DEĞİL, yer gerçeği yok. */
  unmeasured: number;
}

/**
 * Kanca KİMLİKLERİ — sayı değil.
 *
 * 1 Ekim kampanyasının açtığı kör nokta. `async-pool`'da iki kol da benzer
 * SAYIDA kırmızı kanca verdi, ama kontrol kolunun kusurları iki koşuda
 * aynı kancalardaydı, planlı kolunki BAŞKA kancalardaydı. Yani planlama
 * kusuru azaltmak yerine KAYDIRMIŞ olabilir ve sayıya bakan bir rapor bunu
 * göremez.
 *
 * `yalnizPlanli` bu yüzden raporun en önemli satırı olabilir: planlamanın
 * GETİRDİĞİ kusur sınıfları. Göreli azalma olumlu çıkarken bu küme boş
 * değilse, "daha az kusur" ile "daha iyi ürün" aynı şey değildir.
 */
/** Mekanizmanın kendi ölçüsü: alışveriş koştu mu, itirazlar bilgi taşıdı mı. */
export interface Ceremony {
  /** Planlama bloğu kaydı olan koşu sayısı. */
  exchanges: number;
  /** Hiç itiraz yazılmadan kapanan alışveriş sayısı. */
  withoutObjection: number;
  objections: number;
  accepted: number;
  /** Kanıt kuralından elenen itiraz sayısı — "itiraz yok"un sebebi burada. */
  invalid: number;
}

export interface HookSets {
  /** Kontrol kolunda en az bir koşuda kırmızı olan kancalar. */
  plansiz: string[];
  /** Deney kolunda en az bir koşuda kırmızı olan kancalar. */
  planli: string[];
  /** İki kolda da görülen — planlamanın dokunmadığı kusurlar. */
  ortak: string[];
  /** Yalnızca kontrol kolunda — planlamanın ÇÖZDÜĞÜ. */
  yalnizPlansiz: string[];
  /** Yalnızca deney kolunda — planlamanın GETİRDİĞİ. */
  yalnizPlanli: string[];
  /**
   * Kolun her ÖLÇÜLMÜŞ koşusunda kırmızı olan kancalar.
   *
   * Kusurun belirlenimci olup olmadığını söylüyor: kontrol kolunda bu küme
   * birleşime eşitse hücre kararlı, yani ölçüm için elverişli.
   */
  herKosudaPlansiz: string[];
  herKosudaPlanli: string[];
}

/**
 * Çapraz denetimin tek bir kabul edilmiş itiraz üzerindeki sonucu.
 *
 * `auditor` `plan.obligation` olayının `role` alanından geliyor (denetleyen
 * rol); isim burada `auditor` çünkü dosyada `role` başka bağlamlarda
 * üretici/model kurgusu rolünü de karşılıyor ve rapor katmanında
 * karıştırılmamalı.
 *
 * `runId`, aynı görev×model grubunda `k>1` tekrar varsa, aynı `id`'yi
 * taşıyan birden fazla kaydı ayırt eder — olmasa HANGİ koşunun maddeyi
 * karşıladığı/karşılamadığı grup toplamında kaybolur.
 */
export interface ObligationRecord {
  runId: string;
  /** `rol#no` — kabul edilmiş itirazın kimliği. */
  id: string;
  /** İtirazı yazan rol. */
  objector: string;
  /** Denetleyen rol. */
  auditor: string;
  durum: "karsilandi" | "karsilanmadi";
}

export interface ObligationStats {
  total: number;
  met: number;
  unmet: number;
  records: ObligationRecord[];
}

export interface PlanGroup {
  taskId: string;
  /** Üretici model kurgusu; grubun anahtarının öteki yarısı. */
  model: string;
  planli: ArmSide | null;
  plansiz: ArmSide | null;
  /** Kırmızı kanca oranındaki göreli azalma: (plansız − planlı) / plansız. */
  relativeReduction: number | null;
  /** Koşu başına azalma; işaret tutarlılığı buradan okunur. */
  perRun: { runId: string; relativeReduction: number | null }[];
  repeats: number;
  /** Alışverişin töreni: itirazsız kapanan oran ve kabul oranı. */
  ceremony: Ceremony;
  /** Kanca kimlikleri; sayının göremediği kusur kayması buradan okunuyor. */
  hooks: HookSets;
  /** Çapraz denetimin madde başına sonuçları: kaç karşılandı, kaç karşılanmadı. */
  obligations: ObligationStats;
  verdict: { code: VerdictCode; reason: string };
}

export interface PlanEffectReport {
  groups: PlanGroup[];
  verdict: { code: VerdictCode; reason: string };
}

interface ArmRun {
  runId: string;
  taskId: string;
  model: string;
  arm: Arm;
  ran: boolean;
  hooks: number;
  red: number;
  /** Kırmızı kancaların ADLARI; kimlik karşılaştırması buna dayanıyor. */
  redNames: string[];
  activations: number;
  costUsd: number;
  rejects: number;
  planning?: { rounds: number; objections: number; accepted: number; invalid: number };
  obligations: ObligationRecord[];
}

/** Günlükten kol koşularını çıkarır; kol bilgisi `ab.arm` olayından gelir. */
export function armRuns(events: SkeinEvent[]): ArmRun[] {
  const arms = new Map<string, { taskId: string; arm: Arm; model: string }>();
  for (const e of events) {
    // `model` 6d'nin ilk kampanyasında YOKTU; o günlüklerin kolları
    // "(bilinmiyor)" grubuna düşüyor. Eksik alanı sessizce boş saymak,
    // eski koşuları yeni bir modelin grubuna karıştırırdı.
    if (e.type === "ab.arm") {
      arms.set(e.runId, { taskId: e.taskId, arm: e.arm, model: e.model ?? "(bilinmiyor)" });
    }
  }

  const out = new Map<string, ArmRun>();
  for (const [runId, meta] of arms) {
    out.set(runId, {
      runId, taskId: meta.taskId, model: meta.model, arm: meta.arm,
      ran: false, hooks: 0, red: 0, redNames: [], activations: 0, costUsd: 0, rejects: 0,
      obligations: [],
    });
  }

  for (const e of events) {
    const run = out.get(e.runId);
    if (run === undefined) continue;
    if (e.type === "agent.finished") {
      run.activations += 1;
      run.costUsd += e.usage?.costUsd ?? 0;
    }
    if (e.type === "card.settled" && e.outcome === "rejected") run.rejects += 1;
    if (e.type === "plan.settled") {
      run.planning = {
        rounds: e.rounds, objections: e.objections, accepted: e.accepted, invalid: e.invalid,
      };
    }
    if (e.type === "plan.obligation") {
      run.obligations.push({
        runId: e.runId, id: e.id, objector: e.objector, auditor: e.role, durum: e.durum,
      });
    }
    // Ölçüm kaydı SON yazılan olay; koşuda birden fazlaysa son geçerli.
    if (e.type === "hooks.measured") {
      run.ran = e.ran;
      run.hooks = e.total;
      run.red = e.red.length;
      run.redNames = [...e.red];
    }
  }
  return [...out.values()];
}

/** Kanca kimliklerini iki kol üzerinden karşılaştırır. */
function hookSets(plansizRuns: ArmRun[], planliRuns: ArmRun[]): HookSets {
  const birlesim = (runs: ArmRun[]): Set<string> => {
    const out = new Set<string>();
    for (const r of runs) if (r.ran) for (const ad of r.redNames) out.add(ad);
    return out;
  };
  // Her koşuda kırmızı olanlar: ölçülmüş koşu yoksa boş küme (kesişim
  // tanımsız; "hepsinde var" demek yanlış olurdu).
  const herKosuda = (runs: ArmRun[]): Set<string> => {
    const olculen = runs.filter((r) => r.ran);
    if (olculen.length === 0) return new Set();
    let acc = new Set((olculen[0] as ArmRun).redNames);
    for (const r of olculen.slice(1)) acc = new Set([...acc].filter((a) => r.redNames.includes(a)));
    return acc;
  };
  const s = birlesim(plansizRuns);
  const p = birlesim(planliRuns);
  const sirala = (x: Set<string>): string[] => [...x].sort();
  return {
    plansiz: sirala(s),
    planli: sirala(p),
    ortak: sirala(new Set([...s].filter((a) => p.has(a)))),
    yalnizPlansiz: sirala(new Set([...s].filter((a) => !p.has(a)))),
    yalnizPlanli: sirala(new Set([...p].filter((a) => !s.has(a)))),
    herKosudaPlansiz: sirala(herKosuda(plansizRuns)),
    herKosudaPlanli: sirala(herKosuda(planliRuns)),
  };
}

function side(runs: ArmRun[]): ArmSide | null {
  if (runs.length === 0) return null;
  const olculen = runs.filter((r) => r.ran);
  const hooks = olculen.reduce((s, r) => s + r.hooks, 0);
  const red = olculen.reduce((s, r) => s + r.red, 0);
  return {
    runs: olculen.length,
    hooks,
    red,
    redRate: hooks === 0 ? 0 : red / hooks,
    activations: runs.reduce((s, r) => s + r.activations, 0),
    costUsd: runs.reduce((s, r) => s + r.costUsd, 0),
    rejects: runs.reduce((s, r) => s + r.rejects, 0),
    unmeasured: runs.length - olculen.length,
  };
}

/**
 * Çapraz denetimin günlükten toplu okunuşu: tüm koşuların `obligations`
 * dizileri tek `records` dizisinde birleşir, dedup YOK — dosyadaki diğer
 * tüm sayımlar (ceremony, hooks) da olay sayısını ham sayıyor.
 */
function obligationStats(runs: ArmRun[]): ObligationStats {
  const records = runs.flatMap((r) => r.obligations);

  // SAYILAR madde başına, kayıt listesi ise ham geçmiş.
  //
  // Ham sayım bu kodun yazıldığı sırada doğruydu: `karsilanmadi` gören dal
  // escalate edip dönüyordu, yani bir maddeye ait en çok bir olay vardı.
  // O dal sonradan düzeltildi (günlük artık kapıdan ÖNCE yazılıyor, çünkü
  // en bilgilendirici hâl tam olarak kaydedilmeyen hâldi) ve bu, sayımın
  // varsayımını kırdı: kapıya çıkan tur `retry` ile baştan koştuğunda aynı
  // `(runId, id)` için İKİNCİ bir olay düşüyor.
  //
  // Sonucu bir etiket yalanı olurdu: rapor "N madde" diyip olay sayısını
  // basardı ve bir maddeyi iki kez sayardı. Son karar maddenin durumudur;
  // önceki karar geçmiştir. O yüzden sayılar `(runId, id)` başına SON
  // kayıttan okunuyor, `records` ise geçmişi olduğu gibi taşıyor — teşhis
  // değeri tam orada: bir maddenin karşılanmadıdan karşılandıya geçişi.
  const son = new Map<string, ObligationRecord>();
  for (const o of records) son.set(`${o.runId}\u0000${o.id}`, o);
  const guncel = [...son.values()];
  const met = guncel.filter((o) => o.durum === "karsilandi").length;
  const unmet = guncel.filter((o) => o.durum === "karsilanmadi").length;
  return { total: met + unmet, met, unmet, records };
}

function reduction(plansiz: ArmSide | null, planli: ArmSide | null): number | null {
  if (plansiz === null || planli === null) return null;
  if (plansiz.runs === 0 || planli.runs === 0) return null;
  // Kontrol kolunda hiç kusur yoksa "azalma" tanımsız: sıfırdan azalma yok
  // ve sıfıra bölmek sonsuz bir etki uydurur.
  if (plansiz.redRate === 0) return null;
  return (plansiz.redRate - planli.redRate) / plansiz.redRate;
}

export function planEffect(events: SkeinEvent[]): PlanEffectReport {
  const runs = armRuns(events);
  // Grup = görev × MODEL KURGUSU. Yalnızca göreve göre gruplamak, kampanya
  // ortasında üretici değişince iki kurgu tek gruba eritir ve k şişer —
  // `effect.ts`'te bir kez yapılan ve düzeltilen hatanın aynısı. Burada
  // ikinci kez yapıldı ve canlı kampanyada yakalandı: aynı görev sonnet ve
  // haiku ile koşulduğunda rapor ikisini tek hücre sanıyordu.
  const byGroup = new Map<string, ArmRun[]>();
  for (const r of runs) {
    const key = `${r.taskId}\u0000${r.model}`;
    const list = byGroup.get(key);
    if (list) list.push(r);
    else byGroup.set(key, [r]);
  }

  const groups: PlanGroup[] = [...byGroup.entries()].map(([key, own]) => {
    const [taskId, model] = key.split("\u0000") as [string, string];
    const planliRuns = own.filter((r) => r.arm === "planli");
    const plansizRuns = own.filter((r) => r.arm === "plansiz");
    const planli = side(planliRuns);
    const plansiz = side(plansizRuns);

    // Tekrar = kolların ikisinde de ölçülmüş koşu sayısının KÜÇÜĞÜ. Bir
    // kolda üç, ötekinde bir koşu varsa elde üç tekrar yok, bir tane var.
    const repeats = Math.min(planli?.runs ?? 0, plansiz?.runs ?? 0);

    // Koşu başına eşleştirme: aynı sıradaki koşular karşılaştırılıyor.
    const perRun = planliRuns
      .filter((r) => r.ran)
      .map((r, i) => {
        const karsi = plansizRuns.filter((x) => x.ran)[i];
        return {
          runId: r.runId,
          relativeReduction: karsi === undefined || karsi.hooks === 0 || karsi.red === 0
            ? null
            : (karsi.red / karsi.hooks - r.red / r.hooks) / (karsi.red / karsi.hooks),
        };
      });

    const exchanges = planliRuns.filter((r) => r.planning !== undefined);
    const ceremony = {
      exchanges: exchanges.length,
      withoutObjection: exchanges.filter((r) => (r.planning?.objections ?? 0) === 0).length,
      objections: exchanges.reduce((s, r) => s + (r.planning?.objections ?? 0), 0),
      accepted: exchanges.reduce((s, r) => s + (r.planning?.accepted ?? 0), 0),
      invalid: exchanges.reduce((s, r) => s + (r.planning?.invalid ?? 0), 0),
    };

    const relativeReduction = reduction(plansiz, planli);
    return {
      taskId, model, planli, plansiz, relativeReduction, perRun, repeats, ceremony,
      hooks: hookSets(plansizRuns, planliRuns),
      obligations: obligationStats(planliRuns),
      verdict: decide(relativeReduction, repeats, perRun, plansiz, planli, ceremony),
    };
  });

  return { groups, verdict: overall(groups) };
}

function decide(
  relative: number | null,
  repeats: number,
  perRun: { relativeReduction: number | null }[],
  plansiz: ArmSide | null,
  planli: ArmSide | null,
  ceremony: Ceremony,
): { code: VerdictCode; reason: string } {
  if (plansiz === null || plansiz.runs === 0) {
    return { code: "yetersiz", reason: "Kontrol kolu ölçülmedi; karşılaştırılacak bir şey yok." };
  }
  // Deney kolu ayrı soruluyor. İlk hâlinde `relative === null`'un ÜÇ sebebi
  // tek mesaja eriyordu ve rapor, kontrol kolunda 2 kırmızı kanca
  // gösterirken "kontrol kolunda hiç kırmızı kanca yok" diyordu — sebep
  // deney kolunun ölçülmemiş olmasıydı. Operatör bu rapora bakıp para
  // harcama kararı veriyor; yanlış teşhis pahalı.
  if (planli === null || planli.runs === 0) {
    return {
      code: "yetersiz",
      reason: "Deney kolu ölçülmedi" +
        (planli !== null && planli.unmeasured > 0 ? ` (${planli.unmeasured} kol düştü)` : "") +
        "; karşılaştırılacak bir şey yok.",
    };
  }
  if (relative === null) {
    return {
      code: "yetersiz",
      reason: "Kontrol kolunda hiç kırmızı kanca yok; azalma tanımsız. " +
        "Kusur üretmeyen görevde planlamanın etkisi ölçülemez.",
    };
  }
  // MEKANİZMA KAPISI — ürün farkını okumadan ÖNCE.
  //
  // Sıra kasıtlı ve `matrixSkip`'in sırasıyla aynı mantıkta: kusur üretmeyen
  // görev (yukarıda) mekanizmadan önce sorulur, mekanizma da k'den önce.
  // Alışveriş törenselse "k artırılmalı" YANLIŞ tavsiyedir — kollar kurgu
  // gereği aynı olduğu için k büyüdükçe %0'a daha çok güvenilir, oysa
  // ölçülen şey planlama değil.
  if (ceremony.exchanges === 0) {
    return {
      code: "yetersiz",
      reason: "Planlı kolda hiç alışveriş kaydı yok; planlama bloğunun koştuğu " +
        "doğrulanamıyor. Kolun adı planlı olması planlamanın olduğunu göstermez.",
    };
  }
  const torensel = ceremony.withoutObjection / ceremony.exchanges;
  if (torensel > CEREMONY_THRESHOLD) {
    return {
      code: "yetersiz",
      reason: `Alışverişlerin ${pct(torensel)}'si itirazsız kapandı ` +
        `(${ceremony.withoutObjection}/${ceremony.exchanges}, eşik ${pct(CEREMONY_THRESHOLD)}): ` +
        "mekanizma TÖREN. İtiraz yazılmayan koşuda planlı kol kontrol kolunun " +
        "aynısıdır, yani ürün farkı planlamayı ölçmüyor." +
        (ceremony.invalid > 0
          ? ` ${ceremony.invalid} itiraz kanıt biçiminden elendi — ilk bakılacak yer orası.`
          : ""),
    };
  }
  const kabul = ceremony.objections === 0 ? 0 : ceremony.accepted / ceremony.objections;
  if (kabul < NOISE_THRESHOLD) {
    return {
      code: "yetersiz",
      reason: `İtirazların ${pct(kabul)}'si kabul edildi ` +
        `(${ceremony.accepted}/${ceremony.objections}, eşik ${pct(NOISE_THRESHOLD)}): ` +
        "mekanizma GÜRÜLTÜ. Kabul edilmeyen itiraz planı değiştirmez, " +
        "değişmeyen plan da ürün farkına yazılamaz.",
    };
  }
  if (repeats < MIN_REPEATS) {
    return {
      code: "yetersiz",
      reason: `k=${repeats}; karar için iki kolda da en az ${MIN_REPEATS} ölçülmüş koşu gerekiyor. ` +
        "Aşağıdaki sayı sinyaldir, sonuç değildir.",
    };
  }
  const signs = perRun.map((r) => r.relativeReduction).filter((r): r is number => r !== null);
  const consistent = signs.length > 0 && signs.every((r) => r > 0);

  if (relative >= POSITIVE_THRESHOLD && consistent) {
    return {
      code: "olumlu",
      reason: `Kırmızı kanca oranında ${pct(relative)} göreli azalma (eşik ` +
        `${pct(POSITIVE_THRESHOLD)}) ve azalma ${signs.length} tekrarın hepsinde aynı yönde.`,
    };
  }
  if (relative >= POSITIVE_THRESHOLD) {
    return {
      code: "belirsiz",
      reason: `Azalma eşiğin üstünde (${pct(relative)}) ama tekrarlar arasında işaret ` +
        "tutarsız — en az bir tekrarda planlı kol daha ÇOK kusur üretti. k artırılmalı.",
    };
  }
  if (relative < NEGATIVE_THRESHOLD) {
    return {
      code: "olumsuz",
      reason: `Göreli azalma ${pct(relative)}, eşiğin (${pct(NEGATIVE_THRESHOLD)}) altında. ` +
        "Planlama turu ürünü daha doğru yapmıyor; bedeli aktivasyon farkı kadar.",
    };
  }
  return {
    code: "belirsiz",
    reason: `Göreli azalma ${pct(relative)}: iki eşiğin arasında. k artırılmalı.`,
  };
}

/** Görev sınıfları çelişirse havuzda eritilmez; ayrışma yazılır. */
function overall(groups: PlanGroup[]): { code: VerdictCode; reason: string } {
  if (groups.length === 0) {
    return { code: "yetersiz", reason: "Ölçülmüş kol koşusu yok." };
  }
  const only = groups[0] as PlanGroup;
  if (groups.length === 1) return only.verdict;

  const say = (g: PlanGroup): string => `${g.taskId} × ${g.model} (k=${g.repeats})`;
  const decisive = groups.filter((g) => g.verdict.code === "olumlu" || g.verdict.code === "olumsuz");
  if (decisive.length === 0) {
    return {
      code: "yetersiz",
      reason: `${groups.length} görevin hiçbiri karar verecek durumda değil: ` +
        groups.map((g) => `${say(g)} → ${g.verdict.code}`).join(", ") + ".",
    };
  }
  const positive = decisive.filter((g) => g.verdict.code === "olumlu");
  const negative = decisive.filter((g) => g.verdict.code === "olumsuz");
  if (negative.length === 0) {
    return { code: "olumlu", reason: `Karar verebilen ${positive.length} görevin hepsi olumlu: ` + positive.map(say).join(", ") + "." };
  }
  if (positive.length === 0) {
    return { code: "olumsuz", reason: `Karar verebilen ${negative.length} görevin hepsi olumsuz: ` + negative.map(say).join(", ") + "." };
  }
  return {
    code: "belirsiz",
    reason: "Görevler ayrışıyor — olumlu: " + positive.map(say).join(", ") +
      "; olumsuz: " + negative.map(say).join(", ") + ". Sonuç görev sınıfı başına okunmalı.",
  };
}
