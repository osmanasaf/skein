import type { Card, PlanKabul } from "../card/card.js";
import {
  isPlanner, itirazPathFor, itirazPathsFor, planAuditor, planBlind, planPathFor, type SnapshotRole,
} from "../flow/snapshot.js";
import { planPhase } from "../plan/phase.js";
import { verdictInstructions, VERDICT_FILE } from "./verdict.js";

/**
 * Kartın geçmişindeki, bu role ait EN SON reti bulur.
 *
 * Rol bir düzeltme turuna giriyorsa hangi itiraz üzerine girdiğini bilmek
 * zorunda. Bulunmazsa bu rolün bu kart için ilk turu demektir.
 */
function lastRejectTo(card: Card, roleId: string): Extract<Card["history"][number], { event: "reject" }> | null {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event === "reject" && entry.to === roleId) return entry;
    // Bu rol işi devraldıysa öncesi kapanmıştır; daha geriye bakma.
    if (entry?.event === "handoff" && entry.from === roleId) return null;
  }
  return null;
}

/**
 * Kartı BU role teslim eden devri bulur.
 *
 * Yalnızca en sonuncusu: zincir boyunca biriken özetler, altı rollü bir
 * akışta iş metnini rapora çevirirdi. Belgenin kalıcı hâli dosyada durur
 * (bkz. `specifier.md`); bu yalnızca "önceki rol ne dedi".
 */
function lastHandoffTo(card: Card, roleId: string): Extract<Card["history"][number], { event: "handoff" }> | null {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event === "handoff" && entry.to === roleId) return entry;
    // Bu rol işi bir kez devrettiyse öncesi kapanmıştır.
    if (entry?.event === "handoff" && entry.from === roleId) return null;
  }
  return null;
}

const planYazBolumu = (planPath: string): string[] => [
  "",
  "## Planı yaz",
  "",
  `Bu turun kalıcı çıktısı bir **plan belgesi**: \`${planPath}\`.`,
  "Dosyayı yaz ve **commit'le** — commit'lenmeyen plan sonraki role",
  "ulaşmaz ve tur kabul edilmez.",
  "",
  "Planda olması gerekenler: ne yapılacak, hangi dosyalara dokunulacak,",
  "hangi sözleşmelerin korunması gerekiyor, ve kapsam dışı ne var.",
  "Kod yazma — bu tur planlama turu.",
];

const planOkuBolumu = (planPath: string, card: Card): string[] => [
  "",
  "## Plan",
  "",
  `Bu kartın planı \`${planPath}\` dosyasında.` +
    (card.plan === undefined ? "" : ` (sürüm \`${card.plan.hash.slice(0, 12)}\`)`),
  "**Önce onu oku.** İşin tanımı görev metniyle o belgenin birleşimidir.",
  "Planla çelişen bir şey yapman gerekiyorsa gerekçesini özetine yaz.",
];

/**
 * İtiraz turu.
 *
 * Biçim pazarlık konusu değil: mekanizma itirazları sayıyor ve kanıt
 * alanının depoda karşılığı olup olmadığına bakıyor. Bu yüzden biçim
 * metnin içinde, örneğiyle birlikte veriliyor.
 */
/**
 * Yükümlülük denetimi — yalnızca `planlama.denetci` olan role.
 *
 * ÜRETİCİYE verilmiyor. İki gerekçe PLANLAMA.md'de: plan sözleşmedir ve
 * sözleşmenin tek başına yetip yetmediği ancak üretici yalnızca onu
 * okursa ölçülebilir; ayrıca denetçiye denetim listesi vermek süreci
 * ürüne sızdırmak değil, auditöre audit listesi vermektir.
 *
 * Serbest denetimden AYRI bölüm, ve bu bir ölçüm kararı: tartışılan
 * noktaları gösteren bir liste denetçiyi o bölgeye yönlendirip başka
 * yerlere karşı körleştirebilir. İki sonuç ayrı tutulmazsa o yanlılık
 * ölçüye karışır.
 */
