/**
 * İtiraz dosyasının okuyucusu — `PLANLAMA.md`, aşama 6b.
 *
 * Alışverişin taşıyıcısı dosya; ama mekanizmanın itirazları **sayması**
 * gerekiyor (kaç tane açık kaldı, kaçı kabul edildi), yani makine de
 * okuyabilmeli. Biçim bu yüzden serbest yorum değil: dört alan, sabit
 * başlıklar.
 */

export type Durum = "acik" | "kabul" | "ret" | "insana";

export interface Itiraz {
  no: number;
  /** İtirazı yazan rol. */
  role: string;
  ne: string;
  neden: string;
  /** "Neyi yanlışlar" — depodan bir yere işaret etmek zorunda. */
  kanit: string;
  durum: Durum;
  /** `ret` ve `insana` için zorunlu gerekçe. */
  gerekce?: string;
  /**
   * Geçersizlik sebebi; doluysa itiraz SAYILMAZ.
   *
   * Sayılmaması iki yönde de adil: ne denetçinin lehine (açık itiraz diye
   * planı durdurmaz) ne aleyhine (reddedilmiş sayılmaz). Biçimi tutmayan
   * bir itiraz, üzerine karar verilemeyecek bir metindir.
   */
  gecersiz?: string;
}

export interface ItirazDosyasi {
  itirazlar: Itiraz[];
  /** Biçimi tutan itirazlar. */
  gecerli: Itiraz[];
  acik: Itiraz[];
  kabul: Itiraz[];
  insana: Itiraz[];
}

const BASLIK = /^##\s+İtiraz\s+(\d+)\s*[—–-]\s*(.+)$/u;

/** `**Alan:** değer` satırlarını, bir sonraki alana kadar toplar. */
function alanlar(govde: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let aktif: string | null = null;
  for (const satir of govde) {
    const m = /^\*\*(.+?):\*\*\s*(.*)$/u.exec(satir.trim());
    if (m) {
      aktif = (m[1] as string).trim().toLocaleLowerCase("tr");
      out.set(aktif, (m[2] as string).trim());
      continue;
    }
    if (aktif !== null && satir.trim() !== "") {
      out.set(aktif, `${out.get(aktif) as string} ${satir.trim()}`.trim());
    }
  }
  return out;
}

