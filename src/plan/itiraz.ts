/**
 * İtiraz dosyasının okuyucusu — `PLANLAMA.md`, aşama 6b.
 *
 * Alışverişin taşıyıcısı dosya; ama mekanizmanın itirazları **sayması**
 * gerekiyor (kaç tane açık kaldı, kaçı kabul edildi), yani makine de
 * okuyabilmeli. Biçim bu yüzden serbest yorum değil: dört alan, sabit
 * başlıklar.
 */

export type Status = "acik" | "kabul" | "ret" | "insana";

export interface Objection {
  no: number;
  /** İtirazı yazan rol. */
  role: string;
  ne: string;
  reason: string;
  /** "Neyi yanlışlar" — depodan bir yere işaret etmek zorunda. */
  kanit: string;
  durum: Status;
  /** `ret` ve `insana` için zorunlu gerekçe. */
  rationale?: string;
  /**
   * Geçersizlik sebebi; doluysa itiraz SAYILMAZ.
   *
   * Sayılmaması iki yönde de adil: ne denetçinin lehine (açık itiraz diye
   * planı durdurmaz) ne aleyhine (reddedilmiş sayılmaz). Biçimi tutmayan
   * bir itiraz, üzerine karar verilemeyecek bir metindir.
   */
  invalid?: string;
}

export interface ObjectionFile {
  objectionList: Objection[];
  /** Biçimi tutan itirazlar. */
  valid: Objection[];
  isOpen: Objection[];
  acceptance: Objection[];
  toHuman: Objection[];
}

/**
 * İtiraz başlığı — ÖLÇÜLMÜŞ kusurdan sonra toleranslı.
 *
 * İlk hâli `##` + tire/em-dash + ROL ADI zorunlu kılıyordu. Ölçüldü: üç
 * makul yazım (`## İtiraz 2`, `## İtiraz 2: reviewer`,
 * `### İtiraz 2 — reviewer`) hiç başlık sayılmıyordu ve sonuç SESSİZ
 * KAYIPTI — itiraz ne geçerli ne geçersiz, `invalid` sayacı 0 kalıyor,
 * `describe`'ın "N sayılmadı" notu basılmıyor, ve `gecerli.length`
 * düştüğü için "yeni itiraz yok → anlaşma" dalı ateşlenebiliyor. İki
 * itirazlı bir dosyada biri sessizce ötekinin alanlarını eziyordu.
 *
 * Rol adı artık isteğe bağlı, çünkü bilgi değeri YOK: `options.owner`
 * başlıkta yazanı zaten eziyor (rolün yer gerçeği dosyanın kendisi).
 * Başlık seviyesi ve ayraç da serbest.
 */
// Sayıdan sonra ÜÇ meşru hâl var: ayraç+rol, boşluk+rol, ya da hiçbir şey.
// İlk yazımda ayraç grubu isteğe bağlıydı ve ardından `(.*)` geliyordu, yani
// sayıdan sonra NE OLURSA başlık sayılıyordu (`## İtiraz 2'nin devamı`
// dahil) — o da `BASLIK_BENZERI` dalını ateşlenemez yapıyordu. Bu projede
// ateşlenemeyen bir kural bir kez yazıldı ve silindi; ikincisi yazılmadı.
const HEADING = /^#{2,6}\s+İtiraz\s+(\d+)(?:\s*[—–:-]\s*|\s+|\s*$)(.*)$/u;

/**
 * İtiraz başlığına BENZEYEN ama ayrıştırılamayan satır.
 *
 * Biçim gevşetildi ama gevşetmek yetmez: bir gün başka bir yazım yine
 * dışarıda kalırsa kayıp YİNE sessiz olurdu. Bu kalıp o satırı yakalayıp
 * geçersiz itiraz olarak sayıyor — sayılmayan bir itirazın hiçbir yere
 * yazılmaması, bu projede biçimin itirazı yediği dört vakanın ortak yanı.
 */
// `İtiraz` + SAYI şart: dosyanın kendi başlığı (`# İtirazlar — c-1`)
// itiraz başlığı değil. İlk yazımda bu daraltma yoktu ve dosya başlığı
// geçersiz itiraz sayılıyordu — gevşetmenin ters kusuru, sınamalar yakaladı.
const HEADING_LIKE = /^#{1,6}\s+İtiraz\s+\d/u;