const yukumlulukBolumu = (kabuller: PlanKabul[]): string[] => [
  "",
  "## İtiraz üzerine değişen maddeler",
  "",
  `Bu planın ${kabuller.length} maddesi planlama turunda tartışıldı ve`,
  "plan yazarı KABUL etti. Her birinin gerçekten karşılanıp",
  "karşılanmadığını **tek tek** yanıtlamak zorundasın.",
  "",
  ...kabuller.flatMap((k) => [
    `- \`${k.id}\` — ${k.ne}`,
    `  kanıt: ${k.kanit}`,
  ]),
  "",
  "Verdikt dosyasına `yukumlulukler` alanını ekle; her madde için:",
  "",
  "```json",
  '"yukumlulukler": {',
  ...kabuller.map((k, i) => `  "${k.id}": { "durum": "karsilandi", "not": "neye baktığın" }` +
    (i === kabuller.length - 1 ? "" : ",")),
  "}",
  "```",
  "",
  "`durum` yalnızca `karsilandi` ya da `karsilanmadi`. `not` boş olamaz:",
  "\"karşılandı\" tek başına kanıt değil, neye baktığını yaz.",
  "",
  "**Atladığın madde turu düşürür** — cevapsız madde karşılanmış sayılmaz.",
  "`karsilanmadi` dediğin bir madde varsa kararın `reject` olmak zorunda;",
  "`accept` + karşılanmamış madde kabul edilmez.",
  "",
  "Bu bölüm serbest denetiminin YERİNE geçmiyor. Önce işi normalde nasıl",
  "denetliyorsan denetle; bu liste ek bir yükümlülük.",
];

const itirazBolumu = (
  planPath: string, itirazPath: string, roleId: string, round: number, blind: boolean,
): string[] => [
  "",
  `## Plana itiraz et${round > 1 ? ` (tur ${round})` : ""}`,
  "",
  `Bu tur **kod yazma turu değil.** \`${planPath}\` dosyasındaki planı oku,`,
  `itirazlarını \`${itirazPath}\` dosyasına yaz ve **commit'le**.`,
  "",
  // Dosya rolün KENDİSİNE ait: başkasının dosyasına yazmak, turun sonundaki
  // birleştirmede çakışma üretir.
  `Bu dosya SANA ait; numaralarını 1'den başlat. Başka bir rolün itiraz`,
  "dosyasına yazma — turun sonunda hepsi tek ağaçta birleşiyor ve aynı",
  "dosyaya yazan iki rol birleşmeyi çakıştırır.",
  "",
  ...(blind
    ? [
      "**Bu tur KÖR:** öteki itirazcıların itirazlarını göremiyorsun ve",
      "onlar da seninkini görmüyor. Kasıtlı — ilk görüşlerin bağımsız",
      "olması ölçümün koşulu. Ağacında onların dosyası YOK; aramaya",
      "çalışmak zaman kaybı. Sonraki turda hepsi açık olacak.",
      "",
    ]
    : []),
  "Her itiraz tam olarak şu biçimde:",
  "",
  "```markdown",
  `## İtiraz 1 — ${roleId}`,
  "**Ne:** Planın hangi kararı yanlış.",
  "**Neden:** Neden yanlış.",
  "**Neyi yanlışlar:** `src/bir/dosya.ts:42` — orada ne var.",
  "**Durum:** açık",
  "```",
  "",
  "**`Neyi yanlışlar` depodan bir yere işaret etmek zorunda** — bir dosya,",
  "bir satır, bir test. Yolu var olmayan itiraz sayılmaz. \"Sınır durumlarına",
  "dikkat edilmeli\" gibi her plana uyan bir itiraz hiçbir plana uymaz.",
  "",
  "Planı SEN düzenlemiyorsun; itirazı yazan ile planı düzelten ayrı roller.",
  "İtirazın yoksa dosyayı yine yaz ve itirazın olmadığını açıkça söyle —",
  "sessizlik anlaşma sayılmaz.",
  ...(round === 1 ? [] : [
    "",
    `Bu ikinci ya da sonraki tur: plan düzeltildi ve önceki itirazlar`,
    "yanıtlandı. Sorulacak şey **düzeltmenin gerçekten karşılayıp",
    "karşılamadığı** — karşılamıyorsa yeni bir itiraz yaz, eskisini yeniden",
    "açma. Yeni itiraz eklemezsen alışveriş bu turun sonunda kapanır;",
    "bu, boş bir tur harcamamanın yolu.",
  ]),
];