/** Anahtar kelime → durum. Sıra anlamlı değil; eşleşme tam kelime üzerinden. */
const DURUMLAR: readonly (readonly [string, Durum])[] = [
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
function durumOf(raw: string): { durum: Durum; gerekce?: string } | null {
  const text = raw.trim();
  const dusuk = text.toLocaleLowerCase("tr");
  for (const [anahtar, durum] of DURUMLAR) {
    if (dusuk === anahtar) return { durum };
    if (!dusuk.startsWith(anahtar)) continue;
    const kalan = text.slice(anahtar.length);
    if (!/^[\s]*[:—–-]/u.test(kalan)) continue;
    const gerekce = kalan.replace(/^[\s:—–-]+/u, "").trim();
    return gerekce === "" ? { durum } : { durum, gerekce };
  }
  return null;
}

/**
 * Kanıt alanından depo yolunu çıkarır.
 *
 * Metin serbest ("`selector.ts:12` — aynı sürüm için…"), aranan şey içindeki
 * yol. Backtick'li ilk parça, yoksa uzantısı olan ilk kelime.
 */
export function kanitYolu(kanit: string): string | null {
  // Ters tırnaklı parçaların hepsine bakılıyor, yalnızca ilkine değil:
  // "**Neyi yanlışlar:** `Store.undo()` — `src/store.ts:12`" satırında ilk
  // parça yol DEĞİL. Yalnızca ilkine bakan bir okuyucu, iyi niyetli bir
  // itirazı biçim yüzünden geçersiz sayardı — ve bu kural sonuçlu olduğu
  // için katılığın bedeli yüksek.
  const adaylar = [...kanit.matchAll(/`([^`]+)`/gu)].map((m) => m[1] as string);
  adaylar.push(...kanit.split(/\s+/u));
  const aday = adaylar.find((k) => yolGibi(k));
  if (aday === undefined) return null;
  const yol = aday.split(":")[0]?.trim();
  return yol === undefined || yol === "" ? null : yol;
}

/** Dizin ayracı ya da dosya uzantısı taşıyan bir parça mı. */
function yolGibi(parca: string): boolean {
  const temiz = parca.trim().replace(/[.,;]+$/u, "");
  if (temiz === "") return false;
  return temiz.includes("/") || /\.[a-z]{1,5}(:\d+)?$/iu.test(temiz);
}

export interface ParseOptions {
  /** Yol depoda var mı. Verilmezse yol denetimi yapılmaz. */
  varMi?: (yol: string) => boolean;
  /**
   * Dosyanın SAHİBİ; verilirse her itirazın `role` alanı buna eşitlenir.
   *
   * 6e'den beri her itirazcı kendi dosyasına yazıyor, yani rolün yer
   * gerçeği dosyanın kendisi. Başlıkta yazan ad ajanın beyanı: yanlış
   * yazarsa itiraz başka bir role sayılırdı.
   */
  owner?: string;
}

/**
 * İtiraz dosyasını okur.
 *
 * Eksik alanlı ya da kanıtı depoda karşılığı olmayan itiraz `gecersiz`
 * işaretlenir. Kural `PLANLAMA.md`'den: "Genel öğüt makineyle elenir" —
 * "sınır durumlarına dikkat" diyen bir itiraz hiçbir dosyaya işaret
 * edemez, dolayısıyla planı durduramaz.
 */
export function parseItirazlar(text: string, options: ParseOptions = {}): ItirazDosyasi {
  const itirazlar: Itiraz[] = [];
  const satirlar = text.split(/\r?\n/u);

  let basliklar: { no: number; role: string; govde: string[] } | null = null;
  const bitir = (): void => {
    if (basliklar === null) return;
    itirazlar.push(kur(basliklar.no, basliklar.role, alanlar(basliklar.govde), options));
    basliklar = null;
  };

  for (const satir of satirlar) {
    const m = BASLIK.exec(satir.trim());
    if (m) {
      bitir();
      basliklar = { no: Number(m[1]), role: (m[2] as string).trim(), govde: [] };
      continue;
    }
    basliklar?.govde.push(satir);
  }
  bitir();

  return topla(options.owner === undefined
    ? itirazlar
    : itirazlar.map((i) => ({ ...i, role: options.owner as string })));
}

/** Sayılmış listeden türev alanları kurar. */
function topla(itirazlar: Itiraz[]): ItirazDosyasi {
  const gecerli = itirazlar.filter((i) => i.gecersiz === undefined);
  return {
    itirazlar,
    gecerli,
    acik: gecerli.filter((i) => i.durum === "acik"),
    kabul: gecerli.filter((i) => i.durum === "kabul"),
    insana: gecerli.filter((i) => i.durum === "insana"),
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
export function birlestirItirazlar(dosyalar: ItirazDosyasi[]): ItirazDosyasi {
  return topla(dosyalar.flatMap((d) => d.itirazlar));
}

function kur(no: number, role: string, alan: Map<string, string>, options: ParseOptions): Itiraz {
  const ne = alan.get("ne") ?? "";
  const neden = alan.get("neden") ?? "";
  const kanit = alan.get("neyi yanlışlar") ?? alan.get("neyi yanlislar") ?? "";
  const durumRaw = alan.get("durum") ?? "";
  const cozum = durumOf(durumRaw);

  const taban: Itiraz = {
    no, role, ne, neden, kanit,
    durum: cozum?.durum ?? "acik",
    ...(cozum?.gerekce === undefined ? {} : { gerekce: cozum.gerekce }),
  };

  const eksik = [
    ne === "" ? "Ne" : null,
    neden === "" ? "Neden" : null,
    kanit === "" ? "Neyi yanlışlar" : null,
  ].filter((x): x is string => x !== null);
  if (eksik.length > 0) {
    return { ...taban, gecersiz: `eksik alan: ${eksik.join(", ")}` };
  }
  if (cozum === null) {
    return { ...taban, gecersiz: `\`Durum\` okunamadı: "${durumRaw}". Beklenen: açık | kabul | ret: … | insana: …` };
  }
  if ((cozum.durum === "ret" || cozum.durum === "insana") && cozum.gerekce === undefined) {
    return { ...taban, gecersiz: `\`${cozum.durum}\` gerekçesiz olamaz` };
  }

  // Kanıt depodan bir yere işaret etmeli — tasarımın en keskin kuralı.
  if (options.varMi !== undefined) {
    const yol = kanitYolu(kanit);
    if (yol === null) {
      return { ...taban, gecersiz: "`Neyi yanlışlar` bir dosya yolu içermiyor" };
    }
    if (!options.varMi(yol)) {
      return { ...taban, gecersiz: `\`Neyi yanlışlar\` depoda olmayan bir yola işaret ediyor: ${yol}` };
    }
  }

  return taban;
}
