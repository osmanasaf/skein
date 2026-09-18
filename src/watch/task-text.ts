import type { Card } from "../card/card.js";
import { isPlanner, itirazPathFor, planPathFor, type SnapshotRole } from "../flow/snapshot.js";
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
const itirazBolumu = (planPath: string, itirazPath: string, roleId: string): string[] => [
  "",
  "## Plana itiraz et",
  "",
  `Bu tur **kod yazma turu değil.** \`${planPath}\` dosyasındaki planı oku,`,
  `itirazlarını \`${itirazPath}\` dosyasına yaz ve **commit'le**.`,
  "",
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
];

/** Cevap turu: her açık itiraz üç cevaptan birini alır. */
const cevapBolumu = (planPath: string, itirazPath: string): string[] => [
  "",
  "## İtirazları yanıtla",
  "",
  `\`${itirazPath}\` dosyasında planına itirazlar var. Her birinin`,
  "`**Durum:**` satırını düzenleyerek yanıtla, sonra **commit'le**:",
  "",
  "- `**Durum:** kabul` — haklı. **Bu durumda planı da düzenle**;",
  `  \`${planPath}\` değişmemişse kabul sayılmaz ve tur kabul edilmez.`,
  "- `**Durum:** ret: <gerekçe>` — katılmıyorsun. Gerekçe zorunlu.",
  "- `**Durum:** insana: <gerekçe>` — bu bir değer kararı; iş insana çıkar.",
  "",
  "Açık bıraktığın itiraz kabul SAYILMAZ: tur dolduğunda kart insan",
  "kapısında bekler. Bu tur da kod yazma turu değil.",
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
  const itirazPath = itirazPathFor(card.topology, card.id);
  if (planPath !== null && itirazPath !== null) {
    const phase = planPhase(card, role.id, card.topology);
    if (phase.kind === "yaz") parts.push(...planYazBolumu(planPath));
    else if (phase.kind === "itiraz") parts.push(...itirazBolumu(planPath, itirazPath, role.id));
    else if (phase.kind === "cevap") parts.push(...cevapBolumu(planPath, itirazPath));
    else if (!isPlanner(card.topology, role.id)) parts.push(...planOkuBolumu(planPath, card));
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