/** Cevap turu: her açık itiraz üç cevaptan birini alır. */
const cevapBolumu = (
  planPath: string, itirazDosyalari: { role: string; path: string }[], round: number, limit: number,
): string[] => [
  "",
  "## İtirazları yanıtla",
  "",
  // Her itirazcının kendi dosyası var ve HEPSİ yanıtlanmak zorunda: biri
  // atlanırsa itirazları açık sayılır ve kart kapıya çıkar.
  `Planına itirazlar ${itirazDosyalari.length === 1 ? "şu dosyada" : "şu dosyalarda"}:`,
  ...itirazDosyalari.map((d) => `- \`${d.path}\`  (${d.role})`),
  "",
  "Her itirazın `**Durum:**` satırını düzenleyerek yanıtla, sonra",
  "**commit'le**. Dosyaların HEPSİNİ yanıtla — atladığın itiraz açık",
  "sayılır:",
  "",
  // Dördünde de sondaki gerekçe serbest; biçim örnekle veriliyor çünkü
  // kampanyada yazar `kabul — Haklı. Plan güncellenmiştir: …` yazdı ve
  // o gün ayrıştırıcı yalnızca tam `kabul` kabul ediyordu.
  "- `**Durum:** kabul: <ne değiştirdin>` — haklı. **Bu durumda planı da düzenle**;",
  `  \`${planPath}\` değişmemişse kabul sayılmaz ve tur kabul edilmez.`,
  "- `**Durum:** ret: <gerekçe>` — katılmıyorsun. Gerekçe zorunlu.",
  "- `**Durum:** insana: <gerekçe>` — bu bir değer kararı; iş insana çıkar.",
  "",
  "Açık bıraktığın itiraz kabul SAYILMAZ: tavan dolduğunda kart insan",
  "kapısında bekler. Bu tur da kod yazma turu değil.",
  ...(round >= limit ? [
    "",
    `Bu **son tur** (tavan ${limit}): açık bıraktığın itiraz kartı doğrudan`,
    "insan kapısına çıkarır.",
  ] : [
    "",
    `Tavan ${limit} tur; bu tur ${round}. Yanıtından sonra itiraz edenler`,
    "düzeltilmiş planı bir kez daha okuyacak.",
  ]),
];

/**
 * Role verilecek iş metnini kurar.
 *
 * Rol promptuna (anayasa + rol tanımı) KARIŞMAZ: o katman görevden
 * bağımsız olmalı ki hash'i sabit kalsın. Değişen her şey burada.
 */
