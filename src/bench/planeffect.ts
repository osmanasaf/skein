import type { SkeinEvent } from "../events/log.js";
import { MIN_REPEATS, NEGATIVE_THRESHOLD, POSITIVE_THRESHOLD, type VerdictCode } from "./effect.js";
import type { Arm } from "./ab.js";
import { sumUsage, totalUsage, type UsageTotal } from "./usage.js";

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
  /** Kolun ölçülebilmiş VE TESLİM EDİLMİŞ koşu sayısı — `hooks`/`red`/`redRate`'in paydası. */
  runs: number;
  hooks: number;
  red: number;
  /** Kırmızı kanca oranı. */
  redRate: number;
  /**
   * `activations`/`rejects`/`usage`'ın GERÇEK paydası — kolun BÜTÜN
   * koşusu, `runs` (teslim edilmiş) değil.
   *
   * Ölçülmüş kusur: `cli.ts`'in rapor satırı `runs`, `activations` ve
   * `rejects`'i YAN YANA basıyordu; okuyan doğal olarak "aktivasyon/koşu"
   * diye bölüyordu ama pay bütün koşuları, payda yalnızca teslim edilmiş
   * olanları sayıyordu — yanlış sayıya çıkan sessiz bir payda uyuşmazlığı.
   * Düzeltme iki yönde de sınırlı: `activations`/`rejects` TESLİM EDİLMEYEN
   * koşuları da saymak ZORUNDA (o turlar koştu, parası ödendi — HARCANAN
   * GİZLENMEZ), o yüzden toplamın kendisi değişmiyor. Değişen, paydanın
   * görünür olması: bu alan `runs.length`'i (koşu kaydının tamamını)
   * taşıyarak `cli.ts`'in "hangi sayı hangi paydayla" sorusuna veri
   * üzerinden cevap vermesini sağlıyor — metne gömülü bir açıklamaya değil.
   */
  totalRuns: number;
  activations: number;
  /**
   * Kolun ölçüsü — ORTAK BİRİM TOKEN, dolar bildiren sağlayıcı için ek alan.
   *
   * Eskiden `costUsd: number` idi ve `?? 0` ile toplanıyordu: ChatGPT
   * aboneliğiyle koşan codex `total_cost_usd` üretmiyor, yani rapor
   * `$0.00` basıyordu ve karar metni "bedeli aktivasyon farkı kadar"
   * derken maliyet sütunu bunu "bedava" diye onaylıyordu. Projenin kurucu
   * kuralının ihlali: BİLDİRİLMEYEN SIFIR DEĞİLDİR. `usage.ts` tam bunun
   * için yazıldı ve `matrix`/`summary` onu kullanıyordu; 6d kolu
   * kullanmıyordu.
   */
  usage: UsageTotal;
  rejects: number;
  /** Ölçülemeyen koşular: "kusur yok" DEĞİL, yer gerçeği yok. */
  unmeasured: number;
  /**
   * TESLİM EDİLMEYEN koşular — `done`'a varmamış kartlar.
   *
   * Üçüncü bir durum ve ölçülemedi ile "kusur yok"tan ayrı. Ölçülmüş
   * kusur şu: bir kolun koşusu kabul/ret/kapı döngüsünde kilit kapısına
   * çıkabiliyor, `finishArm` yine son rolün ağacından `src`'yi kopyalayıp
   * süiti koşuyor ve yarım/reddedilmiş artefakt KOLUN ÜRÜNÜ sayılıyordu.
   * Akışın kendisi "teslim edilemez" dediği bir artefakt kararı
   * sürükleyebiliyordu.
   */
  undelivered: number;
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
  shared: string[];
  /** Yalnızca kontrol kolunda — planlamanın ÇÖZDÜĞÜ. */
  onlyUnplanned: string[];
  /** Yalnızca deney kolunda — planlamanın GETİRDİĞİ. */
  onlyPlanned: string[];
  /**
   * Kolun her ÖLÇÜLMÜŞ koşusunda kırmızı olan kancalar.
   *
   * Kusurun belirlenimci olup olmadığını söylüyor: kontrol kolunda bu küme
   * birleşime eşitse hücre kararlı, yani ölçüm için elverişli.
   */
  everyRunUnplanned: string[];
  everyRunPlanned: string[];
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
  usage: UsageTotal;
  rejects: number;
  /**
   * Kartın SON durumu (`card.settled.state`); hiç kayıt yoksa `"yok"`.
   *
   * `done` dışındaki her değer "teslim edilmedi" demek.
   */
  state: string;
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
      ran: false, hooks: 0, red: 0, redNames: [], activations: 0, usage: {}, rejects: 0,
      state: "yok", obligations: [],
    });
  }

  for (const e of events) {
    const run = out.get(e.runId);
    if (run === undefined) continue;
    if (e.type === "agent.finished") {
      run.activations += 1;
      // `?? 0` YOK: bildirilmeyen ölçü boş kalıyor, sıfıra düşmüyor.
      run.usage = sumUsage(run.usage, totalUsage([e.usage]));
    }
    if (e.type === "card.settled") {
      if (e.outcome === "rejected") run.rejects += 1;
      // SON kayıt kazanır: kart kapıya çıkıp insan tarafından ileri
      // bırakılmış olabilir, yani "bir ara kapıya çıktı" teslim
      // edilmedi demek değil. Teslim ölçüsü kartın son durumu.
      run.state = e.state;
    }
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
function hookSets(unplannedRuns: ArmRun[], plannedRuns: ArmRun[]): HookSets {
  // Teslim edilmeyen koşunun kancaları kolun kusur KİMLİĞİ de değil.
  const teslimli = (r: ArmRun): boolean => r.state === "done" || r.state === "yok";
  unplannedRuns = unplannedRuns.filter(teslimli);
  plannedRuns = plannedRuns.filter(teslimli);
  const birlesim = (runs: ArmRun[]): Set<string> => {
    const out = new Set<string>();
    for (const r of runs) if (r.ran) for (const name of r.redNames) out.add(name);
    return out;
  };
  // Her koşuda kırmızı olanlar: ölçülmüş koşu yoksa boş küme (kesişim
  // tanımsız; "hepsinde var" demek yanlış olurdu).
  const everyRun = (runs: ArmRun[]): Set<string> => {
    const measured = runs.filter((r) => r.ran);
    if (measured.length === 0) return new Set();
    let acc = new Set((measured[0] as ArmRun).redNames);
    for (const r of measured.slice(1)) acc = new Set([...acc].filter((a) => r.redNames.includes(a)));
    return acc;
  };
  const s = birlesim(unplannedRuns);
  const p = birlesim(plannedRuns);
  const sirala = (x: Set<string>): string[] => [...x].sort();
  return {
    plansiz: sirala(s),
    planli: sirala(p),
    shared: sirala(new Set([...s].filter((a) => p.has(a)))),
    onlyUnplanned: sirala(new Set([...s].filter((a) => !p.has(a)))),
    onlyPlanned: sirala(new Set([...p].filter((a) => !s.has(a)))),
    everyRunUnplanned: sirala(everyRun(unplannedRuns)),
    everyRunPlanned: sirala(everyRun(plannedRuns)),
  };
}

/**
 * Kontrol kolunun kararlılık damgası — SAF, çünkü sınanmak zorunda.
 *
 * `cli.ts`'te değil burada: o modül kendini koşturuyor ve sınamadan içe
 * alınamıyor (`modelturns.ts` ve `safe-name.ts` aynı sebeple çıkarıldı).
 *
 * Ölçülmüş kusur: `herKosuda` kırmızı kanca kümelerinin KESİŞİMİ ve tek
 * ölçülmüş koşuda kesişim = birleşim, yani `herKosuda.length === hepsi.length`
 * DAİMA doğru çıkıyordu. Bayrak "sayıdan kimliğe geçtik, hücre ölçüme
 * elverişli" diye okunuyor ama hiçbir şey karşılaştırmamış oluyordu — ve
 * operatör ona bakıp k=3 kampanyası parası harcıyor. Belirlenimlilik
 * iddiası en az İKİ ölçülmüş koşu istiyor.
 */
export function kararlilikDamgasi(
  measuredRuns: number, everyRun: number, all: number,
): { stamp: string; stable: boolean } {
  if (measuredRuns < 2) return { stamp: "TEK KOŞU — kararlılık ölçülmedi", stable: false };
  const stable = all > 0 && everyRun === all;
  return { stamp: stable ? "KARARLI" : "değişken", stable };
}

function side(runs: ArmRun[]): ArmSide | null {
  if (runs.length === 0) return null;
  const measured = runs.filter((r) => r.ran);
  // TESLİM EDİLMEYEN koşu kolun ürünü değil, o yüzden `!ran` ile aynı
  // muamele görüyor: paydadan düşüyor. Akışın kendisi "bu iş devredilemez"
  // demişse, o artefaktın kanca sayısını kolun doğruluğu diye okumak
  // ölçümü bozar.
  // "Kayıt yok" TESLİM EDİLMEDİ DEĞİL. `bildirilmeyen sıfır değildir`
  // kuralı iki yöne de kesiyor: `card.settled` hiç yazılmamışsa teslimin
  // olmadığına dair kanıt da yok. Yalnızca durumu BİLİNEN ve `done`
  // olmayan koşu dışlanıyor — aksi hâlde eski kampanya günlükleri (o
  // olayları taşımayan arşivler) topluca "teslim edilmedi" okunurdu ve
  // yeniden okunabilirliklerini kaybederlerdi.
  const teslim = measured.filter((r) => r.state === "done" || r.state === "yok");
  const hooks = teslim.reduce((s, r) => s + r.hooks, 0);
  const red = teslim.reduce((s, r) => s + r.red, 0);
  return {
    runs: teslim.length,
    hooks,
    red,
    redRate: hooks === 0 ? 0 : red / hooks,
    // `runs.length`: ölçülemeyen ve teslim edilmeyen koşular da burada —
    // `activations`/`rejects`/`usage` tam bunların üzerinden toplanıyor.
    totalRuns: runs.length,
    activations: runs.reduce((s, r) => s + r.activations, 0),
    usage: runs.reduce<UsageTotal>((u, r) => sumUsage(u, r.usage), {}),
    rejects: runs.reduce((s, r) => s + r.rejects, 0),
    unmeasured: runs.length - measured.length,
    undelivered: measured.length - teslim.length,
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
  const last = new Map<string, ObligationRecord>();
  for (const o of records) last.set(`${o.runId}\u0000${o.id}`, o);
  const current = [...last.values()];
  const met = current.filter((o) => o.durum === "karsilandi").length;
  const unmet = current.filter((o) => o.durum === "karsilanmadi").length;
  return { total: met + unmet, met, unmet, records };
}

/**
 * İLAN EDİLMİŞ BİRİNCİ METRİK: downstream ret sayısında göreli azalma.
 *
 * `PLANLAMA.md`'nin ölçüt tablosunun BİRİNCİ satırı ("Plan, aşağıdaki
 * israfı önledi mi", eşik ≥%20 olumlu / <%10 olumsuz) hesaplanıyor ve
 * raporda basılıyordu ama `decide()` onu HİÇ okumuyordu. Ölçüt prozada
 * durup karar yolunda durmamasının ÜÇÜNCÜ örneği (öncekiler: 2x2'nin
 * ölçüm gücü koşulu, tören/gürültü eşikleri).
 *
 * Kontrol kolunda hiç ret yoksa azalma tanımsız — sıfırdan azalma yok.
 */
function retReduction(plansiz: ArmSide | null, planli: ArmSide | null): number | null {
  if (plansiz === null || planli === null) return null;
  if (plansiz.runs === 0 || planli.runs === 0) return null;
  if (plansiz.rejects === 0) return null;
  // `rejects` BÜTÜN koşuların (`totalRuns`) üzerinden toplanıyor —
  // teslim edilmeyen koşu da koştu, parası ödendi, reddi sayıma giriyor
  // (bkz. `side`'daki `ArmSide.totalRuns` yorumu). Payda `runs` (yalnız
  // TESLİM EDİLMİŞ koşular) olsaydı pay-payda farklı kümeleri sayardı ve
  // oran küçülürken gerçek kusur büyümüş gibi görünebilirdi — tam da
  // `cli.ts`'in rapor satırında düzeltilen payda uyuşmazlığının aynısı,
  // burada `decide()`'a giden sayıda (bulgu 38, kart `c-20261103-18959e`).
  const a = plansiz.rejects / plansiz.totalRuns;
  const b = planli.rejects / planli.totalRuns;
  return (a - b) / a;
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
    const plannedRuns = own.filter((r) => r.arm === "planli");
    const unplannedRuns = own.filter((r) => r.arm === "plansiz");
    const planli = side(plannedRuns);
    const plansiz = side(unplannedRuns);

    // Tekrar = kolların ikisinde de ölçülmüş koşu sayısının KÜÇÜĞÜ. Bir
    // kolda üç, ötekinde bir koşu varsa elde üç tekrar yok, bir tane var.
    const repeats = Math.min(planli?.runs ?? 0, plansiz?.runs ?? 0);

    // Koşu başına eşleştirme: aynı sıradaki koşular karşılaştırılıyor.
    const perRun = plannedRuns
      .filter((r) => r.ran)
      .map((r, i) => {
        const karsi = unplannedRuns.filter((x) => x.ran)[i];
        return {
          runId: r.runId,
          relativeReduction: karsi === undefined || karsi.hooks === 0 || karsi.red === 0
            ? null
            : (karsi.red / karsi.hooks - r.red / r.hooks) / (karsi.red / karsi.hooks),
        };
      });

    const exchanges = plannedRuns.filter((r) => r.planning !== undefined);
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
      hooks: hookSets(unplannedRuns, plannedRuns),
      obligations: obligationStats(plannedRuns),
      verdict: decide(relativeReduction, repeats, perRun, plansiz, planli, ceremony,
        retReduction(plansiz, planli)),
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
  rejectDrop: number | null,
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
  const acceptance = ceremony.objections === 0 ? 0 : ceremony.accepted / ceremony.objections;
  if (acceptance < NOISE_THRESHOLD) {
    return {
      code: "yetersiz",
      reason: `İtirazların ${pct(acceptance)}'si kabul edildi ` +
        `(${ceremony.accepted}/${ceremony.objections}, eşik ${pct(NOISE_THRESHOLD)}): ` +
        "mekanizma GÜRÜLTÜ. Kabul edilmeyen itiraz planı değiştirmez, " +
        "değişmeyen plan da ürün farkına yazılamaz.",
    };
  }
  // Teslim edilmeyen koşular paydadan düştü (bkz. `side`). Kalan koşu
  // yoksa okunacak ürün de yok.
  const teslimsiz = (plansiz.undelivered ?? 0) + (planli.undelivered ?? 0);
  const handoverNote = teslimsiz > 0
    ? ` (${teslimsiz} koşu TESLİM EDİLMEDİ ve paydaya girmedi)`
    : "";

  if (repeats < MIN_REPEATS) {
    return {
      code: "yetersiz",
      reason: `k=${repeats}; karar için iki kolda da en az ${MIN_REPEATS} ölçülmüş koşu gerekiyor. ` +
        "Aşağıdaki sayı sinyaldir, sonuç değildir." + handoverNote,
    };
  }
  const signs = perRun.map((r) => r.relativeReduction).filter((r): r is number => r !== null);
  const consistent = signs.length > 0 && signs.every((r) => r > 0);

  // İLAN EDİLMİŞ İKİ ÜRÜN METRİĞİ AYRIŞIYORSA harmanlanmaz, yazılır.
  //
  // Tabloda iki ürün metriği var ve aynı eşikleri paylaşıyor: kırmızı
  // kanca oranı ve downstream ret sayısı. Birini okuyup ötekini atmak,
  // ikisini bir ortalamaya eritmek kadar yanlış — bu projenin kurucu
  // kuralı iki yer gerçeğini harmanlamamak. `overall()`'ın görev sınıfları
  // çeliştiğinde yaptığının aynısı: ayrışmayı KARARA yazmak.
  const rejectPct = rejectDrop === null ? "—" : pct(rejectDrop);
  if (rejectDrop !== null) {
    const kancaOlumlu = relative >= POSITIVE_THRESHOLD;
    const kancaOlumsuz = relative < NEGATIVE_THRESHOLD;
    const rejectPositive = rejectDrop >= POSITIVE_THRESHOLD;
    const rejectNegative = rejectDrop < NEGATIVE_THRESHOLD;
    if ((kancaOlumlu && rejectNegative) || (kancaOlumsuz && rejectPositive)) {
      return {
        code: "belirsiz",
        reason: "İlan edilmiş iki ürün metriği AYRIŞIYOR: kırmızı kanca " +
          `${pct(relative)}, downstream ret ${rejectPct} (eşikler ` +
          `${pct(POSITIVE_THRESHOLD)} / ${pct(NEGATIVE_THRESHOLD)}). ` +
          "İkisini tek karara eritmek, iki ölçüyü harmanlamak olurdu; " +
          "sonuç metrik başına okunmalı." + handoverNote,
      };
    }
  }
  const rejectNote = ` Downstream ret azalması: ${rejectPct}.`;

  if (relative >= POSITIVE_THRESHOLD && consistent) {
    return {
      code: "olumlu",
      reason: `Kırmızı kanca oranında ${pct(relative)} göreli azalma (eşik ` +
        `${pct(POSITIVE_THRESHOLD)}) ve azalma ${signs.length} tekrarın hepsinde aynı yönde.` +
        rejectNote + handoverNote,
    };
  }
  if (relative >= POSITIVE_THRESHOLD) {
    return {
      code: "belirsiz",
      reason: `Azalma eşiğin üstünde (${pct(relative)}) ama tekrarlar arasında işaret ` +
        "tutarsız — en az bir tekrarda planlı kol daha ÇOK kusur üretti. k artırılmalı." +
        rejectNote + handoverNote,
    };
  }
  if (relative < NEGATIVE_THRESHOLD) {
    return {
      code: "olumsuz",
      reason: `Göreli azalma ${pct(relative)}, eşiğin (${pct(NEGATIVE_THRESHOLD)}) altında. ` +
        "Planlama turu ürünü daha doğru yapmıyor; bedeli aktivasyon farkı kadar." +
        rejectNote + handoverNote,
    };
  }
  return {
    code: "belirsiz",
    reason: `Göreli azalma ${pct(relative)}: iki eşiğin arasında. k artırılmalı.` +
      rejectNote + handoverNote,
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