/**
 * `**Alan:** değer` satırlarını, bir sonraki alana YA DA BAŞLIĞA kadar toplar.
 *
 * Başlığın alanı bitirmesi canlı bir koşuda ölçülen kusurdan geldi. Bir rol
 * biçime uygun bir itiraz yazdı, sonuna `**Durum:** açık` koydu ve ardından
 * `## Kontrol ettiklerim` diye serbest bir bölüm açtı. Başlık alan
 * sayılmadığı için bütün bölüm `Durum` değerinin içine aktı,
 * `Durum okunamadı: "açık ## Kontrol ettiklerim — ..."` dedi ve itiraz
 * ELENDİ. Elenen şey gerçek bir kusurun doğru teşhisiydi.
 *
 * Alanların çok satırlı olması kasıtlı (`Neyi yanlışlar` madde madde
 * yazılabiliyor), o yüzden çare alanları tek satıra indirmek değil —
 * markdown başlığının bloğu bitirdiğini kabul etmek. Biçimin sonlandırıcısı
 * yoktu; artık var.
 *
 * Bu, biçimin bir itirazı yediği ÜÇÜNCÜ vaka (öncekiler: kanıtta yol
 * göstermemek, kanıtın yalnızca kendi belgesini göstermesi). Biçim pazarlık
 * konusu değil ama biçimin tuzakları ölçümün kendi kusuru.
 */
function fields(body: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let active: string | null = null;
  for (const line of body) {
    const clean = line.trim();
    // `**Ad:**` VE `**Ad**:`, ayrıca madde imi / numara öneki.
    //
    // Ölçüldü: `- **Ne:** …` ve `**Ne**: …` yazımlarında DÖRT alan birden
    // kayboluyor ve hata mesajı "eksik alan: Ne, Neden, Neyi yanlışlar"
    // diyor — ajan alanları yazdığını bildiği için teşhis de yanıltıyor.
    // İki nokta hâlâ zorunlu: yoksa düz bir `**kalın**` satırı alan sanılır.
    const m = /^(?:[-*+]\s+|\d+[.)]\s+)?\*\*\s*([^*:]+?)\s*(?::\s*\*\*|\*\*\s*:)\s*(.*)$/u
      .exec(clean);
    if (m) {
      active = (m[1] as string).trim().toLocaleLowerCase("tr");
      out.set(active, (m[2] as string).trim());
      continue;
    }
    // Başlık bloğu bitirir. `## İtiraz N` zaten gövdeyi bölüyor; buradaki
    // başlıklar itirazın İÇİNDEKİ serbest bölümler.
    if (/^#{1,6}\s/u.test(clean)) {
      active = null;
      continue;
    }
    if (active !== null && clean !== "") {
      out.set(active, `${out.get(active) as string} ${clean}`.trim());
    }
  }
  return out;
}

/** Anahtar kelime → durum. Sıra anlamlı değil; eşleşme tam kelime üzerinden. */
const STATUSES: readonly (readonly [string, Status])[] = [
  ["açık", "acik"],
  ["acik", "acik"],
  ["kabul", "kabul"],
  ["ret", "ret"],
  ["insana", "insana"],
];

/**
 * `Durum` satırını okur.
 *
 * Dört durumun HEPSİ sondaki gerekçeyi kabul ediyor. İlk hâlinde yalnızca
 * `ret` ve `insana` kabul ediyordu, `kabul` tam eşleşme istiyordu — ve
 * bu, 6d kampanyasının ÜÇÜNCÜ koşusunda projenin ilk gerçek "itiraz
 * açıldı ve kabul edildi" alışverişini çöpe attı: plan yazarı iki itirazı
 * da `kabul — Haklı. Plan güncellenmiştir: …` diye yanıtladı, ikisi de
 * okunamaz sayıldı, alışveriş "0 itiraz, 0 kabul, 2 sayılmadı" diye kayda
 * geçti. Üstelik `kabul` sayısı sıfır kaldığı için "kabul ettin ama planı
 * değiştirmedin" kapısı da hiç çalışmadı.
 *
 * Gerekçe kabul etmesi en gereken durum, en katı olanıydı: "haklısın"
 * demek doğal olarak bir açıklama davet ediyor.
 *
 * Ayraç ZORUNLU (`:` ya da tire). Yalnızca boşluk kabul edilseydi
 * "kabul edilemez" → `kabul` diye okunur ve itirazın anlamı tersine
 * dönerdi; ayraçsız hâl geçersiz sayılıp görünür oluyor.
 */