export function buildTaskText(card: Card, role: SnapshotRole): string {
  // Zorunlu çıktı BAŞA da yazılıyor.
  //
  // İlk halinde yalnızca sonda duruyordu ve gerçek koşuda ajan 55 saniye
  // çalışıp dosyaları yazdı, sonra verdikt yazmadan bitirdi: uzun bir görev
  // metninin sonundaki talimat, iş bittiğinde unutulan talimattır. Kapı
  // doğru davrandı ve kartı insana çıkardı — ama her turu insana çıkaran
  // bir kapı, kapı değil duvardır.
  const parts: string[] = [
    `# ${card.title}`,
    "",
    // Kart kimliği metinde: belge üreten rol çıktısını bu adla dosyaya
    // yazabilsin diye (`docs/spec/<kart>.md`).
    `Kart: \`${card.id}\``,
    "",
    `> **Bu turun zorunlu çıktısı:** çalıştığın dizinin köküne \`${VERDICT_FILE}\``,
    "> dosyasını yaz. Ne yaparsan yap, bu dosya yoksa tur sonuçsuz sayılır ve",
    "> iş ilerlemez. Biçimi aşağıda.",
    "",
    // Devir teslimin iki kapısı da BAŞA yazılıyor, aynı sebeple: rol
    // promptunun ortasındaki talimat tutmuyor. Ölçüm kampanyasında
    // `claude-haiku-4-5` kolların yarısını tam bu iki adımda düşürdü —
    // biri commit'i atladı, öteki verdikt dosyasını `git add -A` ile
    // ürünün geçmişine soktu. Kapı ikisini de doğru yakaladı, ama her
    // turu insana çıkaran bir kapı kapı değil duvardır.
    "> **Devretmenin iki kapısı:**",
    `> 1. Ürettiğin her şeyi \`git add <yol>\` + \`git commit\` ile işle.`,
    ">    İşlenmemiş iş devredilemez: sonraki rol kendi çalışma ağacında",
    ">    çalışıyor ve yalnızca commit edilmiş olanı görüyor.",
    `> 2. \`${VERDICT_FILE}\` dosyasını **commit'lemE** — o orkestratöre`,
    ">    cevabın, ürünün parçası değil. `git add -A` onu da süpürür;",
    ">    dosyaları tek tek ekle.",
    "",
    "## İş",
    "",
    card.task,
  ];

  // Plan, iş metninin BAŞINDA — sonda değil.
  //
  // Aynı ders iki kez öğrenildi: uzun bir görev metninin sonundaki talimat,
  // iş bittiğinde unutulan talimattır (verdikt dosyası) ve rol promptunun
  // sonundaki kısıt tutmaz (`specifier.md`). Planı yazacak rol için bu
  // zorunlu çıktı; okuyacak rol için işin tanımının yarısı.
  const planPath = planPathFor(card.topology, card.id);
  if (planPath !== null) {
    const phase = planPhase(card, role.id, card.topology);
    const limit = card.topology.plan?.tur ?? 1;
    const benim = phase.kind === "itiraz"
      ? itirazPathFor(card.topology, card.id, role.id)
      : null;
    if (phase.kind === "yaz") parts.push(...planYazBolumu(planPath));
    else if (phase.kind === "itiraz" && benim !== null) {
      parts.push(...itirazBolumu(
        planPath, benim, role.id, phase.round, planBlind(card.topology, phase.round),
      ));
    } else if (phase.kind === "cevap") {
      parts.push(...cevapBolumu(
        planPath, itirazPathsFor(card.topology, card.id), phase.round, limit,
      ));
    } else if (!isPlanner(card.topology, role.id)) {
      parts.push(...planOkuBolumu(planPath, card));
      // Yükümlülük bölümü yalnızca beyan edilmiş denetçiye ve yalnızca
      // kart gerçekten yükümlülük taşıyorsa. Boş liste için başlık basmak,
      // olmayan bir şeyi varmış gibi okutur.
      const kabuller = card.plan?.kabuller ?? [];
      if (planAuditor(card.topology) === role.id && kabuller.length > 0) {
        parts.push(...yukumlulukBolumu(kabuller));
      }
    }
  }

  const rejection = lastRejectTo(card, role.id);
  if (rejection !== null) {
    parts.push(
      "",
      "## Önceki tur reddedildi",
      "",
      `\`${rejection.from}\` bu işi geri gönderdi (bu kenarda ${rejection.round}. ret).`,
      ...(rejection.commit === undefined ? [] : [`Reddedilen commit: \`${rejection.commit}\``]),
      "",
      "Gerekçesi:",
      "",
      rejection.reason,
      "",
      "Bu itirazı ele al. Katılmıyorsan da sessizce görmezden gelme — ne",
      "yaptığını özetinde söyle.",
    );
  }

  const handoff = lastHandoffTo(card, role.id);
  if (handoff?.summary !== undefined && handoff.summary.trim() !== "") {
    parts.push(
      "",
      "## Önceki rolün devri",
      "",
      `\`${handoff.from}\` işi sana devretti` +
        (handoff.commit === undefined ? "" : ` (commit \`${handoff.commit}\`)`) +
        " ve şunu söyledi:",
      "",
      handoff.summary,
      "",
      "Bu, o rolün KENDİ özeti — senin işini tanımlamaz ama bağlamını verir.",
      "Bir belgeye işaret ediyorsa önce onu oku.",
    );
  }

  parts.push("", verdictInstructions(role.reject !== null));
  return parts.join("\n");
}