function statusOf(raw: string): { durum: Status; rationale?: string } | null {
  const text = raw.trim();
  const dusuk = text.toLocaleLowerCase("tr");
  for (const [key, durum] of STATUSES) {
    if (dusuk === key) return { durum };
    if (!dusuk.startsWith(key)) continue;
    const left = text.slice(key.length);
    // Ayraç sınıfı ÖLÇÜLMÜŞ kusurdan sonra genişletildi: `kabul.`,
    // `kabul (plan güncellendi)` ve `açık.` geçersiz sayılıyordu. Bedeli
    // kaskad: kabul edilmiş itiraz sayımdan düşüyor, "kabul etti ama planı
    // değiştirmedi" kapısı `kabul.length > 0` olmadığı için ateşlenmiyor,
    // tur "anlaşma" sayılıyor ve yükümlülükler karta hiç yazılmıyor.
    //
    // Ayraç zorunluluğu KALKMIYOR: `kabul edilemez` hâlâ elenmeli, o yüzden
    // kalan ya boş olacak ya noktalama/parantez ile başlayacak — harfle
    // başlayan kuyruk belirsizdir.
    if (!/^[\s]*[:—–.(;,-]/u.test(left)) continue;
    const rationale = left
      .replace(/^[\s:—–.(;,-]+/u, "")
      .replace(/[)\s.]+$/u, "")
      .trim();
    return rationale === "" ? { durum } : { durum, rationale };
  }
  return null;
}

/**
 * Kanıt alanından depo yolunu çıkarır.
 *
 * Metin serbest ("`selector.ts:12` — aynı sürüm için…"), aranan şey içindeki
 * yol. Backtick'li ilk parça, yoksa uzantısı olan ilk kelime.
 */
export function evidencePath(kanit: string): string | null {
  return evidencePaths(kanit)[0] ?? null;
}

/**
 * Kanıt alanındaki BÜTÜN depo yolları, yazıldıkları sırayla.
 *
 * Tek yola bakmak yetmiyor ve bunu bir kampanya pahasına öğrendik: itirazcı
 * kanıtı madde madde yazıyor ("- `docs/plan/k.md:44` … / - `src/selector.ts:10`
 * …"). İlk yola bakan bir denetim, plan belgesini görüp itirazı atıyor —
 * oysa aynı itiraz KODA da işaret ediyor. Kuralın amacı döngüsel kanıtı
 * elemek; koda işaret eden bir itirazı plan belgesini de andığı için elemek
 * değil.
 */
export function evidencePaths(kanit: string): string[] {
  // Ters tırnaklı parçaların hepsine bakılıyor, yalnızca ilkine değil:
  // "**Neyi yanlışlar:** `Store.undo()` — `src/store.ts:12`" satırında ilk
  // parça yol DEĞİL. Yalnızca ilkine bakan bir okuyucu, iyi niyetli bir
  // itirazı biçim yüzünden geçersiz sayardı — ve bu kural sonuçlu olduğu
  // için katılığın bedeli yüksek.
  const candidates = [...kanit.matchAll(/`([^`]+)`/gu)].map((m) => m[1] as string);
  candidates.push(...kanit.split(/\s+/u));
  const paths: string[] = [];
  for (const candidate of candidates) {
    // Sarmalayıcılar atılıyor. Boşlukla ayırma aynı parçayı ters
    // tırnaklarıyla da aday yapıyor; temizlenmezse `x.md` ile x.md iki ayrı
    // yol sayılır ve "yolların hepsi kendi belgesi mi" denetimi yanılır.
    const clean = candidate
      .replace(/^[`'"([<]+/u, "")
      .replace(/[`'")\]>]+$/u, "")
      .replace(/[.,;]+$/u, "")
      .trim();
    if (!pathLike(clean)) continue;
    const path = clean.split(":")[0]?.trim();
    if (path === undefined || path === "") continue;
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

/** Dizin ayracı ya da dosya uzantısı taşıyan bir parça mı. */
function pathLike(part: string): boolean {
  const clean = part.trim().replace(/[.,;]+$/u, "");
  if (clean === "") return false;
  return clean.includes("/") || /\.[a-z]{1,5}(:\d+)?$/iu.test(clean);
}

export interface ParseOptions {
  /** Yol depoda var mı. Verilmezse yol denetimi yapılmaz. */
  present?: (path: string) => boolean;
  /**
   * Dosyanın SAHİBİ; verilirse her itirazın `role` alanı buna eşitlenir.
   *
   * 6e'den beri her itirazcı kendi dosyasına yazıyor, yani rolün yer
   * gerçeği dosyanın kendisi. Başlıkta yazan ad ajanın beyanı: yanlış
   * yazarsa itiraz başka bir role sayılırdı.
   */
  owner?: string;
  /**
   * İtirazın kanıt olarak GÖSTEREMEYECEĞİ yollar: kartın plan belgesi ve
   * itiraz dosyaları.
   *
   * 1 Ekim kampanyasının hizalama analizinden geliyor ve ölçülmüş bir
   * ayrışmayı kapatıyor. İyileşen planlı koşuların hepsinde itiraz
   * `src/selector.ts`'e — planın dokunacağı modülün TÜKETİCİSİNE — işaret
   * etti. İyileşmeyenlerin hepsinde itiraz `docs/plan/<kart>.md`'ye, yani
   * PLANIN KENDİSİNE işaret etti: "plan şöyle diyor" demekten öteye
   * gitmeyen, döngüsel bir kanıt.
   *
   * Eski kural bunu ayırt edemiyordu çünkü plan belgesi de depoda var ve
   * `varMi()` geçiyordu. Oysa kuralın gerekçesi "model tüketici modülü
   * okudu mu" idi; plan belgesini göstermek bunu hiç göstermiyor.
   */
  ownDocs?: string[];
}

/**
 * İtiraz dosyasını okur.
 *
 * Eksik alanlı ya da kanıtı depoda karşılığı olmayan itiraz `gecersiz`
 * işaretlenir. Kural `PLANLAMA.md`'den: "Genel öğüt makineyle elenir" —
 * "sınır durumlarına dikkat" diyen bir itiraz hiçbir dosyaya işaret
 * edemez, dolayısıyla planı durduramaz.
 */
export function parseObjections(text: string, options: ParseOptions = {}): ObjectionFile {
  const objectionList: Objection[] = [];
  const lines = text.split(/\r?\n/u);

  let headings: { no: number; role: string; body: string[] } | null = null;
  const finish = (): void => {
    if (headings === null) return;
    objectionList.push(build(headings.no, headings.role, fields(headings.body), options));
    headings = null;
  };

  for (const line of lines) {
    const m = HEADING.exec(line.trim());
    if (m) {
      finish();
      // Rol adı artık isteğe bağlı; `options.owner` onu zaten eziyor.
      headings = { no: Number(m[1]), role: (m[2] ?? "").trim(), body: [] };
      continue;
    }
    if (HEADING_LIKE.test(line.trim())) {
      // Başlığa BENZİYOR ama ayrıştırılamadı: görünür olsun diye geçersiz
      // itiraz sayılıyor. Sessizce atlamak `invalid` sayacını 0 bırakıp
      // kaybı hiçbir yere yazmamak demekti — ölçülen kusur tam buydu.
      //
      // Gövdenin İÇİNDE de denetleniyor: iki itirazlı bir dosyada ikinci
      // başlık okunamadığında eski kod onu önceki itirazın gövdesine
      // akıtıyor ve alanlarını EZİYORDU, yani iki itiraz bire düşüyordu.
      // Serbest bölüm başlıkları (`## Kontrol ettiklerim`) bu kalıba
      // girmiyor, çünkü "İtiraz" kelimesini taşımıyorlar.
      finish();
      objectionList.push({
        no: objectionList.length + 1, role: options.owner ?? "?",
        ne: "", reason: "", kanit: "", durum: "acik",
        invalid: `itiraz başlığı okunamadı: ${line.trim().slice(0, 80)} ` +
          "(beklenen: ## İtiraz <no> — <rol>)",
      });
      continue;
    }
    headings?.body.push(line);
  }
  finish();

  return sum(options.owner === undefined
    ? objectionList
    : objectionList.map((i) => ({ ...i, role: options.owner as string })));
}

/** Sayılmış listeden türev alanları kurar. */
function sum(objectionList: Objection[]): ObjectionFile {
  const valid = objectionList.filter((i) => i.invalid === undefined);
  return {
    objectionList,
    valid,
    isOpen: valid.filter((i) => i.durum === "acik"),
    acceptance: valid.filter((i) => i.durum === "kabul"),
    toHuman: valid.filter((i) => i.durum === "insana"),
  };
}

/**
 * Birden çok itirazcının dosyasını tek görünüme katar.
 *
 * Numaralar dosyalar arasında çakışabilir (her itirazcı 1'den sayar) ve
 * bu sorun DEĞİL: kimlik (sahip, no) çifti, yalnızca numara değil. Bu
 * yüzden burada tekilleştirme yapılmıyor — yapılsaydı iki rolün "İtiraz 1"i
 * tek itiraza erir ve sayaç düşerdi.
 */
export function mergeObjections(files: ObjectionFile[]): ObjectionFile {
  return sum(files.flatMap((d) => d.objectionList));
}

function build(no: number, role: string, field: Map<string, string>, options: ParseOptions): Objection {
  const ne = field.get("ne") ?? "";
  const reason = field.get("neden") ?? "";
  const kanit = field.get("neyi yanlışlar") ?? field.get("neyi yanlislar") ?? "";
  const statusRaw = field.get("durum") ?? "";
  const resolution = statusOf(statusRaw);

  const baseline: Objection = {
    no, role, ne, reason, kanit,
    durum: resolution?.durum ?? "acik",
    ...(resolution?.rationale === undefined ? {} : { rationale: resolution.rationale }),
  };

  const missing = [
    ne === "" ? "Ne" : null,
    reason === "" ? "Neden" : null,
    kanit === "" ? "Neyi yanlışlar" : null,
  ].filter((x): x is string => x !== null);
  if (missing.length > 0) {
    return { ...baseline, invalid: `eksik alan: ${missing.join(", ")}` };
  }
  if (resolution === null) {
    return { ...baseline, invalid: `\`Durum\` okunamadı: "${statusRaw}". Beklenen: açık | kabul | ret: … | insana: …` };
  }
  if ((resolution.durum === "ret" || resolution.durum === "insana") && resolution.rationale === undefined) {
    return { ...baseline, invalid: `\`${resolution.durum}\` gerekçesiz olamaz` };
  }

  // Kanıt depodan bir yere işaret etmeli — tasarımın en keskin kuralı.
  // Üç koşul da BÜTÜN yollara bakıyor: bir itiraz, gösterdiği yollardan
  // EN AZ BİRİ geçerliyse ayakta kalır. Yoksa yanında plan belgesini de
  // anan iyi bir itiraz elenir.
  if (options.present !== undefined) {
    const paths = evidencePaths(kanit);
    if (paths.length === 0) {
      return { ...baseline, invalid: "`Neyi yanlışlar` bir dosya yolu içermiyor" };
    }
    const depoda = paths.filter((y) => options.present?.(y) === true);
    if (depoda.length === 0) {
      return {
        ...baseline,
        invalid: `\`Neyi yanlışlar\` depoda olmayan bir yola işaret ediyor: ${paths.join(", ")}`,
      };
    }
    const own = new Set(options.ownDocs ?? []);
    if (depoda.every((y) => own.has(y))) {
      return {
        ...baseline,
        invalid: `\`Neyi yanlışlar\` alışverişin kendi belgesine işaret ediyor: ${depoda.join(", ")}. ` +
          `Kanıt, planın DOKUNACAĞI koda işaret etmek zorunda — "plan şöyle diyor" ` +
          `bir kanıt değil, planın tekrarı.`,
      };
    }
  }

  return baseline;
}
