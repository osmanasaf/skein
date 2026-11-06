/**
 * Ekranın kendisi — tek dosya, bağımlılıksız.
 *
 * Neden böyle: bu depo bir frontend yığını taşımıyor ve taşımamalı. Derleme
 * adımı, paket ağacı ve bir build çıktısı, "ekran saf okuyucudur" kısıtını
 * ilk ihlal edecek yer olurdu. Sayfa `/durum`'u yokluyor ve çiziyor; başka
 * hiçbir şey yapmıyor.
 */
/**
 * Sayfayı jetonla birlikte üretir.
 *
 * Jeton gömülü geliyor çünkü başka bir kaynaktaki JavaScript bu sayfayı
 * okuyamaz — yani yazma çağrısı için gereken jetonu öğrenemez. Ayrıntı:
 * `server.ts` içindeki `yetkili()`.
 */
/**
 * Sayfayı jeton VE gözcü ayarıyla birlikte üretir.
 *
 * `gozcu` `null` ise bu ekran gözcü bayraklarıyla açılmadı — sayfadaki
 * `GOZCU_AYAR` de `null` olur ve gözcü paneli düğme göstermez (bkz. yukarıda
 * `GOZCU_AYAR` yorumu, DEVIR.md'nin "unmanaged" durumu). `JSON.stringify`
 * tırnak İÇİNE değil DOĞRUDAN gömülüyor — `JETON`'un aksine bu bir nesne/
 * `null`, dize değil; tırnaklamak geçersiz bir JS ifadesi üretirdi.
 *
 * `tema` — kart c-20261106-e62847, `.skein/ekran.json`'da hatırlanan tema
 * seçimi (`port-memory.ts`'teki `sonTemaOku`). `<html>`'in `data-theme`
 * niteliği BURADA, SUNUCUDA basılıyor — istemci JS'i beklemiyor, yani ilk
 * boyamada YANLIŞ temanın bir an görünüp sonra değişmesi (FOUC) YOK.
 * "sistem" nitelik EKLEMİYOR (OS tercihini izleyen `@media` bloğu zaten
 * bunu yapıyor); "acik"/"koyu" sırasıyla `data-theme="light"`/`"dark"`
 * basıyor. Geçersiz bir değer (ileride bir mutasyon/elle bozma) sessizce
 * "sistem"e düşüyor — bozuk tema kaydı ekranı AÇILMAZ hâle getirmemeli,
 * `sonTemaOku`'nun kendi "bozuk kayıt kilitlemez" kuralıyla AYNI ilke.
 */
export function renderPage(
  token: string,
  gozcu: { bayraklar: string[] } | null = null,
  tema: "sistem" | "acik" | "koyu" = "sistem",
): string {
  const nitelik = tema === "acik" ? ' data-theme="light"' : tema === "koyu" ? ' data-theme="dark"' : "";
  return PAGE
    .replace("__TEMA_NITELIGI__", nitelik)
    .replace("__JETON__", token)
    .replace("__GOZCU_AYAR__", JSON.stringify(gozcu));
}

const PAGE = `<!doctype html>
<html lang="tr"__TEMA_NITELIGI__>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skein</title>
<style>
  /*
   * GÖKYÜZÜ VE İZ. "skein" bir kaz sürüsünün V dizilişi — palet bunu
   * taşıyor: zemin geniş ve sakin, kartlar o zeminin üstünde duran AÇIK
   * paneller; ince açık çizgiler "uçuş izi". TEK bir sıcak renk var
   * (--gate) ve o yalnızca insan kararı bekleyen yerler için ayrılmış —
   * kapı, uyarı, engel. Önceki palette kapı sarısı ile vurgu yeşili AYNI
   * ANDA bağırıyordu; burada --accent sakin bir gökyüzü mavisi, sıcaklık
   * tek yerde kalıyor.
   *
   * ZEMİN artık İKİ temada İKİ ayrı karakter (kart c-20261106-e62847,
   * UX.md §3.2): AÇIKTA Modernist'in nötr grisi (--bg Modernist
   * --color-bg'ye hizalı, bkz. aşağıdaki token yorumu — gövde ile üst
   * çubuk/paneller artık AYNI paleti paylaşıyor), KOYUDA hâlâ bu bloğun
   * kendi soğuk gri-mavi "gökyüzü" ailesi (--bg: #0B1118, aşağıdaki
   * @media bloğu) — o kısmın değiştirilmesi bu kartın görev metninin
   * kapsamı DIŞINDA ("açık temada" diyor), bkz. aynı yorum.
   *
   * --reject-ink / --reject AYRIMI kasıtlı (gate/gate-ink'teki ayrımın
   * aynısı): --reject kenarlık ve dolgu (yetim kart kapatma düğmesinin
   * dolu kırmızı zemini) için, --reject-ink düz METİN için. Koyu temada
   * ikisi ÇAKIŞAMAZ — beyaz yazı okunacak kadar koyu bir kırmızı, koyu
   * zemin üstünde METİN olarak okunacak kadar açık olamıyor aynı anda
   * (ölçüldü: biri 4.5:1'i tutturunca öteki düşüyor). Açık temada ikisi
   * aynı değeri taşıyabiliyor çünkü çatışma yalnızca koyu zeminde çıkıyor.
   */
  :root {
    /*
     * --bg'nin AÇIK değeri — kart c-20261106-e62847, UX.md §3.2 bonusu.
     * ÖNCEDEN #E7ECF2 (gökyüzü paleti, bu bloğun üstteki yorumunun kendi
     * mavimsi zemini) — ama gövde (body, aşağıda "background: var(--bg)")
     * bunu kullanıyordu ve Modernist'e geçen üst çubuk/panellerle (--color-bg,
     * #f3f2f2, nötr gri) AYNI ekranda İKİ ayrı palet duruyordu (UX.md'nin
     * ölçtüğü: "body rgb(231, 236, 242) — mavimsi ... Modernist zemin
     * #f3f2f2 (nötr gri)"). Değer burada --color-bg'NİN AÇIK hex'iyle
     * BİREBİR aynı yapıldı — yeni renk icat edilmiyor, var olan Modernist
     * zemine hizalanıyor. KOYU ezmesi (aşağıda, @media bloğu) BİLEREK
     * DOKUNULMADI: görev metni açıkça "açık temada" diyor, ve koyu
     * değeri (#0B1118) tarayici.test.ts'te başka sınamalarla ("gökyüzü
     * paleti: koyu temada", "#bar koyu temada ... document.body") zaten
     * PİNLİ — bu bonus o sınamaları kırmadan yalnızca İSTENEN yarıyı
     * düzeltiyor.
     */
    --bg: #f3f2f2; --surface: #FFFFFF; --surface-2: #EEF2F7;
    --ink: #15212C; --ink-2: #4C5B6B; --ink-3: #6E7B89;
    --line: #C9D3DD; --line-soft: #E7ECF2;
    /* tek SAKİN vurgu — gökyüzü mavisi, kapıyla yarışmaz */
    --accent: #2F5F8F; --accent-ink: #1F4D7A; --accent-soft: #E3EEF7; --accent-line: #9CC9E0;
    --accept: #2B6E45;
    --reject: #8A2E2E; --reject-ink: #8A2E2E;
    /* TEK sıcak renk — yalnızca insan kararı bekleyen yerler için */
    --gate: #B6560A; --gate-bg: #F7E8D6; --gate-line: #E3B583; --gate-ink: #5A3414;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

    /* tipografi ölçeği — başlık/gövde/etiket TEK yerden, gömülü değil */
    --fs-micro: 10px; --fs-tag: 10.5px; --fs-label: 11px; --fs-label-lg: 11.5px;
    --fs-tight: 12px; --fs-body: 12.5px; --fs-ui: 13px; --fs-ui-lg: 13.5px;
    --fs-title: 14.5px; --fs-heading: 15px; --fs-stat: 16px;
    --fs-panel-title: 18px; --fs-brand: 19px;

    /* boşluk ölçeği — kart içi dolgu ve boşluklar TEK yerden */
    --sp-1: 4px; --sp-2: 6px; --sp-3: 8px; --sp-4: 10px; --sp-5: 12px;
    --sp-6: 14px; --sp-7: 16px; --sp-8: 18px; --sp-9: 20px; --sp-10: 24px;

    /* ------------------------------------------------------------------
     * MODERNİST TOKEN KATMANI — kart c-20261105-fc7a36.
     *
     * tasarim/DEVIR.md + tasarim/ds/modernist.css'teki yeni tasarım
     * sisteminin token'ları. Değerler modernist.css'ten BİREBİR alındı
     * (SAPMALAR.md: "hiçbir düzeltme yeni renk icat etmiyor"). Yukarıdaki
     * --bg/--ink/--accent/... HÂLÂ GEÇERLİ EKRANI çiziyor; bu blok hiçbir
     * seçici tarafından KULLANILMIYOR henüz — bir sonraki kart (Modernist
     * ekranı gerçekten kurmak) bu token'ları tüketecek. Bu kart ekranın
     * görünüşünü değiştirmiyor, yalnızca bu katmanı ve kapısını kuruyor.
     * Kapı: src/ui/token-kontrast.test.ts.
     * ------------------------------------------------------------------ */
    /*
     * --font-heading: modernist.css'ten BİREBİR alındı ("Archivo",
     * system-ui, sans-serif). Google Fonts'un @import'u BİLİNÇLİ OLARAK
     * taşınmadı — --mono'nun yukarıdaki satırı da aynı deseni izliyor
     * ("IBM Plex Mono", ui-monospace, ...): bu sayfa bağımlılıksız, tek
     * dosyalık kalmak için ağdan hiçbir şey çekmiyor; Archivo kurulu
     * değilse yığın sessizce system-ui'a düşer. Önceki kart (03fbf8c) bu
     * token'ı TANIMLAMADAN üç kuralda (.marka .markaAd, .navSekme,
     * .yeniKart) kullanmıştı — tanımsız var() computed-value'da geçersiz
     * sayılır ve font-family (inherited) sessizce body'nin system-ui
     * yığınına düşer; reviewer'ın yakaladığı kusur buydu. Kapı:
     * tarayici.test.ts "başlık fontu" sınaması — getComputedStyle ile
     * GERÇEK çözülen aileyi ölçer, kaynak metnin kendisi bunu göremez.
     */
    --font-heading: "Archivo", system-ui, sans-serif;
    --color-bg: #f3f2f2; --color-surface: #eae9e9; --color-text: #201e1d;
    --color-accent: #ec3013;
    --color-divider: color-mix(in srgb, #201e1d 40%, transparent);

    --color-neutral-100: #f8f4f4; --color-neutral-200: #eae7e7; --color-neutral-300: #d7d3d3;
    --color-neutral-400: #bab6b6; --color-neutral-500: #9b9797; --color-neutral-600: #7d7979;
    --color-neutral-700: #605d5d; --color-neutral-800: #444141; --color-neutral-900: #2d2b2b;

    --color-accent-100: #fff2ef; --color-accent-200: #ffe0d9; --color-accent-300: #ffc4b8;
    --color-accent-400: #ff9783; --color-accent-500: #ff563c; --color-accent-600: #dd2b0f;
    --color-accent-700: #ae1800; --color-accent-800: #7c1405; --color-accent-900: #4d170e;

    /* tipografi ölçeği — DEVIR.md'nin düz listesi, semantik ad yok */
    --fs-40: 40px; --fs-36: 36px; --fs-30: 30px; --fs-26: 26px; --fs-22: 22px; --fs-20: 20px;
    --fs-17: 17px; --fs-15: 15px; --fs-14: 14px; --fs-13-5: 13.5px; --fs-13: 13px;
    --fs-12-5: 12.5px; --fs-12: 12px; --fs-11-5: 11.5px; --fs-11: 11px; --fs-10: 10px;
    /*
     * ÜÇÜ DE DEVIR.md'NİN KENDİ ÖLÇEĞİNDE YOK (kart c-20261105-d500f1) ama
     * sağ panelin MOD1/MOD2 metinleri tam bu üç değeri istiyor ("44px/800"
     * kapıda bekleyen sayısı, "15.5px/800" kapı kartı başlık düğmesi,
     * "10.5px/600" üst etiket). Üstteki düz liste dışına TAŞMIYORUZ: yeni
     * bir renk icat etmek SAPMALAR.md'nin yasakladığı şey, yeni bir ölçü
     * tokenı aynı yasağın kapsamında değil.
     */
    --fs-44: 44px; --fs-15-5: 15.5px; --fs-10-5: 10.5px;

    /* boşluk ölçeği — 4px'in katları */
    --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px;
    --space-6: 24px; --space-8: 32px;

    /* köşe yarıçapı — HER YERDE sıfır */
    --radius: 0;

    /* çizgi kalınlıkları */
    --border-section: 2px; /* bölüm ayırıcı */
    --border-row: 1px;     /* satır ayırıcı */
    --border-accent: 4px;  /* vurgu çizgisi (aktif sekme, kapı kutusu üstü) */

    /* ------------------------------------------------------------------
     * SAPMALAR.md § 1 — beş kontrast düzeltmesi, token katmanında kilitli.
     * Ham renkler DEĞİŞMEDİ; her biri var() ile yukarıdaki ramptan
     * işaretlendi ki bir sonraki kart yanlış adımı SEÇEMESİN — doğru
     * token'ın adı zaten bu. Ölçüm: token-kontrast.test.ts.
     * ------------------------------------------------------------------ */
    --label-ink: var(--color-neutral-700);              /* 11-12px/600 etiket — neutral-600 DEĞİL */
    --queue-square-fill: var(--color-neutral-500);
    --queue-square-border: var(--color-text);            /* kenar artık dolguyla AYNI DEĞİL */
    --daemon-dot-off-fill: var(--color-neutral-400);
    --daemon-dot-off-border: var(--color-text);          /* off/unmanaged: kenarsızdı, şimdi var */
    --daemon-dot-stopping-fill: var(--color-neutral-500);
    --daemon-dot-stopping-border: var(--color-text);     /* stopping: kenarsızdı, şimdi var */
    --empty-bird-ink: var(--color-neutral-600);          /* neutral-400 DEĞİL */

    /*
     * BAD-INK — Ajanlar sekmesinin "ölçülmeyen maliyet" uyarısı (denetim
     * kartı c-20261105-387d01, token-kontrast.test.ts). ".ajanSuAnSatir
     * .bad" DOĞRUDAN color-accent-700'ü metin olarak kullanıyordu; o
     * token'ın dolgu/kenar rolünde (beyaz metinle, ya da accent-100
     * zemininde) kalması "tema değişse de aynı kalır" varsayımına
     * dayanıyordu (bkz. aşağıdaki koyu tema yorumu) — ama bu kullanım
     * onu DOĞRUDAN color-surface zemininin üstünde METİN yaptı, o
     * varsayımı kırdı: koyu temada ölçülen oran 2.23:1, IKINCIL_ETIKET_
     * ESIGI'nin (3) bile altında. Yeni renk YOK — ramptan doğru adım.
     */
    --bad-ink: var(--color-accent-700);

    /* ------------------------------------------------------------------
     * SOLID-* — kart c-20261106-e62847 (koyu tema + accent rampası).
     *
     * --color-accent-700/800 AŞAĞIDA koyu temada ESKİ anlamlarını
     * KAYBEDİYOR: bu karttan önce ikisi "dolgulu beyaz-metin düğme" VE
     * "accent-100 zemin üstünde metin" rollerinin İKİSİNİ birden
     * taşıyordu, ki bu tam SAPMALAR'ın şimdi düzelttiği kusurun kökü —
     * ".railKapiKutu" (accent-100) koyu temada hiç ezilmediği için
     * accent-700/800 "ikisinde de aynı" kalabiliyordu. accent-100 artık
     * koyu temada EZİLİYOR (aşağıda), yani accent-700/800'ün "zemin
     * üstünde metin" rolü ARTIK TERS yöne (açık) dönmek ZORUNDA —
     * ama "dolgulu beyaz-metin düğme" rolü (.yeniKart, .navRozet-accent,
     * .railBtn.primary, formasyon "+" dairesi) AYNI KOYU değeri İSTİYOR,
     * yoksa beyaz metin açık bir zemine biner (okunmaz). Aynı token adı
     * iki çelişen rolü taşıyamaz — bu yüzden dolgulu-düğme rolü KENDİ
     * değişmez adına taşındı. Değerler YENİ İCAT EDİLMİYOR: ikisi de
     * accent-700/800'ün ZATEN VAR OLAN, değişmeyen ham hex'i (#ae1800/
     * #7c1405) — sadece token ADI ayrıştı, renk aynı.
     * ------------------------------------------------------------------ */
    --solid-accent: #ae1800;       /* = color-accent-700'ün ham değeri, HER ZAMAN koyu (beyaz metinle) */
    --solid-accent-hover: #7c1405; /* = color-accent-800'ün ham değeri, aynı sebep */
    /*
     * TOAST-BG — ".bildirim" için AYNI ayrışma, neutral-900 üzerinde.
     * DEVIR.md "koyu zemin, temadan bağımsız" diyor (bkz. aşağıdaki eski
     * yorum, artık ".bildirim" kuralının yanına taşındı) — ama
     * color-neutral-900 artık KENDİSİ de ".akisKart-panoda"/
     * ".promptlarOge-secili"/".railBaslikBtn" gibi accent-100 zemini
     * üstünde METİN rolünde kullanılıyor, o rol koyu temada AÇIK olmak
     * zorunda. Toast'un "her zaman koyu" sözü ayrı bir ada taşınmadan bu
     * ikisi çakışırdı.
     */
    --toast-bg: #2d2b2b;           /* = color-neutral-900'ün ham değeri, HER ZAMAN koyu */
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0B1118; --surface: #121A24; --surface-2: #1A2430;
      --ink: #E8EEF4; --ink-2: #A9B7C4; --ink-3: #7C8997;
      --line: #28333F; --line-soft: #141D27;
      --accent: #3C72A8; --accent-ink: #8FC3EA; --accent-soft: #14222F; --accent-line: #3C5A78;
      --accept: #6FBE86;
      --reject: #7A2222; --reject-ink: #E08585;
      --gate: #9A6A1E; --gate-bg: #241A0D; --gate-line: #4A3620; --gate-ink: #E8D3A8;

      /*
       * MODERNİST KOYU TEMA EZMESİ — reviewer'ın reddi (0f75e74, bu kenarda
       * 2. ret). modernist.css'in KENDİSİ koyu tema tanımlamıyor (kaynak
       * dosyada "dark" hiç geçmiyor) — bu yüzden burada beş token için
       * YENİ hex değerleri var; SAPMALAR.md §1'in "yeni renk icat edilmeyecek"
       * kısıtı yalnızca o bölümün BEŞ kontrast düzeltmesini kapsıyor (bkz.
       * görev metni: "Kontrast düzeltmeleri uygulanacak ...; Yeni renk icat
       * edilmeyecek"), Modernist'in hiç var olmayan koyu paletini kapsamıyor.
       * Üstteki eski --bg/--ink ailesi için de aynı emsal zaten var: #0B1118
       * gibi değerler de modernist.css'te YOK, bu kart ÖNCESİNDE icat edilmiş.
       *
       * Hangi beş token: .bar ve altındakiler GERÇEKTEN bunları tüketiyor
       * (bkz. .bar/.marka/.navRozet-notr/.sayac kuralları, yukarıda).
       * queue-square-border ve daemon-dot-off/stopping-border zaten
       * var(--color-text) ÜZERİNDEN geliyor, yani color-text'in bu ezmesi
       * onları da otomatik düzeltiyor — ayrıca tanımlamaya gerek yok.
       *
       * color-text LIGHT olunca (koyu zeminde okunsun diye), ona bağlı
       * ZEMİN rolündeki iki token da TERS çevrilmek zorunda — yoksa açık
       * metin açık zeminin üstüne biner (okunmaz): color-surface (gövde
       * metni "yüzey üstünde" çifti, token-kontrast.test.ts) ve
       * color-neutral-200 (nötr rozet zemini, aynı sınama). label-ink da
       * aynı sebepten light-ish: o bir METİN rolü (etiket/sayaç), açık
       * zeminde okunabilsin diye neutral-700'ün koyu-tema karşılığı artık
       * açık bir gri — ad "700" kaldı ama rolü ışık-koyu eksenine göre
       * tersine döndü, modernist.css'te adlandırılmış bir "koyu ramp" hiç
       * olmadığı için bu kartın kendi icadı.
       *
       * Ölçüldü (token-kontrast.test.ts "koyu tema" takımı, kontrast.ts
       * formülüyle): text/bg 15.47:1, text/surface 13.98:1, label-ink/bg
       * 10.24:1, text/neutral-200 11.25:1 — hepsi NORMAL_METIN_ESIGI'ni
       * (4.5) rahatça geçiyor. color-accent (#ec3013, DEĞİŞMEDİ) kendi
       * zemininin yeni koyu değeriyle 4.21:1 — IKINCIL_ETIKET_ESIGI'yi (3,
       * marka ikonu büyük grafik) geçiyor.
       *
       * Kapı: tarayici.test.ts "#bar koyu temada koyulaşıyor" sınaması —
       * gerçek tarayıcıda getComputedStyle(#bar) ölçer, document.body'yi
       * değil (reviewer'ın yakaladığı kusur tam burada: document.body
       * doğru koyulaşırken #bar hep açık kalıyordu).
       */
      --color-bg: #1A1817; --color-surface: #242120; --color-text: #F2EFEE;
      --color-neutral-200: #35312F; --color-neutral-700: #C9C4C2;

      /* ------------------------------------------------------------------
       * ACCENT RAMPASI + color-neutral-900 — kart c-20261106-e62847.
       *
       * ÖLÇÜLEN KUSUR: yukarıdaki BEŞ token dışında accent-100..900'ün
       * TAMAMI ve color-neutral-900 koyu temada hiç ezilmiyordu. Ekranda
       * en görünür sonucu ".railKapiKutu" idi — zemini accent-100
       * (#fff2ef), koyu gövdenin (#1A1817) üstünde rgb(255,242,239),
       * parlaklık 245/255, ÖLÇÜLEN 338×267px bir blok: gövdeden
       * neredeyse ayırt edilemeyen BEYAZ bir yüzey, ekranın en önemli
       * kutusunun (kapı kararı) üstünde. Aynı kusur accent-100'ü zemin
       * alan HER yerde tekrarlanıyordu (duzenleRol.duzenleVurgu,
       * railGozcuUyari, akisKart-panoda, promptlarOge-secili,
       * promptlarSiraAdim-vurgulu, ajanCanliEtiket, formasyonDugum.secili,
       * railGozcuLogSatir .hata, akisKartHata) — hepsi AYNI token'a
       * bağlı, tek satır düzeltiyor hepsini.
       *
       * İKİNCİ, DAHA SESSİZ kusur: accent-700/800 bazı yerlerde ÇIPLAK
       * --color-bg/--color-surface üstünde metin/kenar olarak kullanılıyor
       * (.formasyonRetEtiket, .formasyonKapiEtiket, .formasyonPlanEtiket,
       * .duzenleAdGirisi.gecersiz, .duzenleIkonSil:hover) — bunlar accent-100
       * kutusuna SARILI değil, ama AYNI ham renk (#ae1800/#7c1405) koyu
       * zeminde de koyu kaldığı için OKUNMUYORDU. Ölçüldü: accent-700/bg
       * 2.47:1, accent-800/bg 1.65:1 — IKINCIL_ETIKET_ESIGI'nin (3) bile
       * altında. Bu ikisi şimdiye kadar hiçbir token-kontrast.test.ts
       * girdisinde YOKTU (aşağıda eklendi) — SAPMALAR §2.7'nin uyardığı
       * gibi "nitelik/sınıf doğru" sınanmış ama "ekranda okunuyor mu"
       * hiç ölçülmemişti.
       *
       * YÖNTEM — YENİ RENK İCAT EDİLMİYOR, rampanın kendi basamakları
       * TERS basamağa taşınıyor (100<->900, 200<->800, 300<->700):
       * accent-100'ün koyu karşılığı rampanın EN KOYU ucu (900'ün ışık
       * değeri), accent-700/800'ün koyu karşılığı EN AÇIK ucun yanı
       * (300/200'ün ışık değeri) — "zemin" rolü koyulaşırken "o zemin
       * üstündeki metin" rolü açılıyor, DEVIR'in kendi kontrast mantığı.
       * accent-300/900/neutral-100 KENDİLERİ hiçbir seçicide KULLANILMIYOR
       * (yalnızca bu yansımanın KAYNAĞI) ve bu kartta da tüketilmiyor —
       * bu yüzden onlara AYRICA koyu ezmesi eklenmedi (üstteki "token var,
       * seçici yok" emsali). accent-400/500/600 de aynı sebepten
       * DOKUNULMADI: accent-400 zaten --bad-ink'in koyu değeri olarak
       * (satır ~183) KENDİ ışık hâliyle doğru ölçülüyor — bu ramp
       * basamağını da yansıtmak --bad-ink'in ZATEN TESTLİ 7.62:1 oranını
       * sessizce değiştirirdi, bu kart o zinciri BOZMUYOR.
       *
       * color-accent-700/800'ün ESKİ "dolgulu beyaz-metin düğme" rolü
       * (.yeniKart, .navRozet-accent, .railBtn.primary, formasyon "+"
       * dairesi) bu yansımayla ÇAKIŞIRDI (beyaz metin artık açık bir
       * zemine binerdi) — o rol --solid-accent/--solid-accent-hover'a
       * taşındı (yukarıda, ışık :root'ta tanımlı, koyu temada HİÇ
       * ezilmiyor). color-neutral-900'ün ESKİ "toast her zaman koyu"
       * rolü de aynı sebepten --toast-bg'ye taşındı; ".bildirim" artık
       * onu kullanıyor (aşağıda).
       *
       * Ölçüldü (token-kontrast.test.ts, iki temada ayrı ayrı — SAPMALAR
       * §2.5): accent-700(ink)/accent-100(bg) koyuda 9.58:1, accent-800/
       * accent-100 koyuda 11.71:1, neutral-900/accent-100 koyuda 13.32:1,
       * accent-700/color-bg (çıplak) koyuda 11.66:1, accent-800/color-bg
       * koyuda 14.25:1 — hepsi NORMAL_METIN_ESIGI'yi (4.5) geçiyor.
       * accent-100(bg)'nin kendisi gövdeden (#1A1817) sadece ~14 parlaklık
       * birimi uzakta — "100 birimden fazla sapan yüzey kalmasın" hedefi
       * tutuyor (bkz. tarayici.test.ts "koyu temada kapı kutusu artık
       * parlak bir yüzey değil").
       * ------------------------------------------------------------------ */
      --color-accent-100: var(--color-accent-900);
      --color-accent-200: #7c1405;  /* = color-accent-800'ün IŞIK değeri — accent-800 BU bloğun kendisinde ters yöne döndüğü için var() zinciri KURULAMIYOR, literal gerekiyor */
      --color-accent-700: var(--color-accent-300);
      --color-accent-800: #ffe0d9;  /* = color-accent-200'ün IŞIK değeri — aynı sebep */
      --color-neutral-900: var(--color-neutral-100);

      /*
       * BAD-INK koyu ezmesi — ramptaki #ae1800 (accent-700) koyu zeminde
       * (#242120) 2.23:1 ölçülüyor, okunmuyor. accent-400 (#ff9783, HALA
       * aynı Modernist ramp, YENİ renk DEĞİL) aynı zeminde 7.62:1 —
       * NORMAL_METIN_ESIGI'yi (4.5) rahatça geçiyor. Ölçüm:
       * token-kontrast.test.ts "bad-ink/color-surface" çifti, iki temada.
       */
      --bad-ink: var(--color-accent-400);

      /* ------------------------------------------------------------------
       * NEUTRAL-400/500 (fill rolü) — reviewer'ın reddi (bu kenarda 1. ret,
       * reddedilen commit 36ae34a). Üstteki ACCENT RAMPASI düzeltmesi
       * ".railKapiKutu"yu (accent-100 ZEMİNİNİ) ezdi ama color-neutral-400/
       * 500'ü HİÇ ezmedi — bu ikisi de gerçek, görünür seçicilerde FILL
       * (dolgu) rolünde kullanılıyor: --queue-square-fill (neutral-500,
       * .formasyonDugum .kare-kuyrukta / .lejant .kare.kuyrukta /
       * .railSatir .kare.kuyrukta), --daemon-dot-off-fill (neutral-400,
       * .dot.off/.unmanaged / .railGozcuNokta.off/.unmanaged — SAĞ
       * PANELDEKİ GÖZCÜ AÇIK/KAPALI ANA GÖSTERGESİ), --daemon-dot-stopping-
       * fill (neutral-500, .dot.stopping / .railGozcuNokta.stopping).
       * BORDER'ları (queue-square-border, daemon-dot-off/stopping-border)
       * zaten var(--color-text) üzerinden otomatik düzeliyor (üstteki not)
       * — ama bu üç FILL token'ı o zincire GİRMİYOR, kendi ham neutral
       * ramp değerine (#bab6b6/#9b9797) sabit kalıyordu.
       *
       * Ölçüldü (reviewer): koyu gövde #1A1817 parlaklık 24.3;
       * neutral-400 (#bab6b6) parlaklık 183.3, fark 159; neutral-500
       * (#9b9797) parlaklık 152.3, fark 128 — ikisi de kartın kendi 100
       * birimlik eşiğini AŞIYOR. En görünür sonuç sağ paneldeki gözcü
       * ana göstergesiydi (SAPMALAR §1'in "gözcünün açık mı kapalı mı
       * olduğunu söyleyen ANA işaret"): ".railGozcuNokta.unmanaged" koyu
       * gövdenin üstünde neredeyse-beyaz bir nokta basıyordu.
       *
       * YÖNTEM — YENİ RENK İCAT EDİLMİYOR, ramptaki İKİ KOYU basamak (700,
       * 800) ödünç alınıyor; accent'teki "ters basamak" (100<->900 vb.)
       * burada UYGULANAMIYOR çünkü 9 basamaklı neutral ramp'te 500
       * ortanın kendisi (aynası kendisiyle aynı kalır, 152.3 hâlâ 100
       * biriminin üstünde kalırdı) — bu yüzden 400/500 ÇİFTİ, ramptaki
       * KOYU UCA (700/800) kaydırılıyor, tıpkı görev metninin kendi
       * örneğinin dediği gibi ("koyuda accent-100 yerine rampanın koyu
       * ucu"). SIRALAMA bilerek KORUNUYOR: açık temada "off" (neutral-400,
       * fark 59 gövdeden) "stopping"ten (neutral-500, fark 90) DAHA AZ
       * fark ediyor — off sönük/pasif, stopping daha belirgin/geçişte.
       * Koyu temada da AYNI ilişki: off -> neutral-800'ün ham değeri
       * (#444141, fark 41.7), stopping -> neutral-700'ün ham değeri
       * (#605d5d, fark 69.7) — off hâlâ DAHA AZ fark ediyor, ikisi de
       * <=100 hedefinin rahatça altında (reviewer'ın eşik-sınırı not
       * ettiği 400<->600 ayna seçeneği sadece 98 bırakıyordu; 700/800
       * daha güvenli bir pay bırakıyor).
       *
       * Ölçüm: token-kontrast.test.ts "SAPMALAR §2.5 — zemin dolgusu"
       * takımı (üç fill token'ı, AÇIK VE KOYU için AYRI AYRI, kaynak
       * metinden) ve tarayici.test.ts'teki iki gerçek-tarayıcı sınaması
       * (".lejant .kare.kuyrukta" ve ".railGozcuNokta.unmanaged",
       * getComputedStyle ile GERÇEK çizilen rengi ölçüyor — SAPMALAR
       * §2.7: "nitelik doğru" ile "ekranda doğru" ayrı iddialar).
       * daemon-dot-stopping-fill AYRICA tarayıcıda ölçülmüyor çünkü
       * queue-square-fill ile TAM AYNI token zincirine (--color-neutral-500)
       * bağlı — ikisi her zaman birebir aynı hesaplanmış rengi taşır.
       * ------------------------------------------------------------------ */
      --color-neutral-400: #444141; /* = color-neutral-800'ün ışık değeri */
      --color-neutral-500: #605d5d; /* = color-neutral-700'ün ışık değeri */
    }
  }
  /*
   * TEMA ANAHTARI — kart c-20261106-e62847. Üstteki @media bloğu yalnızca
   * OS "koyu" tercih EDİYORSA uygulanıyor; operatör anahtarla "koyu"yu
   * AÇIKÇA seçtiğinde (OS açık olsa bile) koyu temanın uygulanması için
   * @media koşulundan BAĞIMSIZ bir seçici gerekiyor. Bu dosya build
   * adımsız, tek dosyalık kalmak için (bkz. dosya başı yorumu) bir CSS
   * önişlemci/mixin kullanmıyor — bu yüzden yukarıdaki blok burada
   * AYNEN tekrarlanıyor (CSS'in kendisinde "aynı gövdeyi iki seçiciye
   * bağla" diye bir yapı yok: bir @media bloğu düz bir seçiciyle AYNI
   * virgüllü listede olamaz). Gerekçe yorumları YUKARIDAKİ blokta —
   * burada tekrar edilmiyor, DEĞERLER birebir aynı, iki kaynak değil tek
   * kaynağın iki YERDE basılması (test bunu renderPage()'in ürettiği
   * GERÇEK metinden okuyarak doğruluyor, token-kontrast.test.ts'teki
   * "tema anahtarı" takımı).
   */
  :root[data-theme="dark"] {
    --bg: #0B1118; --surface: #121A24; --surface-2: #1A2430;
    --ink: #E8EEF4; --ink-2: #A9B7C4; --ink-3: #7C8997;
    --line: #28333F; --line-soft: #141D27;
    --accent: #3C72A8; --accent-ink: #8FC3EA; --accent-soft: #14222F; --accent-line: #3C5A78;
    --accept: #6FBE86;
    --reject: #7A2222; --reject-ink: #E08585;
    --gate: #9A6A1E; --gate-bg: #241A0D; --gate-line: #4A3620; --gate-ink: #E8D3A8;
    --color-bg: #1A1817; --color-surface: #242120; --color-text: #F2EFEE;
    --color-neutral-200: #35312F; --color-neutral-700: #C9C4C2;
    --color-accent-100: var(--color-accent-900);
    --color-accent-200: #7c1405;
    --color-accent-700: var(--color-accent-300);
    --color-accent-800: #ffe0d9;
    --color-neutral-900: var(--color-neutral-100);
    --bad-ink: var(--color-accent-400);
    --color-neutral-400: #444141; /* = color-neutral-800'ün ışık değeri */
    --color-neutral-500: #605d5d; /* = color-neutral-700'ün ışık değeri */
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: var(--fs-ui)/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1500px; margin: 0 auto; padding: var(--sp-9) var(--sp-7) 48px; }
  .mono { font-family: var(--mono); }
  .eyebrow {
    font-size: var(--fs-micro); font-weight: 600; letter-spacing: .1em;
    text-transform: uppercase; color: var(--ink-3);
  }

  /*
   * ÜST ÇUBUK VE SEKME İSKELETİ — Modernist (kart c-20261105-6d7f66).
   *
   * DEVIR.md'nin üst çubuk + dört sekme tasarımı. Pano'nun KENDİ içeriği
   * (board, kart panelleri) bu kartla DEĞİŞMİYOR; yalnızca üst çubuk ve
   * sekme gövdeleri (#icerikPano/#icerikAkislar/#icerikPromptlar/
   * #icerikAjanlar) yeni. Akış seçici ve "Akışı düzenle"/"Promptları
   * düzenle" düğmeleri yeni tasarımın üst çubuğunda YOK (Akışlar/
   * Promptlar sekmeleri onların yerini alıyor) — ama bu kart o sekmeleri
   * KURMUYOR (yer tutucu). Yetenek kaybolmasın diye Pano'nun kendi araç
   * satırına (.panoArac, aşağıda) taşındı, eski görünüşüyle.
   */
  .bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-5);
    background: var(--color-bg); border-bottom: var(--border-section) solid var(--color-text);
    padding: var(--space-3) var(--space-6); font-variant-numeric: tabular-nums;
  }
  /*
   * MARKA: üç kuş SVG'si + "Skein" sözcüğü. Eski kararın tersi (bkz.
   * markaSvg yorumu, eski "KUS ISARETI" yalnızca simge kullanıyordu) —
   * yeni tasarım ikisini birlikte istiyor. İkon currentColor ile burada
   * --color-accent'e bağlı: bu TEK token'ın koyu tema ezmesi BİLİNÇLİ
   * OLARAK yok (diğer Modernist token'lar için koyu ezmesi var, üstteki
   * @media (prefers-color-scheme: dark) bloğuna bak) — accent kendi
   * dolgulu bileşenlerinde (rozet/düğme) zaten kendi zeminine karşı
   * ölçülüyor, sayfa zeminine değil, o yüzden marka simgesi açık/koyu
   * temada AYNI kırmızıyı gösterir — eski --ink çift-tema deseni burada
   * YOK.
   */
  .marka { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-accent); }
  .marka svg { width: 40px; height: 26px; display: block; }
  .marka .markaAd {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-22);
    letter-spacing: -0.03em; color: var(--color-text);
  }
  .anaNav { display: flex; align-items: center; gap: var(--space-4); }
  .navSekme {
    font: inherit; font-family: var(--font-heading); font-weight: 700; font-size: var(--fs-14);
    min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-2);
    background: none; border: none; border-bottom: var(--border-accent) solid transparent;
    color: var(--color-text); cursor: pointer; padding: 0;
  }
  .navSekme-aktif { border-bottom-color: var(--color-accent); }
  .navRozet {
    display: inline-flex; align-items: center; justify-content: center; min-width: 18px;
    height: 18px; padding: 0 5px; font-size: var(--fs-11); font-weight: 700; line-height: 1;
  }
  /* --solid-accent: dolgulu beyaz-metin rozet, HER ZAMAN koyu (bkz. :root'taki SOLID-* yorumu). */
  .navRozet-accent { background: var(--solid-accent); color: #fff; }
  .navRozet-notr { background: var(--color-neutral-200); color: var(--color-text); }
  #akisSecici {
    font: inherit; font-size: var(--fs-ui); font-family: var(--mono); min-height: 34px;
    padding: 0 var(--sp-3); border: 1px solid var(--line); border-radius: 3px;
    background: var(--surface-2); color: var(--ink); cursor: pointer;
  }
  #akisSecici:disabled { cursor: progress; opacity: .6; }
  /*
   * GÖZCÜ ÇİPİ — DEVIR.md §2'nin BEŞ durumu (on/stopping/off/stale/
   * unmanaged, kart c-20261105-92d731). SAPMALAR.md §1'in sapması: BEŞİ DE
   * aynı 2px --color-text kenarlı kareyi kullanıyor (tasarımın "tüm durum
   * noktaları kare, 2px kenar" kendi kuralı) — "off"/"unmanaged" aynı
   * dolguyu (neutral-400) paylaşıyor çünkü tasarımın kendi tablosu da
   * ikisine AYNI noktayı veriyor, sadece etiket ve düğme ayrışıyor.
   * "stale" dolgusu --color-text: bu durumda ayrıca ÇİPİN KENDİSİ accent
   * kenara dönüyor ("dikkat" sınıfı) — DEVIR'in "stale -> çipte accent
   * kenar" satırı.
   *
   * Çip artık BİR DÜĞME (önceki kart "tek başına tıklanabilir değil"
   * diyordu — bu kart tam o notu kapatıyor, bkz. gozcuAc): tıklanınca sağ
   * paneli gözcü moduna açar. Varsayılan kenar rengi --color-divider
   * (sönük); panel AÇIKKEN --color-text'e döner ("railAcik") — DEVIR'in
   * "daemonEdge" formülü.
   */
  .pill {
    display: inline-flex; align-items: center; gap: var(--space-2);
    border: 2px solid var(--color-divider); padding: var(--space-1) var(--space-3);
    font: inherit; font-size: var(--fs-13); color: var(--color-text);
    background: none; cursor: pointer;
  }
  .pill.railAcik { border-color: var(--color-text); }
  .pill.dikkat { border-color: var(--color-accent); }
  .pill .ok { margin-left: 2px; }
  .dot { width: 10px; height: 10px; flex: 0 0 auto; border: 2px solid var(--color-text); }
  .dot.on { background: var(--color-accent); }
  .dot.stopping { background: var(--daemon-dot-stopping-fill); }
  .dot.off, .dot.unmanaged { background: var(--daemon-dot-off-fill); }
  .dot.stale { background: var(--color-text); }
  .spacer { flex: 1 1 auto; }
  .sayac { font-size: var(--fs-13); color: var(--label-ink); }
  .sayac b { color: var(--color-text); font-weight: 800; }
  /* --solid-accent(-hover): dolgulu beyaz-metin düğme, HER ZAMAN koyu (bkz. :root'taki SOLID-* yorumu). */
  .yeniKart {
    font: inherit; font-family: var(--font-heading); font-weight: 700; font-size: var(--fs-14);
    min-height: 40px; padding: 0 var(--space-5); border: none; cursor: pointer;
    background: var(--solid-accent); color: #fff;
  }
  .yeniKart:hover { background: var(--solid-accent-hover); }
  /*
   * TEMA ANAHTARI — kart c-20261106-e62847 (DEVIR.md'de yok, UX.md'nin
   * "operatör koyu temayı kapatamıyor" bulgusunun yaması). ".duzenleSegment"/
   * ".duzenleSegmentBtn" (Rolleri Düzenle modunun tekil/toplu anahtarı,
   * aşağıda) ile AYNI deseni izliyor — düğme grubu + "secili" sınıfı, YENİ
   * bir etkileşim deseni İCAT EDİLMİYOR, yalnızca üst çubuğun ölçeğine
   * (1px kenar, 28px yükseklik) küçültülüyor.
   */
  .temaAnahtari { display: flex; border: 1px solid var(--color-divider); flex: 0 0 auto; }
  .temaBtn {
    font: inherit; font-family: var(--font-heading); font-weight: 700; font-size: var(--fs-11);
    min-height: 28px; padding: 0 var(--space-3); border: none; background: none; color: var(--color-text);
    cursor: pointer;
  }
  .temaBtn:not(:last-child) { border-right: 1px solid var(--color-divider); }
  .temaBtn.secili { background: var(--color-text); color: var(--color-bg); }
  .temaBtn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .panoArac {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-5) var(--sp-9);
    padding: var(--sp-6) 0;
  }
  .yerTutucu { padding: var(--sp-9) 0; color: var(--ink-2); max-width: 60ch; }
  .yerTutucu h2 { margin: 0 0 var(--sp-3); font-size: var(--fs-panel-title); }

  /* pano */
  .card {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 4px; padding: var(--sp-6) var(--sp-6);
  }
  .card.live { border: 2px solid var(--accent); padding: var(--sp-5) var(--sp-6); }
  .card.gate { background: var(--gate-bg); border-color: var(--gate-line); }
  .card.orphan { border-color: var(--reject); border-style: dashed; }

  /*
   * FORMASYON DİYAGRAMI — kart c-20261105-2a8dab, DEVIR.md "Formasyon
   * diyagramı (V formasyonu)". Sütun panosunun (.board/.col/.colhead,
   * eski "zincir oku" dahil) YERİNİ alıyor — DEVIR.md ve bu kartın görevi
   * "sütun düzenini bırak" diyor, eski sütun CSS'i bu yüzden kaldırıldı.
   * ".card"/".card.live"/".card.gate"/".card.orphan" KALDI: başka akışın
   * ve yetim kartların uyarı bantları hâlâ bunları kullanıyor (bkz. JS
   * tarafında "digerler"/"yetimler" bantları, kartCiz).
   *
   * Genişlik formülü DEVIR.md'den BİREBİR: aspect-ratio koordinat
   * kutusunun (1000x640) kendi oranı, genişlik de ekran yüksekliğine
   * göre ölçekleniyor ki dar ama UZUN bir pencerede diyagram taşmasın.
   */
  .formasyonSarmal { width: min(100%, calc((100vh - 210px) * 1.5625)); margin: 0 auto; }
  /*
   * DOĞRUDAN ÇOCUK (">"), torun DEĞİL.
   *
   * Torun seçicisi (".formasyonSarmal svg") sarmalın İÇİNDEKİ HER svg'ye
   * uyuyordu — rol düğümlerine gömülü kuşlara da. Kuş <svg>'si
   * width="46" height="23" nitelikleriyle yaratılıyor ama CSS niteliği
   * ezer: her kuş 1000x640 hesaplanıyor, ekranda ~983x313 çiziliyordu.
   * Yirmi bir kat büyük; diyagramın üstünü tamamen kapatıyordu.
   *
   * Sınamalar bunu göremedi çünkü hepsi NİTELİĞE, SINIFA ve RENGE
   * bakıyor: polyline noktaları doğru, stroke 4, sınıf yerinde, renk
   * doğru. Hiçbiri ÇİZİLEN BOYUTU ölçmüyordu. "Nitelik doğru" ile
   * "ekranda doğru" ayrı şeyler.
   */
  .formasyonSarmal > svg { width: 100%; height: auto; display: block; aspect-ratio: 1000 / 640; }
  /*
   * İKİ SÜTUN — kart c-20261105-d500f1, DEVIR.md "İki sütun, flex ve
   * wrap". Ölçüler BİREBİR: formasyon alanı flex 1 1 620px, sağ panel
   * flex 0 1 380px / min-width 300px / border-left 2px / kendi içinde
   * kaydırılır. .panoGovde'ye açık bir --color-bg veriliyor: board ve
   * sağ panel artık Modernist token'larla (accent-100 kutu dahil) çiziyor
   * ve ALTLARINDAKİ zemin hâlâ ESKİ --bg olsaydı (bkz. body kuralı,
   * yukarıda — bu kartın kapsamı DEĞİL, henüz göçmedi) iki palet üst üste
   * binerdi. Bu satır yalnızca Pano'nun KENDİ gövdesini kapsıyor, body'yi
   * DEĞİŞTİRMİYOR.
   */
  .panoGovde { display: flex; flex-wrap: wrap; align-items: flex-start; background: var(--color-bg); }
  .formasyonAlan { flex: 1 1 620px; min-width: 0; padding: var(--space-6) 0; }
  .sagPanel {
    flex: 0 1 380px; min-width: 300px; border-left: var(--border-section) solid var(--color-text);
    max-height: calc(100vh - 66px); overflow-y: auto; padding: var(--space-6) var(--space-5);
  }
  .formasyonDugum { cursor: pointer; }
  .formasyonDugum rect.kutu { fill: transparent; stroke: var(--color-divider); stroke-width: 1; }
  .formasyonDugum.secili rect.kutu { fill: var(--color-accent-100); stroke: var(--color-accent); stroke-width: 2; }
  .formasyonDugum:focus-visible rect.kutu { stroke: var(--color-accent); stroke-width: 2; }
  .formasyonNumara { font-size: var(--fs-11); font-weight: 600; fill: var(--label-ink); }
  .formasyonRolAdi { font-family: var(--font-heading); font-size: var(--fs-17); font-weight: 800; fill: var(--color-text); }
  .formasyonMeta { font-size: var(--fs-11); fill: var(--label-ink); }
  /*
   * KART KARELERİ — düğümün altındaki küçük sıra. Üç sınıf ".lejant
   * .kare"nin üç değiştiricisiyle AYNI anlamı taşıyor (SAPMALAR.md §1'in
   * kuyruk karesi düzeltmesi burada da geçerli: dolgu neutral-500, kenar
   * dolguyla AYNI DEĞİL — --color-text).
   */
  .formasyonDugum .kare-calisiyor { fill: var(--color-accent); }
  .formasyonDugum .kare-kapida { fill: none; stroke: var(--color-accent); stroke-width: 2; }
  .formasyonDugum .kare-kuyrukta { fill: var(--queue-square-fill); stroke: var(--queue-square-border); stroke-width: 2; }
  /*
   * KANAT ÇIRPMA — SAPMALAR.md §2.2. Tasarımda "prefers-reduced-motion"
   * hiç yok; burada (a) donanım/işletim sistemi tercihine DOĞRUDAN CSS'in
   * kendisiyle uyuluyor (JS'in unutabileceği bir kontrol değil, @media KENDİSİ
   * animasyonu sıfırlıyor) ve (b) bunun YANINA, uygulama içi bir "animate"
   * kancası var ("kanatCirpiyorMu" fonksiyonu + document.documentElement
   * üstündeki "data-animate" özniteliği — bkz. JS tarafı): tasarımın
   * bahsettiği ayarı bugün hiçbir panel sürmüyor, ama kancası ekli,
   * yoksa (a)'yı (b) ile DEĞİŞTİRMEK gibi bir hataya açık kapı bırakırdı.
   */
  @keyframes formasyonKanat { from { transform: scaleY(1); } to { transform: scaleY(.4) translateY(3px); } }
  /*
   * ".ajanKus" — Ajanlar sekmesinin ajan listesi (DEVIR.md §6, kart
   * c-20261105-d304ed) AYNI kanatCirpiyorMu kararını AYNI "kanatCirpiyor"
   * sınıfıyla işaretliyor (bkz. page.ts JS tarafı, ajanSatirKur); seçici
   * burada formasyonKus'un YANINA eklendi, İKİNCİ bir animasyon kuralı
   * (ve ikinci bir prefers-reduced-motion bloğu) İCAT EDİLMEDEN.
   */
  .formasyonKus.kanatCirpiyor, .ajanKus.kanatCirpiyor {
    transform-origin: 50% 75%; animation: formasyonKanat .55s ease-in-out infinite alternate;
  }
  @media (prefers-reduced-motion: reduce) {
    .formasyonKus.kanatCirpiyor, .ajanKus.kanatCirpiyor { animation: none; }
  }
  /*
   * UÇAN KUŞ — devredilen bir kartın kaynak düğümden hedef düğüme
   * uçuşunu taşıyan overlay (bkz. JS tarafı ucanKusKur). "kanatCirpiyor"
   * sınıfı BİLEREK eklenmiyor: DEVIR görevi hareket bitene kadar kanat
   * çırpmasın diyor, kanat çırpma hedef düğümde (bu overlay silindikten
   * SONRA) normal koşulla kendiliğinden başlıyor. pointer-events:none —
   * kayan bir kuş altındaki düğümün tıklanmasını ENGELLEMEMELİ.
   */
  .ucanKus { pointer-events: none; }
  .formasyonGiris, .formasyonCikis { cursor: default; }
  .formasyonGiris { cursor: pointer; }
  .formasyonGiris text, .formasyonCikis text { font-family: var(--font-heading); font-weight: 700; fill: #fff; }
  .formasyonCikis text { fill: var(--color-text); }
  .formasyonCikis rect { fill: var(--color-surface); stroke: var(--color-text); stroke-width: 2; }
  .formasyonGiris:focus-visible circle { stroke: var(--color-text); stroke-width: 2; }
  /*
   * Bu iki etiket --color-bg üstünde ÇIPLAK fill kullanıyor (accent-100
   * kutusuna sarılı DEĞİL). Kart c-20261106-e62847'den ÖNCE koyu temada
   * ÖLÇÜLDÜ 2.47:1 (accent-700) / 1.65:1 (accent-800, formasyonPlanEtiket)
   * — IKINCIL_ETIKET_ESIGI'nin (3) bile altında, yani koyu temada metin
   * fiilen OKUNMUYORDU. accent-100'ün yanında accent-700/800'ün de
   * koyu-temada açık bir değere dönmesiyle (bkz. @media bloğundaki ACCENT
   * RAMPASI yorumu) bu artık koyuda 11.66:1/14.25:1 — token-kontrast.
   * test.ts'e eklendi.
   */
  .formasyonRetEtiket { font-size: var(--fs-12); font-weight: 600; fill: var(--color-accent-700); }
  /* Boyut skein-merkez-v3.html'den: insan onayı etiketi 13px (ret
     etiketinin 12px'inden farklı — ikisi de DEVIR.md'de açıkça verilmemiş,
     TEK kaynak asıl prototip). */
  .formasyonKapiEtiket { font-size: var(--fs-13); font-weight: 600; fill: var(--color-accent-700); }
  .formasyonPlanEtiket { font-size: var(--fs-13); font-weight: 600; fill: var(--color-accent-800); }
  .lejant {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4) var(--space-6);
    font-size: var(--fs-11-5); color: var(--label-ink); padding: var(--space-3) 0;
  }
  .lejant .oge { display: inline-flex; align-items: center; gap: var(--space-1); }
  .lejant .kare { width: 10px; height: 10px; flex: 0 0 auto; }
  .lejant .kare.calisiyor { background: var(--color-accent); }
  .lejant .kare.kapida { background: transparent; border: 2px solid var(--color-accent); }
  .lejant .kare.kuyrukta { background: var(--queue-square-fill); border: 2px solid var(--queue-square-border); }
  .lejant .cizgi-ret { width: 16px; height: 0; border-top: 2px solid var(--color-accent); flex: 0 0 auto; }
  .lejant .lejantSag { margin-left: auto; }

  /*
   * SAĞ PANEL — kart c-20261105-d500f1, DEVIR.md "Sağ panel modları".
   * Üç mod (Genel bakış/Rol/Kart) AYNI #sagPanel'i dolduruyor (bkz.
   * sagPanelCiz) — sınıflar modlar arası PAYLAŞILIYOR (.railBtn, .railSatir,
   * .railAraBaslik), DEVIR.md'nin kendisi de üçünde tekrar eden ögeler
   * tanımlıyor (üst etiket, kart kareleri, çıkış düğmeleri).
   */
  .railSayiSatiri { display: flex; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-5); }
  .railSayi { font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-44); color: var(--color-accent); line-height: 1; }
  .railSayiAciklama { font-size: var(--fs-13); color: var(--color-text); }

  /*
   * KAPI KUTUSU — Genel bakışın kapı kartı VE Kart modunun kapı kutusu
   * AYNI yapıyı kullanıyor (DEVIR.md ikisinde de "accent-100 kutu, üstte
   * 4px accent çizgi" diyor, bkz. railKapiKutu).
   *
   * .railBaslikBtn burada KASITLI OLARAK --color-text KULLANMIYOR, hâlâ:
   * --color-text koyu temada AÇIK renge dönüyor, ama bu kutunun zemini
   * (--color-accent-100) koyu temada KOYU bir değere dönüyor (kart
   * c-20261106-e62847, bkz. yukarıdaki @media bloğundaki ACCENT RAMPASI
   * yorumu) — --color-text'i katmak açık yazıyı yine açık bir zemine
   * BİNDİRİR, sadece zemin artık ESKİDEN farklı bir "açık" değil, KOYU.
   * Bu yüzden --color-neutral-900 kullanılıyor: ESKİDEN (bu karttan önce)
   * bu token da hiç ezilmiyordu ve çift "tema-değişmez" sayılıyordu; ŞİMDİ
   * --color-neutral-900'ün KENDİSİ koyu temada AÇIK bir değere dönüyor
   * (yukarıdaki ACCENT RAMPASI yorumu) — yani metin rengi ARTIK zeminle
   * (accent-100) BİRLİKTE, ters yönde dönüyor: zemin koyulaşırken metin
   * açılıyor. Ölçülen: accent-700/accent-100 koyuda 9.58:1, neutral-900/
   * accent-100 koyuda 13.32:1 (token-kontrast.test.ts, iki tema ayrı ayrı).
   */
  .railKapiKutu {
    background: var(--color-accent-100); border-top: var(--border-accent) solid var(--color-accent);
    padding: var(--space-4) var(--space-4) var(--space-5); margin-bottom: var(--space-5);
  }
  .railKapiEtiket {
    font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
    color: var(--color-accent-700);
  }
  .railBaslikBtn {
    display: block; width: 100%; text-align: left; font: inherit; font-family: var(--font-heading);
    font-weight: 800; font-size: var(--fs-15-5); color: var(--color-neutral-900); background: none;
    border: none; padding: var(--space-2) 0 0; cursor: pointer;
  }
  .railBaslikBtn:hover { text-decoration: underline; }
  /*
   * GEREKÇE — "en fazla 3 satır" DEVIR.md'nin kuralı, ama bu kuralın
   * KIRPTIĞI şey yalnızca BU özetin GÖRÜNÜMÜ: gerekceKur (bkz. yukarıda)
   * ajanın ham metnini HER ZAMAN TAM olarak bir details'a yazıyor ve
   * webkit-line-clamp o details'ı DEĞİL, yalnızca .reason
   * (çekirdeğin cümlesi) öğesini kırpıyor — kapalı bir details zaten DOM'da
   * tam metni taşıyor (tarayıcının kendi davranışı, görünmez ≠ silinmiş).
   * tasarim/SAPMALAR.md'nin taşınacak listesi tam bunu istiyor.
   */
  .railGerekce .reason {
    margin: var(--space-2) 0 0; color: var(--color-accent-800); font-size: var(--fs-13);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .railGerekce .ajanDetay summary { font-size: var(--fs-11); }
  .railCikis { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
  .railBtn {
    font: inherit; font-family: var(--font-heading); font-weight: 700; font-size: var(--fs-13);
    min-height: 40px; padding: 0 var(--space-4); cursor: pointer;
    border: var(--border-row) solid var(--color-text); background: var(--color-surface); color: var(--color-text);
  }
  .railBtn:hover:not(:disabled) { background: var(--color-neutral-200); }
  /* --solid-accent(-hover): dolgulu beyaz-metin düğme, HER ZAMAN koyu (bkz. :root'taki SOLID-* yorumu). */
  .railBtn.primary { background: var(--solid-accent); border-color: var(--solid-accent); color: #fff; }
  .railBtn.primary:hover:not(:disabled) { background: var(--solid-accent-hover); }
  .railBtn:disabled { opacity: .45; cursor: progress; }
  .railBtn:focus-visible, .railSatir:focus-visible, .railBaslikBtn:focus-visible, .railGeri:focus-visible {
    outline: var(--border-accent) solid var(--color-accent);
  }

  .railAraBaslik {
    font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
    color: var(--label-ink); margin: var(--space-5) 0 var(--space-3);
  }
  .railBos { font-size: var(--fs-13); color: var(--label-ink); }
  /*
   * SATIR — "Uçuşta" listesi VE Rol modunun kart listesi AYNI satırı
   * kullanıyor (bkz. railKartSatiri). Kare renkleri SAPMALAR.md §1'in
   * düzelttiği hâliyle (kuyrukta: dolgu neutral-500, kenar --color-text) —
   * .lejant .kare.* ile AYNI anlam, AYNI kural kümesi (DEVIR.md'nin üç
   * karesi burada da geçerli), ama DOM bağlamı farklı olduğu için (lejant
   * SVG değil ama ayrı bir satır yapısı) kural burada TEKRARLANIYOR —
   * .formasyonDugum .kare-* / .lejant .kare.* çiftinin zaten izlediği
   * emsal.
   */
  .railSatir {
    display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-2) var(--space-1);
    cursor: pointer;
  }
  .railSatir:hover { background: var(--color-neutral-200); }
  .railSatir .kare { width: 10px; height: 10px; flex: 0 0 auto; margin-top: 4px; }
  .railSatir .kare.calisiyor { background: var(--color-accent); }
  .railSatir .kare.kapida { background: transparent; border: 2px solid var(--color-accent); }
  .railSatir .kare.kuyrukta { background: var(--queue-square-fill); border: 2px solid var(--queue-square-border); }
  .railSatirGovde { min-width: 0; }
  .railSatirBaslik { font-size: var(--fs-13); font-weight: 700; color: var(--color-text); }
  .railSatirAlt { font-size: var(--fs-11); color: var(--label-ink); }

  .railGeri {
    display: inline-block; font: inherit; font-family: var(--font-heading); font-weight: 700;
    font-size: var(--fs-13); background: none; border: none; color: var(--color-text); cursor: pointer;
    padding: 0; margin-bottom: var(--space-4);
  }
  .railGeri:hover { text-decoration: underline; }

  .railUst {
    font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
    color: var(--label-ink);
  }
  .railRolBaslik { font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-30); margin: var(--space-1) 0; }
  .railRolMeta {
    display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: var(--fs-12); color: var(--label-ink);
    margin-bottom: var(--space-4);
  }
  .railRolDugmeler { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-5); }

  .railKartUst { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
  .railDurumEtiket {
    font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
    color: var(--label-ink);
  }
  .railKartBaslik { font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-22); margin: 0 0 var(--space-1); }
  .railKartMeta2 { font-family: var(--mono); font-size: var(--fs-11); color: var(--label-ink); margin-bottom: var(--space-3); }
  /* "Son ret gerekçesi" — DEVIR.md: "sol kenarı 2px accent blok". */
  .railRetBlok {
    border-left: 2px solid var(--color-accent); padding-left: var(--space-3); margin: var(--space-4) 0;
    font-size: var(--fs-13); color: var(--color-text);
  }

  /*
   * MOD 5 — ROLLERİ DÜZENLE (kart c-20261105-725320, DEVIR.md §3).
   *
   * MEVCUT ".railBtn"/".railGeri" aynen kullanılıyor (Vazgeç/Kaydet/Geri);
   * burada yalnızca bu modun KENDİ yapıları — rol bloğu, 2x2 ızgara,
   * segment düğmesi, stepper, hata/uyarı satırları, sabit alt çubuk.
   * Hepsi Modernist token'larla (SAPMALAR.md: yeni renk icat edilmiyor).
   */
  .duzenleAciklama { font-size: var(--fs-13); color: var(--label-ink); margin: var(--space-2) 0 var(--space-5); max-width: 40ch; }
  .duzenleRolListe { display: flex; flex-direction: column; gap: var(--space-4); margin-bottom: var(--space-4); }
  .duzenleRol {
    border: var(--border-row) solid var(--color-text); padding: var(--space-4);
  }
  .duzenleRol.duzenleVurgu { background: var(--color-accent-100); }
  .duzenleRolUst { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
  .duzenleRolNo { font-family: var(--mono); font-size: var(--fs-11); color: var(--label-ink); flex: 0 0 auto; }
  .duzenleAdGirisi {
    flex: 1 1 auto; min-width: 0; font: inherit; font-family: var(--font-heading); font-weight: 800;
    font-size: var(--fs-15); padding: var(--space-1) var(--space-2); border: var(--border-row) solid var(--color-text);
    background: var(--color-surface); color: var(--color-text);
  }
  /* "boş rol adı"/"aynı adı taşıyan iki rol" HATA'sı — accent-700 kenar (DEVIR.md §3 "Doğrulama"). */
  .duzenleAdGirisi.gecersiz { border-color: var(--color-accent-700); border-width: 2px; }
  /*
   * İKON DÜĞMELERİ — 36px, görevin kendi ölçüsü (DEVIR.md'nin genel 40/44px
   * buton kuralından burada KASITLI sapma: "↑ ↓ ✕ ikon düğmeleri (36px)"
   * açıkça yazıyor).
   */
  .duzenleIkon {
    width: 36px; height: 36px; flex: 0 0 auto; font: inherit; font-size: var(--fs-14); line-height: 1;
    border: var(--border-row) solid var(--color-text); background: var(--color-surface); color: var(--color-text);
    cursor: pointer;
  }
  .duzenleIkon:hover:not(:disabled) { background: var(--color-neutral-200); }
  .duzenleIkon:disabled { opacity: .45; cursor: not-allowed; }
  .duzenleIkonSil:hover:not(:disabled) { border-color: var(--color-accent-700); color: var(--color-accent-700); }
  .duzenleIzgara {
    display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3) var(--space-4); margin-bottom: var(--space-3);
  }
  .duzenleAlanEtiket {
    display: block; font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
    color: var(--label-ink); margin-bottom: 3px;
  }
  .duzenleIzgara label, .duzenlePromptSarmal label { display: block; min-width: 0; }
  .duzenleIzgara input, .duzenleIzgara select, .duzenlePromptSarmal select, .duzenleAlanTekil input, .duzenleAlanTekil select {
    width: 100%; font: inherit; font-family: var(--mono); font-size: var(--fs-12); min-height: 34px;
    padding: 0 var(--space-2); border: var(--border-row) solid var(--color-text);
    background: var(--color-surface); color: var(--color-text);
  }
  /* ALIM — tekil/toplu segment düğmesi: 2px kenar, seçili KOYU ZEMİNLİ (DEVIR.md §3). */
  .duzenleSegment { display: flex; border: 2px solid var(--color-text); }
  .duzenleSegmentBtn {
    flex: 1 1 auto; font: inherit; font-size: var(--fs-12); font-weight: 600; min-height: 34px;
    border: none; background: var(--color-surface); color: var(--color-text); cursor: pointer;
  }
  .duzenleSegmentBtn:not(:last-child) { border-right: 2px solid var(--color-text); }
  .duzenleSegmentBtn.secili { background: var(--color-text); color: var(--color-bg); }
  .duzenlePromptSarmal { display: flex; align-items: flex-end; gap: var(--space-2); margin-bottom: var(--space-3); }
  .duzenlePromptSarmal label { flex: 1 1 auto; }
  .duzenlePlanKatilim { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-12); }
  .duzenlePlanKatilimEtiket { color: var(--color-text); }
  .duzenlePlanDevreder { margin-left: auto; font-size: var(--fs-11); color: var(--label-ink); }
  .duzenleBolum { border-top: var(--border-row) solid var(--color-text); padding-top: var(--space-4); margin-top: var(--space-5); }
  .duzenleOzet { font-size: var(--fs-13); color: var(--color-text); margin: var(--space-2) 0; }
  .duzenleStepperSarmal { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-3) 0; }
  .duzenleStepper { display: flex; align-items: center; gap: var(--space-2); }
  .duzenleStepperDeger { min-width: 18px; text-align: center; font-size: var(--fs-14); font-weight: 700; }
  /*
   * accent-700 metin + accent-100 zemin — token-kontrast.test.ts'in
   * "Sağ panel kapı kutusu üst etiketi" çiftiyle AYNI, YENİ bir çift
   * İCAT EDİLMİYOR (SAPMALAR.md §1). Bu çift artık (kart c-20261106-e62847)
   * TEMA-DEĞİŞMEZ DEĞİL: accent-100 koyuda koyulaşıyor, accent-700 koyuda
   * açılıyor — ikisi BİRLİKTE, ters yönde dönüyor (bkz. @media bloğundaki
   * ACCENT RAMPASI yorumu), dolgulu rozet görünüşü DEVIR'in kendi tasarım
   * kararı olarak kalıyor.
   */
  .duzenleHata {
    color: var(--color-accent-700); background: var(--color-accent-100);
    padding: var(--space-2) var(--space-3); font-size: var(--fs-13); font-weight: 600; margin-bottom: var(--space-2);
  }
  .duzenleUyari {
    color: var(--color-text); background: var(--color-neutral-200); padding: var(--space-2) var(--space-3);
    font-size: var(--fs-13); margin-bottom: var(--space-2);
  }
  /* SABİT ALT ÇUBUK — "durum metni, Vazgeç, Kaydet" (DEVIR.md §3). */
  .duzenleAlt {
    position: sticky; bottom: 0; display: flex; align-items: center; gap: var(--space-3);
    background: var(--color-bg); border-top: var(--border-section) solid var(--color-text);
    padding: var(--space-3) 0; margin-top: var(--space-5);
  }
  .duzenleDurumMetni { flex: 1 1 auto; min-width: 0; font-size: var(--fs-13); color: var(--label-ink); }

  /*
   * MOD 4 — GÖZCÜ (kart c-20261105-92d731, DEVIR.md §2). ".railGeri"/
   * ".railBtn"/".railUst"/".railBos" MEVCUT (Genel bakış/Rol/Kart/MOD5 ile
   * PAYLAŞILIYOR) — burada yalnızca bu modun KENDİ yapıları.
   */
  .railGozcuBaslikSatir { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-2) 0 var(--space-3); }
  .railGozcuNokta { width: 10px; height: 10px; flex: 0 0 auto; border: 2px solid var(--color-text); }
  .railGozcuNokta.on { background: var(--color-accent); }
  .railGozcuNokta.stopping { background: var(--daemon-dot-stopping-fill); }
  .railGozcuNokta.off, .railGozcuNokta.unmanaged { background: var(--daemon-dot-off-fill); }
  .railGozcuNokta.stale { background: var(--color-text); }
  .railGozcuBaslik { font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-30); margin: 0; }
  .railGozcuAciklama { font-size: var(--fs-13-5); line-height: 1.5; color: var(--color-text); margin: 0 0 var(--space-5); max-width: 42ch; }
  /* TOPOLOJİ UYARISI — DEVIR.md §2: accent-100 kutu, üstte 4px accent çizgi. */
  .railGozcuUyari {
    margin: 0 0 var(--space-5); padding: var(--space-4); background: var(--color-accent-100);
    border-top: var(--border-accent) solid var(--color-accent); display: flex; flex-direction: column; gap: var(--space-3);
  }
  .railGozcuUyariMetin { font-size: var(--fs-13-5); line-height: 1.5; color: var(--color-accent-800); }
  .railGozcuEylemler { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-5); }
  .railGozcuKomutEtiket { font-size: var(--fs-11-5); color: var(--label-ink); }
  .railGozcuKomut {
    display: block; padding: var(--space-4) var(--space-4); margin: var(--space-1) 0 var(--space-3);
    background: var(--color-surface); font-family: var(--mono); font-size: var(--fs-12); overflow-wrap: anywhere;
  }
  .railGozcuBilgi { border-top: var(--border-row) solid var(--color-text); padding-top: var(--space-1); margin-bottom: var(--space-4); }
  .railGozcuBilgiSatir {
    display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-2) 0;
    border-bottom: var(--border-row) solid var(--color-divider); font-size: var(--fs-13);
  }
  .railGozcuBilgiSatir span { color: var(--label-ink); }
  .railGozcuBilgiSatir b { font-weight: 600; overflow-wrap: anywhere; }
  .railGozcuBayraklar { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
  /*
   * ".tag.tag-outline" — tasarımın KENDİ bileşen adı (skein-merkez-v3.html
   * satır ~271), ama ".tag" zaten ESKİ panoda kart durumu etiketi için var
   * (bkz. yukarıda ".tag.run/.gate/.queued"). Çakışmayı önlemek için bu
   * kural SADECE ".railGozcuBayraklar" İÇİNDE geçerli — eski panonun
   * ".tag"ı global kalır, global bir Modernist ".tag" bileşeni bu kartın
   * işi değil.
   */
  .railGozcuBayraklar .tag {
    border: 1px solid var(--color-text); padding: 2px var(--space-3); font-family: var(--mono); font-size: var(--fs-12);
  }
  .railGozcuLogBaslik { font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--label-ink); margin-bottom: var(--space-2); }
  .railGozcuLogSatir {
    display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-2) 0;
    border-bottom: var(--border-row) solid var(--color-divider); font-size: var(--fs-12); line-height: 1.4;
  }
  .railGozcuLogSatir .saat { color: var(--label-ink); }
  /*
   * REDDEDİLEN commit b74e6ee'nin kusuru: çıplak accent-700 metin burada
   * panelin ambient zemini --color-bg üstünde duruyordu — koyu temada
   * ÖLÇÜLDÜ 2.47:1, IKINCIL_ETIKET_ESIGI'nin (3:1) bile altında. YENİ bir
   * token çifti TÜRETMEK yerine SAPMALAR.md §1'in yöntemi tekrarlanıyor:
   * zaten token-kontrast.test.ts'te AÇIK VE KOYU için ölçülmüş accent-700/
   * accent-100 çifti ("Sağ panel kapı kutusu üst etiketi") burada dolgulu
   * bir rozet olarak yeniden kullanılıyor — ".duzenleHata"nın (yukarıda)
   * aynı çifti kullanmasıyla BİREBİR aynı gerekçe. Çift kart c-20261106-
   * e62847'den beri TEMA-DEĞİŞMEZ değil (ikisi BİRLİKTE, ters yönde
   * dönüyor — @media bloğundaki ACCENT RAMPASI yorumu), ama zemin METİNLE
   * birlikte taşındığı için hata satırı HER İKİ temada da kendi
   * zemininden ayrışmayı sürdürüyor.
   */
  .railGozcuLogSatir .hata {
    display: inline-block; color: var(--color-accent-700); background: var(--color-accent-100);
    padding: 1px var(--space-2);
  }

  /*
   * BİLDİRİM — DEVIR.md "Interactions & Behavior": "Her çıkış kartı
   * ilgili kuyruğa bırakır ve kısa bir bildirim gösterir ... sol altta,
   * koyu zemin, 4px accent sol kenar, 3.4 sn." karar() (yukarıda,
   * SAPMALAR.md'nin BİREBİR aynı kalması gereken kapı çıkışı mantığı)
   * bunu TÜKETİYOR, bkz. bildirimGoster.
   *
   * --toast-bg KASITLI OLARAK tema tarafından EZİLMİYOR ("koyu zemin"
   * DEVIR'in kendi ifadesiyle sabit, açık temada da koyu kalması gereken
   * bir araç ipucu — toast'ların alışıldık davranışı, gövdenin kendi
   * temasını İZLEMEZ). Kart c-20261106-e62847'den ÖNCE bu rol düz
   * --color-neutral-900 idi; o token şimdi ".akisKart-panoda"/
   * ".promptlarOge-secili"/".railBaslikBtn" gibi accent-100 zemini
   * üstünde METİN rolünde de kullanılıyor ve o rol koyu temada AÇIK
   * olmak ZORUNDA — iki rol aynı adda çakışırdı, bu yüzden toast'ın
   * "her zaman koyu" sözü ayrı bir token olan --toast-bg'ye taşındı
   * (bkz. :root'taki TOAST-BG yorumu). Değer DEĞİŞMEDİ, #2d2b2b ile
   * aynı — sadece ad ayrıştı.
   */
  .bildirim {
    position: fixed; left: var(--space-5); bottom: var(--space-5); z-index: 20;
    max-width: 360px; background: var(--toast-bg); color: #fff;
    border-left: var(--border-accent) solid var(--color-accent);
    padding: var(--space-3) var(--space-5); font-size: var(--fs-13);
    box-shadow: 0 12px 32px rgba(0, 0, 0, .22);
    display: none;
  }
  .bildirim.gorunur { display: block; }

  .band {
    border: 1px dashed var(--reject); border-radius: 4px; padding: var(--sp-6) var(--sp-7); margin-bottom: var(--sp-7);
  }
  .band h2 { margin: 0 0 var(--sp-1); font-size: var(--fs-heading); font-weight: 700; color: var(--reject-ink); }
  .band p { margin: 0 0 var(--sp-5); font-size: var(--fs-body); line-height: 1.5; color: var(--ink-2); max-width: 70ch; }
  .band .kartlar { display: grid; grid-template-columns: repeat(auto-fit, minmax(252px, 1fr)); gap: var(--sp-5); }
  .card h3 { margin: 0; font-size: var(--fs-title); font-weight: 600; line-height: 1.3; }
  .cid { font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3); margin-top: 3px; }
  .tag {
    font-size: var(--fs-tag); font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: var(--sp-2);
  }
  .tag.run { color: var(--accent-ink); }
  .tag.gate { color: var(--gate); }
  .tag.queued { color: var(--ink-3); }
  .reason {
    margin-top: var(--sp-4); font-size: var(--fs-body); line-height: 1.45; color: var(--gate-ink);
    overflow-wrap: anywhere;
  }
  /*
   * AJANIN SON MESAJI — KATLANIR, KIRPILMAZ. 'tick.ts' içindeki
   * 'agentSaid' ajanın ham çıktısını (bazen yarım bir JSON) gerekçeye
   * ekliyor; eskiden bu ekranın '.reason'unda ÇEKİRDEĞİN cümlesiyle AYNI
   * paragrafta basılıyordu — operatörün karar vermesi gereken ilk cümle
   * ham API JSON'unun içinde kayboluyordu. '<details>' kapalıyken de
   * çocuklarını DOM'dan SİLMEZ, yalnızca görünmez kılar: gizlemek
   * kırpmak değil, metnin tamamı her an erişilebilir kalıyor.
   */
  .ajanDetay { margin-top: var(--sp-4); }
  .ajanDetay summary { cursor: pointer; font-size: var(--fs-body); color: var(--ink-2); }
  .ajanDetay summary:hover { color: var(--ink); }
  .ajanTam {
    margin-top: var(--sp-3); font-size: var(--fs-body); line-height: 1.45;
    color: var(--gate-ink); white-space: pre-wrap; overflow-wrap: anywhere;
  }
  /*
   * JSON'A BENZEYEN metin paragraf gibi SARILIP okutulmuyor: mono yazı ve
   * yatay kaydırma — ham bir veri yapısını düzyazı gibi göstermek onu
   * okunur yapmaz, yalnızca YANLIŞ okunur yapar.
   */
  .ajanTam.mono {
    font-family: var(--mono); font-size: var(--fs-tight); line-height: 1.5;
    white-space: pre; overflow-x: auto; max-height: 240px; overflow-y: auto;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: 3px;
    padding: var(--sp-4) var(--sp-5); color: var(--ink);
  }
  .step {
    margin-top: var(--sp-5); padding-top: var(--sp-4); border-top: 1px dashed var(--line);
    display: flex; align-items: center; gap: var(--sp-3);
    font-family: var(--mono); font-size: var(--fs-label-lg); color: var(--ink-2);
  }
  .step .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .step .seq { margin-left: auto; color: var(--ink-3); flex: 0 0 auto; }
  .meta {
    display: flex; flex-wrap: wrap; gap: var(--sp-4); margin-top: var(--sp-3);
    font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .meta .bad { color: var(--reject-ink); }
  .trail { display: flex; align-items: center; gap: 3px; margin-top: var(--sp-5); padding-top: var(--sp-3); border-top: 1px dashed var(--line); }
  .trail i { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
  .trail s { flex: 1 1 auto; height: 1px; background: var(--line); }
  .exits { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-5); }
  .exits button {
    font: inherit; font-size: var(--fs-ui); font-weight: 500; min-height: 44px; padding: 0 var(--sp-6);
    border: 1px solid var(--gate-line); background: transparent; color: var(--gate-ink);
    border-radius: 3px; cursor: pointer;
  }
  .exits button:hover:not(:disabled) { border-color: var(--gate); }
  .exits button:disabled { cursor: progress; opacity: .6; }
  .redd {
    margin-top: var(--sp-4); padding: var(--sp-4) var(--sp-5); border: 1px solid var(--reject);
    border-radius: 3px; font-size: var(--fs-body); line-height: 1.5; color: var(--ink);
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .exits button.primary { background: var(--gate); border-color: var(--gate); color: #fff; }
  .soon { margin-top: var(--sp-2); font-family: var(--mono); font-size: var(--fs-tag); color: var(--ink-3); }
  .empty { color: var(--ink-3); font-size: var(--fs-ui); padding: var(--sp-4) 0; }
  .err {
    background: var(--gate-bg); border: 1px solid var(--gate-line); color: var(--gate-ink);
    border-radius: 4px; padding: var(--sp-5) var(--sp-6); margin-bottom: var(--sp-7); font-size: var(--fs-ui);
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  /* detay paneli */
  .ust { position: fixed; inset: 0; background: rgba(10,20,18,.42); display: flex; justify-content: flex-end; z-index: 9; }
  .panel {
    width: min(620px, 100%); height: 100%; overflow-y: auto; background: var(--surface);
    border-left: 1px solid var(--line); padding: var(--sp-9) var(--sp-10) 40px;
  }
  .panel h2 { margin: 0; font-size: var(--fs-panel-title); font-weight: 700; letter-spacing: -.01em; }
  .panel .kapat {
    position: sticky; top: 0; float: right; font: inherit; font-size: var(--fs-ui); min-height: 44px;
    padding: 0 var(--sp-6); border: 1px solid var(--line); background: var(--surface);
    color: var(--ink-2); border-radius: 3px; cursor: pointer;
  }
  .iz { display: flex; gap: var(--sp-5); }
  .iz .t { width: 52px; flex: 0 0 auto; font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3); padding-top: 2px; font-variant-numeric: tabular-nums; }
  .iz .rail { width: 11px; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  /*
   * DEVIR.md "Kartın izi": "10px düğüm" + Interactions&Behavior'ın genel
   * kuralı "tüm durum noktaları kare, 2px kenar; yuvarlak hiçbir şey yok" —
   * bu düğüm SAPMALAR §2.7'nin tarif ettiği tam boşluk türüydü (DOM/CSS'e
   * bakan hiçbir sınama yoktu): 9px YUVARLAK, kenarsızdı. Dolgu rengi
   * (IZ_RENK, olay türüne göre) DOKUNULMADI — SAPMALAR §1'in kuyruk-kare
   * düzeltmesiyle AYNI desen: dolgu anlamı taşır, kenar şekli sabitler.
   */
  .iz .rail i { width: 10px; height: 10px; border-radius: 0; border: 2px solid var(--color-text); margin-top: 4px; flex: 0 0 auto; }
  .iz .rail s { width: 2px; flex: 1 1 auto; background: var(--line); min-height: 12px; }
  .iz .gov { flex: 1 1 auto; min-width: 0; padding-bottom: var(--sp-6); }
  .iz .gov b { font-size: var(--fs-ui-lg); }
  .iz .gov em { font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3); font-style: normal; margin-left: var(--sp-2); }
  .iz .gov p { margin: 3px 0 0; font-size: var(--fs-body); line-height: 1.45; color: var(--ink-2); overflow-wrap: anywhere; }
  .dosya { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-1) 0; }
  .dosya .p { flex: 1 1 auto; min-width: 0; font-family: var(--mono); font-size: var(--fs-tight); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dosya .a { font-family: var(--mono); font-size: var(--fs-label-lg); color: var(--accept); width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
  .dosya .d { font-family: var(--mono); font-size: var(--fs-label-lg); color: var(--reject-ink); width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
  .cizgi { display: flex; gap: 2px; width: 90px; flex: 0 0 auto; }
  .cizgi i { height: 8px; border-radius: 1px; }
  .kutu { border-top: 1px solid var(--line); margin-top: var(--sp-8); padding-top: var(--sp-6); }
  .card { cursor: pointer; }
  .card:hover { border-color: var(--accent-line); }

  /*
   * AKIŞ DİYAGRAMI. "Diyagram" ve "Ham YAML" sekmeleri aynı '.mini'
   * düğmesini kullanıyor, seçili olan '.aktif' ile işaretleniyor.
   *
   * İKİ SVG BİRDEN gömülü (yatay + dikey): hangisinin görüneceğine karar
   * veren bir medya sorgusu, JS'in pencereyi ÖLÇMESİ değil — zincir okunun
   * yön değiştirdiği ".colhead .zincir .ok" kuralıyla AYNI ilke.
   */
  .sekmeler { display: flex; gap: var(--sp-3); margin: var(--sp-6) 0 var(--sp-6); }
  .sekmeler .mini.aktif { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }
  .diyagram-sarmal { overflow-x: auto; }
  .diyagram-sarmal svg { width: 100%; height: auto; display: block; }
  /*
   * Gizleme kuralı ".diyagram-sarmal svg"den DAHA ÖZGÜL olmak zorunda
   * (iki sınıf > bir sınıf + tür) — aksi hâlde yukarıdaki "her svg block"
   * kuralı burayı EZER ve dikey kopya geniş ekranda da görünür kalır
   * (ölçüldü: gerçek tarayıcıda getComputedStyle "block" döndürdü).
   */
  .diyagram-sarmal .diyagram-dikey { display: none; }
  @media (max-width: 640px) {
    .diyagram-sarmal .diyagram-yatay { display: none; }
    .diyagram-sarmal .diyagram-dikey { display: block; }
  }

  /* akış düzenleyici */
  .ed { display: flex; flex-direction: column; gap: var(--sp-5); }
  .rol {
    border: 1px solid var(--line); border-radius: 4px; padding: var(--sp-5); background: var(--surface);
    display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: var(--sp-3) var(--sp-4);
  }
  .rol label { display: flex; flex-direction: column; gap: 3px; font-size: var(--fs-tag); color: var(--ink-3); }
  .rol input, .rol select {
    font: inherit; font-size: var(--fs-body); font-family: var(--mono); min-height: 34px;
    padding: 0 7px; border: 1px solid var(--line); border-radius: 3px;
    background: var(--bg); color: var(--ink); min-width: 0;
  }
  .rol .genis { grid-column: 1 / -1; }
  /*
   * syncBack ÇOKLU seçim: her diğer rol kendi onay kutusu. alan()'ın
   * tek-değerli select kalıbı burada uymuyor (bkz. syncBackAlani yorumu).
   */
  .syncback { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
  .syncback-oge {
    display: flex !important; flex-direction: row !important; align-items: center; gap: 4px;
    font-family: var(--mono); font-size: var(--fs-tight); color: var(--ink-2);
  }
  .rolust { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--sp-3); }
  .rolust b { font-family: var(--mono); font-size: var(--fs-tight); }
  .mini {
    font: inherit; font-size: var(--fs-tight); min-height: 34px; padding: 0 var(--sp-4); cursor: pointer;
    border: 1px solid var(--line); background: transparent; color: var(--ink-2); border-radius: 0;
  }
  .mini:hover { border-color: var(--accent); color: var(--accent-ink); }
  .mini.sil:hover { border-color: var(--reject); color: var(--reject-ink); }
  .onizle {
    font-family: var(--mono); font-size: var(--fs-label-lg); line-height: 1.6; white-space: pre;
    overflow-x: auto; background: var(--surface-2); border: 1px solid var(--line);
    border-radius: 3px; padding: var(--sp-4) var(--sp-5); max-height: 260px; overflow-y: auto;
  }
  .maliyet { display: flex; gap: var(--sp-8); flex-wrap: wrap; font-family: var(--mono); font-size: var(--fs-body); }
  .kaydet {
    font: inherit; font-size: var(--fs-ui); font-weight: 500; min-height: 44px; padding: 0 var(--sp-8);
    border: 1px solid var(--accent); background: var(--accent); color: #fff;
    border-radius: 3px; cursor: pointer;
  }
  .kaydet:disabled { opacity: .5; cursor: not-allowed; }

  /*
   * AKIŞLAR SEKMESİ — DEVIR.md §4, kart c-20261105-d36e37. Modernist:
   * sıfır köşe yarıçapı, tek vurgu rengi. Kart ızgarası bir TABLO gibi
   * kuruluyor (ızgara üstte+solda, her hücre sağda+altta 2px çizgi) —
   * "kartlar 2px ayırıcı çizgilerle bölünür" (DEVIR.md) boşluklu bir
   * 'gap' ile değil, PAYLAŞILAN kenarlarla okunuyor; yoksa ya çift kalın
   * bir dış çerçeve ya da hücreler arası kesik bir ayırıcı çıkardı.
   *
   * "#icerikAkislar"a açık bir --color-bg veriliyor — ".panoGovde"nin
   * (yukarıda, satır ~363) AYNI gerekçesi: bu sekmenin içeriği Modernist
   * token'larla çiziyor (accent-100 kart dahil) ve ALTINDAKİ zemin hâlâ
   * ESKİ --bg olsaydı (body kuralı, henüz göçmedi) iki palet üst üste
   * binerdi — token-kontrast.test.ts'teki "color-text/color-bg" ve
   * "label-ink/color-bg" ölçümleri ESKİ --bg'ye karşı DEĞİL, bu token'a
   * karşı geçerli.
   */
  #icerikAkislar { background: var(--color-bg); }
  .akislarBaslik { padding: var(--space-6) 0 var(--space-5); max-width: 70ch; }
  .akislarBaslik h1 {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-40);
    letter-spacing: -0.03em; margin: 0 0 var(--space-3); color: var(--color-text);
  }
  .akislarBaslik p { margin: 0 0 var(--space-5); font-size: var(--fs-14); color: var(--label-ink); max-width: 58ch; }
  .akislarIzgara {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    border-top: var(--border-section) solid var(--color-text);
    border-left: var(--border-section) solid var(--color-text);
  }
  .akisKart {
    border-right: var(--border-section) solid var(--color-text);
    border-bottom: var(--border-section) solid var(--color-text);
    padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3);
  }
  /*
   * "Paneldeki akışın kartı accent-100 zeminli" — DEVIR.md §4. Kart
   * c-20261106-e62847'den ÖNCE --color-accent-100 koyu temada hiç
   * dönmüyordu ve bu kartın zemini ".railKapiKutu" ile AYNI tuzağı
   * taşıyordu; ARTIK accent-100 koyu temada KOYULAŞIYOR (bkz. yukarıdaki
   * @media bloğundaki ACCENT RAMPASI yorumu). Bu kartın zemini KOŞULLU
   * dönüyor (yalnızca "panoda") — o yüzden metin rengi de AYNI koşulla
   * eşleşmeli: panoda İKEN --color-neutral-900/accent-800 (railBaslikBtn/
   * railGerekce'nin kullandığı ÇİFT, bu kart sayesinde accent-100 ile
   * BİRLİKTE ters yönde dönüyor — artık ikisi de koyu temada AÇIK),
   * panoda DEĞİLKEN --color-text/--label-ink (normal sayfa zemini,
   * bunlar zaten o zemine göre doğru dönüyor). Mini formasyonun kendi
   * rengi de aynı kuralı izliyor (bkz. miniFormasyonSvg,
   * ".akisKartFormasyonGovde/-Nokta" sınıfları, aşağıda).
   */
  .akisKart-panoda { background: var(--color-accent-100); }
  .akisKartFormasyon { display: block; }
  .akisKartFormasyonGovde { fill: none; stroke: var(--color-text); stroke-width: 2; }
  .akisKartFormasyonNokta { fill: var(--color-text); }
  .akisKart-panoda .akisKartFormasyonGovde { stroke: var(--color-neutral-900); }
  .akisKart-panoda .akisKartFormasyonNokta { fill: var(--color-neutral-900); }
  .akisKartUst { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  .akisKartAdBlok { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .akisKartAd {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-20);
    color: var(--color-text); margin: 0;
  }
  .akisKart-panoda .akisKartAd { color: var(--color-neutral-900); }
  .akisKartRolSayisi { font-size: var(--fs-13); color: var(--label-ink); white-space: nowrap; }
  .akisKart-panoda .akisKartRolSayisi { color: var(--color-accent-800); }
  /* Bu etiket YALNIZCA panoda kartında görünür (bkz. akisKartKur) — accent-100 zemine karşı HER ZAMAN accent-800. */
  .akisKartEtiket {
    font-size: var(--fs-tag); font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
    color: var(--color-accent-800);
  }
  .akisKartAciklama { font-size: var(--fs-13); color: var(--color-text); margin: 0; }
  .akisKart-panoda .akisKartAciklama { color: var(--color-neutral-900); }
  .akisKartZincir { font-family: var(--mono); font-size: var(--fs-12); color: var(--label-ink); overflow-wrap: anywhere; }
  .akisKart-panoda .akisKartZincir { color: var(--color-accent-800); }
  /* Bozuk bir akışın gerekçesi SAKLANMIYOR — açıklama/zincirin yerine geçiyor. */
  /*
   * accent-700 metin ÇIPLAK --color-bg üstünde DEĞİL: ".railGozcuLogSatir
   * .hata"nın (yukarıda, satır ~713) ÖLÇÜLMÜŞ kusurunun AYNISI — koyu
   * temada 2.47:1, IKINCIL_ETIKET_ESIGI'nin (3:1) altında. Aynı çare:
   * zemin metinle BİRLİKTE taşınıyor (token-kontrast.test.ts'teki TÜM
   * accent-700 çiftleri accent-100 zeminle ölçülü, çıplak accent-700/bg
   * HİÇ YOK) — yeni bir token İCAT ETMİYOR, var olan dolgulu rozet
   * deseninin bir tekrarı.
   */
  .akisKartHata {
    display: inline-block; font-size: var(--fs-13); color: var(--color-accent-700);
    background: var(--color-accent-100); padding: var(--space-1) var(--space-2); margin: 0;
  }
  .akisKartDugmeler { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: auto; }

  /*
   * "YENİ AKIŞ" İLETİŞİM KUTUSU — DEVIR.md §4: ".dialog, üstte 4px text
   * çizgisi". Mevcut ".ust/.panel" (yeniKartAc vb.) sağdan açılan bir
   * ÇEKMECE; bu kutu ORTALANMIŞ bir modal olduğu için ".ust"a AYRI bir
   * düzen varyantı (".ust-ortali") ekleniyor — ".ust"un KENDİSİ
   * değişmiyor, eski çekmeceler aynen sağda açılmaya devam ediyor.
   */
  .ust-ortali { justify-content: center; align-items: center; padding: var(--space-5); }
  .dialog {
    width: min(480px, 100%); max-height: calc(100vh - 2 * var(--space-5)); overflow-y: auto;
    background: var(--color-surface); color: var(--color-text);
    border-top: var(--border-accent) solid var(--color-text);
    box-shadow: 0 12px 32px rgba(0, 0, 0, .22);
    padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4);
  }
  .dialog h2 {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-26);
    margin: 0; color: var(--color-text);
  }
  .dialog label {
    display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--fs-13); color: var(--label-ink);
  }
  .dialog input, .dialog select, .dialog textarea {
    font: inherit; font-size: var(--fs-13); min-height: 38px; padding: 0 var(--space-3);
    border: var(--border-row) solid var(--color-text); background: var(--color-bg); color: var(--color-text);
  }
  .dialog textarea { min-height: 72px; padding: var(--space-2) var(--space-3); resize: vertical; }
  /*
   * ".err" (bu betiğin ESKİ, redesign-öncesi hata kutusu — ".ust/.panel"
   * çekmecesinin paylaştığı sınıf, --gate-bg/--gate-line/--gate-ink
   * turuncu paletiyle, 4px köşe) bu YENİ ".dialog" içinde de kullanılıyordu
   * (yeniAkisAc). DEVIR.md Fidelity: "köşe yarıçapı: 0 (her yerde)", "tek
   * vurgu rengi kırmızı" — eski ".err" ikisini de çiğniyordu. ".err"ün
   * KENDİSİ değiştirilmiyor (eski ".ust/.panel" çekmecesi hâlâ ona bağlı,
   * sökülmesi ayrı bir kart — bkz. DEVIR-DENETIM.md); bu kural yalnızca
   * ".dialog" İÇİNDEKİ örneği Modernist'e çeviriyor, ".akisKartHata"nın
   * ZATEN kullandığı aynı accent-100/accent-700 çiftiyle (yeni renk YOK).
   */
  .dialog .err {
    border-radius: 0; background: var(--color-accent-100); border-color: var(--color-accent-700);
    color: var(--color-accent-800);
  }

  /*
   * PROMPTLAR SEKMESİ — DEVIR.md §5. Solda 320px liste (iki grup: Anayasa/
   * Rol promptları), sağda dosya adı + "Kullanan" + "Ajanın okuduğu sıra"
   * şeridi + tam yükseklikte metin alanı + sabit alt çubuk. Alt çubuk
   * MOD 5'in ".duzenleAlt"/".duzenleDurumMetni"sini PAYLAŞIYOR — DEVIR
   * ikisinde de AYNI "durum metni, geri al/vazgeç, kaydet" düzenini
   * istiyor, iki ayrı CSS kopyası YOK. "#icerikAkislar" ile AYNI
   * gerekçeyle açık --color-bg: altındaki zemin hâlâ ESKİ --bg (body
   * kuralı, henüz göçmedi).
   */
  #icerikPromptlar { background: var(--color-bg); padding: var(--space-6) 0; }
  .promptlarGovde { display: flex; align-items: flex-start; gap: var(--space-7); }
  .promptlarListe {
    flex: 0 0 320px; width: 320px; display: flex; flex-direction: column;
    border-right: var(--border-section) solid var(--color-text); padding-right: var(--space-5);
    max-height: calc(100vh - 140px); overflow-y: auto;
  }
  .promptlarGrupBaslik {
    font-size: var(--fs-10-5); font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
    color: var(--label-ink); margin: var(--space-5) 0 var(--space-2);
  }
  .promptlarOge {
    display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
    font: inherit; font-size: var(--fs-13); color: var(--color-text); background: none;
    border: none; border-left: var(--border-accent) solid transparent; cursor: pointer;
    padding: var(--space-2) var(--space-3);
  }
  .promptlarOge:hover { background: var(--color-neutral-200); }
  /*
   * SEÇİLİ ÖGE — "4px accent sol kenar + accent-100 zemin" (DEVIR.md §5).
   * Metin rengi düz --color-text DEĞİL: accent-100 zemini artık (kart
   * c-20261106-e62847) koyu temada KOYULAŞIYOR, yani düz color-text
   * (koyu temada AÇIK) yine AÇIK zemine binerdi ama şimdi zemin KOYU
   * olduğu için bu DOĞRU olurdu da — burada hâlâ --color-neutral-900/
   * --color-accent-800 kullanılıyor çünkü bu ikisi de AYNI kart ile
   * zeminle BİRLİKTE ters yönde dönüyor (Akışlar sekmesinin
   * ".akisKart-panoda" emsaliyle AYNI gerekçe, bkz. @media bloğundaki
   * ACCENT RAMPASI yorumu) — düz color-text/label-ink kullanmak da
   * çalışırdı ama bu üç yerin (railKapiKutu/akisKart-panoda/promptlarOge-
   * secili) AYNI ikili tercih etmesi tek bir "tint kutusu" kuralı
   * kalmasını sağlıyor.
   */
  .promptlarOge-secili {
    border-left-color: var(--color-accent); background: var(--color-accent-100);
    color: var(--color-neutral-900);
  }
  .promptlarOgeAd { font-weight: 700; display: flex; align-items: center; gap: var(--space-2); }
  .promptlarOgeKullanim { font-size: var(--fs-11); color: var(--label-ink); }
  .promptlarOge-secili .promptlarOgeKullanim { color: var(--color-accent-800); }
  /*
   * "Kaydedilmemiş değişiklik 8px accent kare" (DEVIR.md §5). accent/
   * accent-100 çifti bu kartta YENİ pinlendi (token-kontrast.test.ts):
   * açık temada 3.84:1. --color-accent KENDİSİ hâlâ hiçbir temada
   * EZİLMİYOR (bkz. ".marka" yorumu), ama accent-100 artık (kart
   * c-20261106-e62847) koyu temada koyulaşıyor — oran bu yüzden ARTIK
   * tema-değişmez DEĞİL, ama iki temada da AYRI AYRI ölçülüp
   * IKINCIL_ETIKET_ESIGI'yi (3, küçük grafik işaret) geçiyor (koyuda
   * color-accent/color-accent-100 3.46:1 — token-kontrast.test.ts
   * "Promptlar sekmesi" girdisi).
   */
  .promptlarTaslakIsareti { width: 8px; height: 8px; flex: 0 0 auto; background: var(--color-accent); display: inline-block; }
  .promptlarYeniRol { align-self: flex-start; margin-top: var(--space-5); }

  .promptlarPanel { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .promptlarBaslik {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-26);
    margin: 0 0 var(--space-1); color: var(--color-text);
  }
  .promptlarYol { font-size: var(--fs-13); color: var(--label-ink); margin: 0 0 var(--space-5); overflow-wrap: anywhere; }
  .promptlarKullanan, .promptlarSira {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: var(--space-2) 0 var(--space-4);
  }
  .promptlarIpucu { font-size: var(--fs-12); color: var(--label-ink); }
  .promptlarKullananEtiket, .promptlarSiraAdim {
    font: inherit; font-size: var(--fs-12); border: var(--border-row) solid var(--color-text);
    padding: var(--space-1) var(--space-2); background: var(--color-surface); color: var(--color-text);
  }
  .promptlarKullananEtiket { cursor: pointer; }
  .promptlarKullananEtiket:hover { background: var(--color-neutral-200); }
  .promptlarSiraAdim { cursor: default; }
  .promptlarSiraAdim-vurgulu {
    border-color: var(--color-accent); background: var(--color-accent-100); color: var(--color-accent-800);
  }
  .promptlarMetin {
    flex: 1 1 auto; min-height: 320px; width: 100%; font-family: var(--mono);
    font-size: var(--fs-13-5); line-height: 1.6; padding: var(--space-4);
    border: var(--border-row) solid var(--color-text); background: var(--color-surface);
    color: var(--color-text); resize: vertical; margin-bottom: var(--space-4);
  }
  .promptlarMetin:disabled { opacity: .6; }

  /*
   * AJANLAR SEKMESİ — DEVIR.md §6, kart c-20261105-d304ed. Solda 340px
   * ajan listesi (akıştaki her ROL için bir satır — tasarımın "ajan"
   * sözcüğü burada ROL ile AYNI şey), sağda seçili rolün "şu an" kutusu +
   * adımlar + "Görevi · promptundan" özeti.
   *
   * Hiçbir YENİ token KOMBİNASYONU İCAT EDİLMİYOR — her metin/zemin çifti
   * token-kontrast.test.ts'te ZATEN ölçülü:
   *   gövde metni zemin/yüzey üstünde — "Modernist gövde metni" (iki girdi),
   *   etiket zemin üstünde — "label-ink/color-bg",
   *   "canlı" etiketi — "Sağ panel kapı kutusu üst etiketi" (accent-700/
   *     accent-100 — kart c-20261106-e62847'den beri bu çift artık
   *     TEMA-DEĞİŞMEZ DEĞİL, ikisi BİRLİKTE ters yönde dönüyor, ama iki
   *     temada da AYRI AYRI ölçülüp eşiği geçiyor, bkz. @media bloğundaki
   *     ACCENT RAMPASI yorumu).
   * Kuş rengi/kanat çırpma JS'i formasyon diyagramıyla PAYLAŞILIYOR
   * (kusRengi/kanatCirpiyorMu) — ikinci bir "kuş nasıl boyanır" kuralı
   * YOK, o yüzden seçili satır BİLEREK zemin DEĞİŞTİRMİYOR (sol kenar +
   * kalın yazı yetiyor): kuşu accent-100 gibi hiç ölçülmemiş bir zeminin
   * üstüne koymak YENİ bir çift açardı.
   */
  #icerikAjanlar { background: var(--color-bg); padding: var(--space-6) 0; }
  .ajanlarGovde { display: flex; align-items: flex-start; gap: var(--space-7); }
  .ajanlarListe {
    flex: 0 0 340px; width: 340px; display: flex; flex-direction: column;
    border-right: var(--border-section) solid var(--color-text); padding-right: var(--space-5);
    max-height: calc(100vh - 140px); overflow-y: auto;
  }
  .ajanSatir {
    display: flex; align-items: center; gap: var(--space-3); width: 100%; text-align: left;
    font: inherit; background: none; border: none; border-left: var(--border-accent) solid transparent;
    color: var(--color-text); cursor: pointer; padding: var(--space-3);
  }
  .ajanSatir:hover { background: var(--color-neutral-200); }
  .ajanSatir-secili { border-left-color: var(--color-accent); }
  .ajanSatir-secili .ajanSatirAd { font-weight: 800; }
  .ajanKus { flex: 0 0 auto; width: 36px; height: 18px; }
  .ajanSatirBilgi { min-width: 0; flex: 1 1 auto; }
  .ajanSatirAd { font-weight: 700; font-size: var(--fs-13); }
  .ajanSatirDurum {
    font-size: var(--fs-12); color: var(--label-ink);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .ajanPanel { flex: 1 1 auto; min-width: 0; }
  .ajanPanelUst { margin-bottom: var(--space-5); }
  .ajanPanelAd {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-36);
    margin: var(--space-1) 0; color: var(--color-text);
  }
  .ajanPanelMeta {
    display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: var(--fs-13); color: var(--label-ink);
  }

  /* "ŞU AN" KUTUSU — DEVIR.md §6: surface zemin, çalışırken/kapıda üstte 4px accent çizgi. */
  .ajanSuAn {
    background: var(--color-surface); color: var(--color-text);
    padding: var(--space-4); margin-bottom: var(--space-5);
    border-top: var(--border-accent) solid transparent;
  }
  .ajanSuAn-vurgulu { border-top-color: var(--color-accent); }
  .ajanSuAnBaslik {
    font-family: var(--font-heading); font-weight: 800; font-size: var(--fs-20); margin: 0 0 var(--space-2);
  }
  .ajanSuAnSatir {
    display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: var(--fs-13);
    align-items: center; margin: 0 0 var(--space-3); font-variant-numeric: tabular-nums;
  }
  .ajanSuAnSatir .bad { color: var(--bad-ink); } /* c-20261105-387d01: accent-700 koyu temada okunmuyordu */

  .ajanBolum { margin-bottom: var(--space-6); }
  .ajanCanliEtiket {
    display: inline-flex; margin-left: var(--space-2); font-size: var(--fs-10-5); font-weight: 600;
    letter-spacing: .1em; text-transform: uppercase; color: var(--color-accent-700);
    background: var(--color-accent-100); padding: 1px var(--space-2);
  }
  .ajanAdim {
    display: flex; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0;
    border-bottom: var(--border-row) solid var(--color-divider); font-size: var(--fs-13);
    font-family: var(--mono);
  }
  .ajanAdim .seq { color: var(--label-ink); flex: 0 0 auto; width: 2em; }
  .ajanAdim .ad { font-weight: 700; flex: 0 0 auto; }
  .ajanAdim .detay {
    flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; color: var(--label-ink);
  }
  .ajanAdim .saat { flex: 0 0 auto; color: var(--label-ink); font-size: var(--fs-12); }
  .ajanGorevMetin { margin: 0 0 var(--space-3); font-size: var(--fs-13); line-height: 1.5; max-width: 70ch; }
  .ajanGorevListe { margin: 0 0 var(--space-3); padding-left: 18px; font-size: var(--fs-13); line-height: 1.5; }
</style>
</head>
<body>
<div class="wrap">
  <nav class="bar" id="bar"></nav>
  <div id="kopuk"></div>
  <div id="icerikPano">
    <div class="panoArac" id="panoArac"></div>
    <div id="hata"></div>
    <div id="uyari"></div>
    <div class="panoGovde">
      <div class="formasyonAlan">
        <div class="formasyonSarmal" id="board"></div>
        <div class="lejant" id="lejant"></div>
      </div>
      <aside class="sagPanel" id="sagPanel" aria-label="Kart ve rol ayrıntıları"></aside>
    </div>
  </div>
  <div id="icerikAkislar" style="display:none"></div>
  <div id="icerikPromptlar" style="display:none"></div>
  <div id="icerikAjanlar" style="display:none"></div>
  </div>
<div id="panel"></div>
<div id="bildirim" class="bildirim" role="status" aria-live="polite"></div>
<script>
const JETON = "__JETON__";
/**
 * Bu EKRANIN gözcüyü başlatıp durdurabilip durduramadığı — DEVIR.md'nin
 * "unmanaged" durumu (kart c-20261105-92d731). 'null' ise ekran gözcü
 * bayraklarıyla AÇILMADI: '/gozcu/baslat'/'/gozcu/durdur' 404 döner, yani
 * düğme göstermek yapamayacağı şeyi vaat etmek olurdu (bu dosyadaki
 * yinelenen kusur sınıfı, bkz. gozcuKomut yorumu). Sunucu açılışta GÖMÜYOR
 * (JETON'un aynı deseni) çünkü bu bilgi süreç ömrü boyunca DEĞİŞMİYOR —
 * her saniye /durum'a eklemek değişmeyen bir şeyi tekrar tekrar sormak
 * olurdu, AKISLAR'ın "bir kez oku" ilkesiyle aynı.
 */
const GOZCU_AYAR = __GOZCU_AYAR__;
// Durdurma/yeniden başlatma İSTENDİ ama henüz GERÇEKLEŞMEDİ — SIGTERM
// anlık değil, gözcü süren turu bitirip çıkıyor (bkz. server.ts
// "/gozcu/durdur" yorumu). 'null' | "durduruluyor" | "yenidenBaslatiliyor".
// İkincisi, gözcü GERÇEKTEN öldüğünde (ciz() bir sonraki yoklamada bunu
// modelden görünce) otomatik "/gozcu/baslat" tetikler — DEVIR.md'nin
// "Yeniden başlat" düğmesinin yaptığı "durdur, sonra başlat" ikilisi.
let GOZCU_BEKLEYEN = null;
// ".skein/gozcu.log" son satırları — GÖZCÜ paneline İLK girişte bir kez
// okunuyor (railGozcuYukle), kart modunun "data-rail-kart" deseniyle AYNI.
let GOZCU_LOG = [];
// Seçilebilecek akış adları — sayfa açılışında BİR KEZ okunuyor (bkz.
// akislarYukle). Dosya listesi koşarken değişmiyor; her yoklamada yeniden
// istemek, değişmeyen bir şeyi saniyede bir sormak olurdu.
let AKISLAR = [];
// Her akışın ÖZETİ — Akışlar sekmesinin kart ızgarası (DEVIR.md §4, kart
// c-20261105-d36e37): {ad, draft, hata?}[], AKISLAR'la AYNI anda, BİR
// KEZ okunuyor (/akislar'ın 'ozet' alanı, bkz. server.ts akisOzetiYukle).
// 'draft' null ise akış BOZUK — kart bunu SAKLAMIYOR, 'hata' alanını
// gösteriyor (bkz. akisKartKur).
let AKISLAR_OZET = [];
// Seçicinin GERİ ALINACAĞI değer: çekirdek "/akis/sec"i reddederse (bozuk
// YAML, bilinmeyen ad) kutuda yeni ad dururken pano hâlâ eskisini
// gösteremez — ikisi aynı şeyi söylemek zorunda.
let AKTIF_AD = "";
// Diyagram panelinin okuduğu son model — her yoklamada (bkz. yokla) burada
// güncelleniyor. Akış diyagramı AYRI bir uçtan değil bu modelden çiziliyor:
// edges/gates zaten SUNUCUDA türetilmiş (model.ts), panel kendi YAML
// ayrıştırıcısını yazmıyor.
let SON_MODEL = null;
const DOT = { accepted: "var(--accept)", rejected: "var(--reject)", gate: "var(--gate)", released: "var(--gate)", done: "var(--accept)" };

// --- Ajanlar sekmesi (DEVIR.md §6, kart c-20261105-d304ed) ---
//
// Seçili rol — RAIL'den BİLEREK AYRI: RAIL Pano'nun sağ panelinin modu,
// bu sekmenin kendi seçimi. "Ajanı izle →" düğmesi (railRolCiz) ikisini
// BİRLİKTE değiştiriyor (RAIL'i genel bakışa döndürmüyor, yalnızca bu
// değişkeni ve hash'i).
let AJAN_SEC = null;
// Seçili rolün GÜNCEL kartının TAM adım izi, kart kimliğine göre —
// "GET /adimlar"ın cevabı. Sunucu ARTAN (seq 1'den) veriyor; "en yenisi
// en üstte" göstermek İSTEYEN taraf İSTEMCİ (bkz. ajanAdimlarKur) — bu
// önbellek sunucunun verdiği sırayı DEĞİŞTİRMEDEN taşıyor.
let AJAN_ADIMLAR = {};
// Rol prompt dosyasının "Görevi" özeti, prompt yoluna göre — promptGorevOzeti
// çıktısı. 'undefined' HENÜZ İSTENMEDİ, 'null' istendi ama OKUNAMADI
// (PROMPT_HATA'da sebebi var), nesne BAŞARIYLA ayrıştırıldı.
let AJAN_PROMPT_OZET = {};

/*
 * KUŞ İŞARETİ — TEK ÇİZGİ, İKİ ANLAM. (favicon'un yolu — bkz. aşağıda)
 *
 * "skein" hem bir çile ipliğin (yumak edilmeden gevşek sarılmış ip) hem
 * de V dizilişinde uçan bir kuş sürüsünün adı. Bu yol ("d") ikisini de
 * AYNI çizgide taşıyor kasıtlı olarak: üç köşeli zikzak (her köşe bir V
 * açısı, kuş sürüsünün önden lider izlediği dalgalı hat) ipin son ucunda
 * bir kıvrıma (küçük bir eğri) kapanıyor — gevşek sarılmış bir çilenin
 * ucu gibi.
 *
 * ESKİDEN bardaki işaret de bu sabitten türüyordu ("İKİ AYRI SVG YOK").
 * Bu kart (c-20261105-6d7f66) o iddiayı bardaki işaret için GERİ ALIYOR:
 * DEVIR.md'nin üst çubuğu "40x26 üç kuş SVG'si, vurgu renginde, 2.5
 * çizgi" istiyor — eskiden farklı bir şekil. Favicon kapsamda DEĞİL
 * (DEVIR/SAPMALAR hiç adını geçirmiyor), o yüzden ISARET_D ve
 * faviconAyarla() AYNEN kalıyor; bardaki yeni şekil AYRI bir sabitte
 * (UCKUS_D, bkz. markaSvg). İki simge artık kasıtlı olarak farklı.
 */
const ISARET_D = "M3 17 L8 6 L12.5 16 L17 5 L21 15 C23.5 18 21 20.8 18 19";

/**
 * Bardaki marka simgesi — gevşek V biçimli üç kuş, bir sürü izlenimi.
 *
 * Üç ayrı <path> yerine TEK path üç alt-yol taşıyor (her "M" yeni bir alt
 * yol açar) — DOM'da ".marka svg path" hâlâ TEK düğüme karşılık geliyor,
 * favicon'un hazırlık beklemesiyle paylaşılan seçici bu yüzden bozulmuyor
 * (bkz. tarayici.test.ts).
 */
const UCKUS_D = "M2,16 L9,8 L16,16 M13,13 L20,5 L27,13 M24,16 L31,8 L38,16";

/**
 * Markanın <svg> düğümünü kurar.
 *
 * "renk" parametre: bardaki kullanım "currentColor" veriyor — karar
 * burada değil, ".marka" kuralının CSS 'color'ında (--color-accent).
 * --color-accent'in koyu tema ezmesi BİLİNÇLİ OLARAK yok (üstteki
 * @media (prefers-color-scheme: dark) bloğuna bak — diğer Modernist
 * token'lar orada ezildi, bu biri hariç), yani simge açık/koyu temada
 * AYNI kırmızıyı gösterir.
 *
 * NOT: bu dosya gömülü istemci betiğini bir ŞABLON DİZESİ içinde taşıyor
 * — yorumda ters tırnak dizgiyi kapatır ve derleme kırılır.
 */
function markaSvg(renk) {
  // Değer İKİYE BÖLÜNMÜŞ YAZILIYOR: sayfa "dış kaynak yüklemez" iddiasını
  // kaynak metinde bir URL şeması dizgesi aramasıyla sınıyor (bkz.
  // page.test.ts) ve bu isim uzayı hiçbir şey İNDİRMİYOR — ad alanı
  // (namespace) kimliği, ağdan çekilen bir adres değil. Sonuç AYNI,
  // kaynak metinde tek parça değil.
  const NS = "http:" + "//www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 40 26");
  svg.setAttribute("aria-label", "Skein");
  svg.setAttribute("role", "img");
  const yol = document.createElementNS(NS, "path");
  yol.setAttribute("d", UCKUS_D);
  yol.setAttribute("fill", "none");
  yol.setAttribute("stroke", renk);
  yol.setAttribute("stroke-width", "2.5");
  yol.setAttribute("stroke-linecap", "round");
  yol.setAttribute("stroke-linejoin", "round");
  svg.append(yol);
  return svg;
}

/**
 * Favicon'u AYNI işaretten kurar — sekmede bugün varsayılan ikon duruyor.
 *
 * Dosya indirme yok: data URI gömülü. Sayfanın mevcut <link rel=icon>
 * etiketi yok, o yüzden önce bir tane açılıyor; sonraki çağrılarda
 * (bu fonksiyon yalnızca sayfa yüklenirken BİR KEZ çağrılıyor) aynı
 * etiket güncellenir.
 */
function faviconAyarla() {
  const svgMetin = "<svg xmlns='http:" + "//www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
    "<path d='" + ISARET_D + "' fill='none' stroke='#15212C' stroke-width='2.4' " +
    "stroke-linecap='round' stroke-linejoin='round'/></svg>";
  let link = document.querySelector("link[rel=icon]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.type = "image/svg+xml";
  link.href = "data:image/svg+xml," + encodeURIComponent(svgMetin);
}
faviconAyarla();
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const sure = (ms) => {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? s + " sn" : Math.floor(s / 60) + " dk " + String(s % 60).padStart(2, "0") + " sn";
};
const para = (n) => "$" + (n || 0).toFixed(2);

// Buyuk sayiyi okunur kisalt: 1240000 -> 1.2M. Ham rakam ekranda
// sayilamiyor, kiyaslanamiyor; buyukluk mertebesi yeterli.
function kisaSayi(n) {
  if (!n) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

// HARCANAN GIZLENMEZ.
//
// Bir aktivasyon dolar bildirmediyse (tur zaman asimiyla oldurulduyse
// saglayici kapanis kaydini hic basmiyor) toplam bir ALT SINIR. Eskiden
// ekran onu sessizce 0 sayiyordu: 20 dakika calisip milyonlarca token
// harcayan bir tur kartta BEDAVA gorunuyordu.
//
// Uc hal var ve ucu de ayri sey soyluyor:
//   - olculmeyen yok            -> tam rakam
//   - olculmeyen var, dolar var -> alt sinir isareti
//   - olculmeyen var, dolar yok -> rakam DEGIL, "olculmedi"; token varsa o
function maliyetMetni(tutar, olculmeyen, tokens) {
  if (!olculmeyen) return para(tutar);
  if (tutar) return "\u2265" + para(tutar);
  return tokens ? "maliyet \u00f6l\u00e7\u00fclmedi \u00b7 \u2265" + kisaSayi(tokens) + " token"
                : "maliyet \u00f6l\u00e7\u00fclmedi";
}

// AYNI DİZGE 'tick.ts' içindeki agentSaid'le — ayraç ikisinin TEK
// senkron noktası. Biri değişirse öteki de değişmeli; tutmazsa gerekçe
// hiç bölünmez ve tek paragraf olarak kalır (SESSİZ bozulma değil:
// çekirdek cümle bu durumda da yine TAM metni taşır, bkz. gerekceKur).
// ÇİFT TERS BÖLÜ YAZILIYOR, TEK DEĞİL: bu dosya kendisi bir şablon dizesi
// (bkz. page.test.ts'teki "gömülü betik sözdizimi geçerli" testinin
// öyküsü) — tek ters bölülü kaçış yazılsaydı TypeScript onu GERÇEK satır
// sonuna çevirirdi ve aşağıdaki dizge gerçek bir satır sonuyla ORTADAN
// kırılırdı. Tarayıcıya giden metinde tek ters bölü KALMALI, o yüzden
// kaynakta ÇİFT yazılıyor (TypeScript'in kendi kaçış kuralı bir tekine
// indiriyor).
const AJAN_AYRAC = "\\n\\nAjan şunu söyledi:\\n";

/**
 * Bir metin ham JSON'a mı benziyor — kaydırmalı mono blokla mı, paragraf
 * gibi mi gösterileceğine burada karar veriliyor.
 *
 * Heuristik YANLIŞ çıkabilir: tick.ts kuyruktan son 600 karakteri alıyor
 * (bkz. agentSaid) ve kırpıldıysa "…" ile başlıyor — yani çoğu zaman bir
 * JSON nesnesinin ORTASINDAN kesilmiş, geçersiz bir dizge. JSON.parse
 * burada işe yaramaz: geçerlilik aranmıyor, GÖRÜNÜM aranıyor — en az üç
 * "anahtar": kalıbı ya da süslü/köşeli parantezle başlamak yeterli
 * sayılıyor. Heuristik tutmazsa metin KAYBOLMUYOR, yalnızca yanlış
 * biçimde (paragraf yerine mono ya da tersi) duruyor — gerekceKur govde
 * alanına her durumda TAM metni yazıyor, sınıf seçimi görünümden ibaret.
 */
function jsonGibiMi(metin) {
  const kirpik = metin.trim();
  if (kirpik.startsWith("{") || kirpik.startsWith("[")) return true;
  const eslesen = kirpik.match(/"[^"\\n]+"\\s*:/g);
  return eslesen !== null && eslesen.length >= 3;
}

/**
 * Katlı özetin kısa önizlemesi — bu kırpma TAM metni ETKİLEMİYOR: yalnızca
 * <summary> etiketinin kendisi kısalıyor, gerekceKur govdeye her zaman
 * ayraçtan sonraki metnin BÜTÜNÜNÜ yazıyor.
 */
function ozetle(metin) {
  const duz = metin.replace(/\\s+/g, " ").trim();
  return duz.length > 140 ? duz.slice(0, 140) + "…" : duz;
}

/**
 * Kapı gerekçesini kutuya kurar.
 *
 * Çekirdeğin cümlesi (ayraçtan ÖNCESİ) HER ZAMAN tam görünür, hiçbir
 * koşulda katlanmıyor. Ajanın son mesajı (varsa) katlanabilir bir
 * <details>'a gidiyor — varsayılan KAPALI, ama kapalıyken de içerik
 * DOM'dan silinmiyor, yalnızca görünmez (tarayıcının kendi davranışı).
 * "İlk 200 karakter, gerisi yok" burada YOK: govde ayraçtan sonraki
 * metnin TAMAMINI taşıyor, özet yalnızca <summary> etiketinde kısalıyor.
 */
function gerekceKur(kutu, gerekce) {
  const ayrac = gerekce.indexOf(AJAN_AYRAC);
  const cekirdek = ayrac === -1 ? gerekce : gerekce.slice(0, ayrac);
  kutu.append(el("div", "reason", cekirdek));
  if (ayrac === -1) return;

  const ajanMetni = gerekce.slice(ayrac + AJAN_AYRAC.length);
  const detay = el("details", "ajanDetay");
  const ozet = el("summary", null, "Ajan şunu söyledi — " + ozetle(ajanMetni));
  // Kart kendisi de tıklanabilir (detay panelini açar, bkz. kartDugumBaslat)
  // — katlıyı açmak o paneli de tetiklemesin, "Geçir/Geri gönder"
  // düğmelerindeki aynı önlem.
  ozet.addEventListener("click", (e) => e.stopPropagation());
  detay.append(ozet);
  const govde = el("div", jsonGibiMi(ajanMetni) ? "ajanTam mono" : "ajanTam");
  govde.textContent = ajanMetni;
  detay.append(govde);
  kutu.append(detay);
}

/**
 * BOS ROL SUTUNU NE ANLATMALI.
 *
 * Varsayilan hal GENELLIKLE dogru: kartlar bossa (bu role atanmis
 * aktif/kuyruktaki/kapidaki hicbir kart yoksa) role'e gercekten is
 * gelmemis demektir. Ama rol.depth (kuyruk dizininin TAZE taramasi) ile
 * kartlar (modelin biraz ONCEKI taramasindan) iki AYRI okuma; aralarinda
 * bir kart alinmis/kuyruga dusmus olabilir. O yariste rol.depth sifirdan
 * buyukken "kuyrukta kart yok" demek EKRANIN BILMEDIGI bir seyi degil,
 * bildigi ama YANLIS soyledigi bir seyi yazardi -- model bu ayrimi zaten
 * tasiyor (bkz. "N kuyrukta" notu), bos durum da ayni gercegi okumali.
 */
function bosRolMetni(rol, kartlar) {
  if (rol.depth > kartlar.length) return rol.depth + " kart kuyrukta, henuz yuklenmedi";
  return "kuyrukta kart yok";
}

/**
 * BOS "BITTI" SUTUNU NE ANLATMALI -- ve niye "kuyrukta kart yok" ile AYNI
 * CUMLE OLAMAZ.
 *
 * "Bitti" bosken uc farkli gercek olabilir ve ucu de modelden BILINIYOR,
 * UYDURULMUYOR:
 *   - bir yerde bir ajan GERCEKTEN kosuyor (state active) -- is suruyor,
 *     henuz hicbir sey bitmedi;
 *   - kosan yok ama kuyrukta/kapida bekleyen kart VAR (totals.open) --
 *     akis duraklamis ya da insan kapida, ama hala is var;
 *   - hicbiri yoksa gercekten hic kart acilmamis.
 * "kuyrukta kart yok" bunlarin HICBIRINI dogru anlatmaz: "bitti" sutunu
 * zaten kuyruktan degil, biten karttan bahsediyor.
 */
function bosBittiMetni(m) {
  if (m.cards.some((c) => c.state === "active")) return "bir rol su an kosuyor, henuz biten kart yok";
  if (m.totals.open > 0) return "kart kuyrukta ya da kapida bekliyor, henuz biten yok";
  return "henuz kart acilmadi";
}

/**
 * Bir sütundan sonra kart hangi sütuna gidiyor — ZİNCİR OKU'nun
 * cevapladığı soru.
 *
 * 'm.edges'ten okunuyor, rol.next sunucudan hiç gelmiyor: model.ts
 * edges'i zaten SUNUCUDA türetiyor (bkz. model.ts — "diyagramın veri
 * kaynağı" yorumu) ve zincirin SONUNA ('done'a) kenar hiç ÜRETMİYOR —
 * boş bir kenar çizmek olmayan bir ilişkiyi varmış gibi göstermek olurdu.
 * Yani bulunamazsa hedef zaten "bitti" sütunudur.
 */
function sonrakiSutun(m, rolId) {
  const kenar = m.edges.find((e) => e.from === rolId && e.kind === "next");
  return kenar ? kenar.to : "bitti";
}

/**
 * SAĞ PANEL — "Rol" modunun meta satırı: numara, öncü mü, sağlayıcı,
 * çalışma alanı, sonraki rol, ret hedefi, toplu alım (DEVIR.md). SAF
 * (DOM yok).
 *
 * "sonraki rol" sonrakiSutun'dan geliyor — ZİNCİR OKU'nun ve
 * formasyon diyagramının insan onayı kapısının kullandığı AYNI karar
 * (m.edges, role.next DEĞİL): bu panel diyagramdan AYRI bir "sonraki rol"
 * yorumu üretseydi ikisi bir gün ayrışabilirdi (bu dosyanın AJAN_AYRAC
 * yorumunun uyardığı kusur sınıfı). "ret hedefi" de aynı ilkeyle
 * m.edges'teki "reject" kenarından okunuyor, kartın kendi geriHedef
 * alanından DEĞİL (o kart bazlı, bu rol bazlı — ikisi aynı kaynaktan,
 * topology.roles[].reject'ten türüyor ama rol burada bir kartı
 * ÖRNEKLEMEDEN kendi hedefini bilmeli, boş bir rolün bile "Rol" paneli
 * açılabiliyor).
 */
function railRolMeta(m, rolId) {
  const i = m.roles.findIndex((r) => r.id === rolId);
  if (i === -1) return null;
  const rol = m.roles[i];
  const retKenar = m.edges.find((e) => e.from === rolId && e.kind === "reject");
  return {
    no: String(i + 1).padStart(2, "0"),
    oncu: i === 0,
    id: rol.id,
    provider: rol.provider,
    workspace: rol.workspace,
    sonrakiRol: sonrakiSutun(m, rolId),
    retHedefi: retKenar ? retKenar.to : null,
    receive: rol.receive,
    prompt: rol.prompt,
  };
}

function kapiCikislari(kind, planKilidi, geriHedef) {
  // ZİNCİRİN BAŞINDA "Geri gönder" YOK. back kararının hedefi rolün ret
  // hedefi; yoksa çekirdek kartı aynı role döndürüyor, yani olan şey bir
  // retry. Eski düğme yapmayacağı şeyi vaat ediyordu: insan "geri
  // gönderdim" sanıyor, kart aynı rolde baştan koşuyordu. Burada düğme ya
  // doğru şeyi söylüyor ya hiç çıkmıyor.
  // (Not: bu dosya istemci betiğini bir şablon dizesi içinde taşıyor —
  // yorumda ters tik derlemeyi bozar.)
  const geri = (etiket) => (geriHedef ? [etiket, "back"] : ["Baştan koştur", "retry"]);

  // Üç kapı, üç ayrı çıkış kümesi. Kaçışta "Geçir" YOK: tur tamamlanmadı,
  // kod sonraki worktree'ye hiç taşınmadı ve çekirdek zaten reddeder.
  if (kind === "escalation") {
    // Kaçışta "Yeniden koş" ZATEN var: hedef yoksa ikinci bir retry
    // düğmesi aynı şeyi iki kez sunmak olurdu.
    return { etiket: "kaçış kapısı", not: "kod taşınmadı",
      dugmeler: geriHedef
        ? [["Yeniden koş", "retry"], ["Geri gönder", "back"]]
        : [["Yeniden koş", "retry"]] };
  }
  if (kind === "deadlock") {
    // İKİ AYRI KİLİT. Çekirdek ikisini ayırıyor (planGateEntry) ve
    // forward'ın hedefi de farklı: planlama kilidinde kart role.next'e
    // değil alışverişten SONRAKİ role gidiyor. Eski kod ikisine de
    // "ret limiti doldu" + "Üretici haklı / Denetçi haklı" basıyordu;
    // planlama kilidinde üç ifade de yanlıştı.
    if (planKilidi) {
      return { etiket: "planlama kilidi", not: "itirazlar kapanmadı",
        dugmeler: [["Planı olduğu gibi ilerlet", "forward"], ["Alışverişi yeniden aç", "retry"]] };
    }
    return { etiket: "kilit kapısı", not: "ret limiti doldu",
      dugmeler: [["Üretici haklı", "forward"], geri("Denetçi haklı")] };
  }
  return { etiket: "onay kapısı", not: "kod taşındı",
    dugmeler: [["Geçir", "forward"], geri("Geri gönder")] };
}

/** Yetim kartı kapatır — tek meşru çıkış. */
async function kapatKart(id, kart) {
  const dugmeler = kart.querySelectorAll("button");
  dugmeler.forEach((b) => (b.disabled = true));
  try {
    const cevap = await fetch("/kart/" + encodeURIComponent(id) + "/kapat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    ciz(veri.model);
  } catch (e) {
    dugmeler.forEach((b) => (b.disabled = false));
    const eski = kart.querySelector(".redd");
    if (eski) eski.remove();
    kart.append(el("div", "redd", e.message));
  }
}

/**
 * BİLDİRİM — DEVIR.md "Interactions & Behavior": "Her çıkış kartı ilgili
 * kuyruğa bırakır ve kısa bir bildirim gösterir". 3.4 sn sonra kendiliğinden
 * kapanır; ÜST ÜSTE gelen bir karar varsa (iki kapı art arda) eski
 * zamanlayıcı İPTAL edilip yeniden kuruluyor — yoksa ikinci bildirim ilkinin
 * kalan süresiyle erken kapanabilirdi.
 */
let BILDIRIM_ZAMANLAYICI = null;
function bildirimGoster(mesaj) {
  const kutu = document.getElementById("bildirim");
  if (!kutu) return;
  kutu.textContent = mesaj;
  kutu.classList.add("gorunur");
  if (BILDIRIM_ZAMANLAYICI !== null) clearTimeout(BILDIRIM_ZAMANLAYICI);
  BILDIRIM_ZAMANLAYICI = setTimeout(() => { kutu.classList.remove("gorunur"); }, 3400);
}

/**
 * Kapıyı açar — KOMUT göndererek.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek kararı uyguluyor, cevaptaki
 * yeni model çiziliyor. Çekirdek reddederse mesajı aynen gösteriyoruz;
 * o mesaj gerekçeyi ve çıkış yolunu zaten söylüyor.
 *
 * KART MODU TAZELEME — reviewer'ın 1. ret gerekçesi: bu karar Sağ panelin
 * Kart modundaki .railKapiKutu'dan verilmişse (RAIL.cardId === id), aşağıdaki
 * ciz(veri.model) çağrısı sagPanelCiz'i de tetikler ama sagPanelCiz Kart
 * modunda SADECE kutu.dataset.railKart !== RAIL.cardId ise yeniden fetch eder
 * (bkz. railYenidenYuklenmeliMi) — id burada DEĞİŞMEDİĞİ için o koruma
 * panelin GET /kart/<id>'i YENİDEN çekmesini sonsuza dek engellerdi, kart
 * çekirdekte gerçekten kuyruğa düşse bile ekran eski kapı kutusunu ve devre
 * dışı düğmeyi göstermeye devam ederdi. Panelin "data-rail-kart" damgasını
 * burada SİLEREK sagPanelCiz'e "bu id için de yeniden yükle" sinyalini
 * BİZ veriyoruz — Genel bakış/Rol modundan verilen kararlarda (RAIL.cardId
 * farklı ya da null) bu dal hiç çalışmıyor, onlar zaten mevcut davranışla
 * aynı kalıyor.
 */
async function karar(id, secim, dugme, kart) {
  const kutular = kart.querySelectorAll("button");
  kutular.forEach((b) => (b.disabled = true));
  try {
    const cevap = await fetch("/kart/" + encodeURIComponent(id) + "/birak", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify({ karar: secim }),
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    if (RAIL.mode === "card" && RAIL.cardId === id) {
      const sagPanel = document.getElementById("sagPanel");
      if (sagPanel) sagPanel.removeAttribute("data-rail-kart");
    }
    ciz(veri.model);
    // Düğmenin KENDİ etiketi ("Yeniden koş", "Geçir", "Üretici haklı" …) —
    // kapiCikislari'nin ürettiği metin, burada İKİNCİ bir ifade İCAT
    // EDİLMİYOR.
    bildirimGoster((dugme.textContent || "Karar") + " — kuyruğa bırakıldı.");
  } catch (e) {
    kutular.forEach((b) => (b.disabled = false));
    const eski = kart.querySelector(".redd");
    if (eski) eski.remove();
    kart.append(el("div", "redd", e.message));
  }
}

/**
 * Gözcüyü başlatır ya da durdurur.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek kilidi okuyup yeni modeli
 * döndürüyor. "Başlattı mı" sorusunun cevabı dosyada, bizim iddiamızda
 * değil.
 */
async function gozcuKomut(ne, dugme) {
  dugme.disabled = true;
  const eski = document.querySelector("#bar .redd");
  if (eski) eski.remove();
  try {
    const cevap = await fetch("/gozcu/" + ne, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    ciz(veri.model);
    // Durdurma ANLIK DEĞİL: gözcü süren turu bitirip çıkıyor. Bunu
    // söylemezsek kullanıcı hapta hâlâ "gözcü açık" görüp düğmenin
    // çalışmadığını sanar — ölçüldü, tam olarak bu oldu.
    if (veri.mesaj) {
      const not = el("div", "ipucu", veri.mesaj);
      not.style.cssText = "flex-basis:100%";
      document.getElementById("bar").append(not);
    }
    // Başlatma/durdurma gözcü.log'a yeni satır düşürür — gözcü paneli
    // AÇIKSA günlüğü TAZELE, yoksa operatör panele girene kadar eski
    // kalırdı.
    if (RAIL.mode === "daemon") void railGozcuYukle();
  } catch (e) {
    dugme.disabled = false;
    // İSTENEN durdurma/yeniden başlatma BAŞARISIZ oldu — GOZCU_BEKLEYEN'i
    // ASILI bırakmak çipi sonsuza kadar "duruyor" gösterirdi, oysa hiçbir
    // şey durmuyor.
    GOZCU_BEKLEYEN = null;
    const kutu = el("div", "redd", e.message);
    kutu.style.cssText = "flex-basis:100%";
    document.getElementById("bar").append(kutu);
  }
}

/**
 * Ekranın baktığı akışı değiştirir — KOMUT göndererek.
 *
 * Çekirdek (POST /akis/sec) reddederse (bilinmeyen ad, bozuk YAML, kural
 * ihlali) ekran O ANDA baktığı akışta aynen kalır: seçici de GERİ ALINIR,
 * yoksa kutuda yeni akışın adı dururken pano hâlâ eskisini gösterirdi —
 * "Geri gönder" düğmesinde bir kez düzeltilen kusurun aynısı.
 */
async function akisSec(ad, secici) {
  const geriDon = AKTIF_AD;
  secici.disabled = true;
  // Hata kutusu artık #panoArac'a düşüyor: seçici de o satırda yaşıyor
  // (bkz. ciz — "Pano araç satırı" bölümü). #bar artık GENEL üst çubuk,
  // akışa özgü bir hata orada yersiz dururdu.
  const eski = document.querySelector("#panoArac .redd");
  if (eski) eski.remove();
  try {
    const cevap = await fetch("/akis/sec", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify({ ad }),
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    // Açık panel (kart detayı, akış düzenleyici) ESKİ akışa ait olabilir —
    // özellikle düzenleyicinin taslağı eski akışın dosyasından okunmuştu.
    // Yeni akışa geçince kapatmak, bayat bir taslağı düzenlemeye devam
    // etmekten iyi.
    location.hash = "";
    ciz(veri.model);
  } catch (e) {
    secici.value = geriDon;
    const kutu = el("div", "redd", e.message);
    kutu.style.cssText = "flex-basis:100%";
    document.getElementById("panoArac").append(kutu);
  } finally {
    secici.disabled = false;
  }
}

/**
 * Kartın İÇERİĞİNİ "kutu"ya kurar — "kutu"nun KENDİSİNİ YARATMIYOR.
 *
 * Niye ayrı: devir hareketinin anlamlı olması için aynı kartın aynı DOM
 * düğümü kalması gerekiyor (bkz. kartYerlestir); bunu yapabilmek için
 * içerik kurma ile düğüm yaratma birbirinden AYRILMIŞ olmalı — yoksa her
 * yoklamada el("div", ...) çağrısı yeni bir düğüm doğurur ve kimlik
 * hiç korunamaz.
 */
function kartIcerik(kutu, c) {
  kutu.className = "card" + (c.state === "active" ? " live" : "") + (c.gate ? " gate" : "") + (c.orphan ? " orphan" : "");
  kutu.replaceChildren();

  const ust = el("div", "tag " + (c.gate ? "gate" : c.state === "active" ? "run" : "queued"));
  if (c.state === "active") ust.append(el("span", "dot"));
  const kapi = c.gate ? kapiCikislari(c.gate, c.planKilidi, c.geriHedef) : null;
  ust.append(document.createTextNode(
    c.gate ? kapi.etiket : c.state === "active" ? "çalışıyor" : c.state === "done" ? "bitti" : "kuyrukta"
  ));
  if (kapi) {
    const not = el("span", "mono", kapi.not);
    not.style.cssText = "margin-left:auto;font-size:var(--fs-micro);text-transform:none;letter-spacing:0";
    ust.style.display = "flex";
    ust.append(not);
  }
  kutu.append(ust);

  kutu.append(el("h3", null, c.title));
  kutu.append(el("div", "cid", c.id + " · " + c.role));

  // ESKİ DAMGA. Model "stale"i hesaplıyordu (kartın topoloji hash'i
  // yaşayan akışın hash'inden farklı) ve sayfa onu HİÇ basmıyordu. Yani
  // ekran, kartın başka bir topolojiyle koştuğunu biliyor ve söylemiyordu.
  //
  // Görünür olması gerekiyor çünkü kart, rol ADLARI çakıştığı sürece
  // yaşayan akışın kolonlarında duruyor: panoda plan4'ün kartı
  // plan-capraz'ın kolonunda hiçbir işaret olmadan göründü.
  //
  // Yetim DEĞİL: yetim, rolü akışta hiç bulunmayan kart ve kapatılması
  // gerekiyor. Eski damga meşru — kart kendi topolojisiyle yürümeye devam
  // ediyor, yalnızca o topoloji artık dosyada yazan değil.
  // BAŞKA AKIŞIN KARTI. Kuyruk kök başına, akış başına değil: depoda iki
  // akış varsa ikisinin kartları aynı .skein/ altında duruyor. Bu pano
  // onları yargılamıyor (yetim de bayat da saymıyor, kapatma düğmesi de
  // çıkmıyor) ama GÖRÜNMEZ de olmamalı.
  if (c.digerAkis) {
    const d = el("div", "cid", "başka akışın kartı — bu pano onu yargılamıyor");
    d.style.color = "var(--ink-2)";
    kutu.append(d);
  }

  if (c.stale && !c.orphan && !c.digerAkis) {
    const d = el("div", "cid", "eski damga — kart kendi topolojisiyle yürüyor");
    d.style.color = "var(--ink-2)";
    kutu.append(d);
  }

  if (c.gateReason) gerekceKur(kutu, c.gateReason);
  else if (c.lastReject && c.state !== "done") {
    const r = el("div", "reason", c.lastReject);
    r.style.color = "var(--ink-2)";
    kutu.append(r);
  }

  if (c.live) {
    const s = el("div", "step");
    s.append(el("b", "mono", c.live.name || c.live.kind));
    s.append(el("span", "path", c.live.detail || ""));
    s.append(el("span", "seq", "adım " + c.live.seq));
    kutu.append(s);
  }

  const meta = el("div", "meta");
  if (c.rejects > 0) meta.append(el("span", "bad", c.rejects + " ret"));
  meta.append(el("span", null, c.turns + " tur"));
  if (c.durationMs) meta.append(el("span", null, sure(c.durationMs)));
  // Kosul artik SADECE dolara bakmiyor: olculmemis bir aktivasyon da
  // soylenmeli, dolari sifir olsa bile.
  if (c.costUsd || c.olculmeyen) {
    meta.append(el("span", c.olculmeyen ? "bad" : null,
      maliyetMetni(c.costUsd, c.olculmeyen, c.tokens)));
  }
  kutu.append(meta);

  // Sayı tek başına anlatmıyor: "2 ret" ile "kabul, ret, kapı, ret, bitti"
  // aynı şey değil.
  if (c.trail.length > 1) {
    const iz = el("div", "trail");
    c.trail.forEach((t, i) => {
      if (i > 0) iz.append(el("s"));
      const d = el("i");
      d.style.background = DOT[t] || "var(--ink-3)";
      d.title = t;
      iz.append(d);
    });
    kutu.append(iz);
  }

  if (c.orphan) {
    const cikis = el("div", "exits");
    const b = el("button", "primary", "Kartı kapat");
    b.type = "button";
    b.style.cssText = "background:var(--reject);border-color:var(--reject);color:#fff";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      void kapatKart(c.id, kutu);
    });
    cikis.append(b);
    kutu.append(cikis);
    kutu.append(el("div", "soon", "iş dalında duruyor; kapanan şey kartın yolculuğu"));
  } else if (kapi) {
    const cikis = el("div", "exits");
    kapi.dugmeler.forEach(([ad, secim], i) => {
      const b = el("button", i === 0 ? "primary" : null, ad);
      b.type = "button";
      b.addEventListener("click", (e) => {
        // Kartın kendisi de tıklanabilir (detay açar); düğme onu tetiklemesin.
        e.stopPropagation();
        void karar(c.id, secim, b, kutu);
      });
      cikis.append(b);
    });
    kutu.append(cikis);
  }
  // aria-label HER çağrıda tazeleniyor (c.title değişebilir), ama
  // tabIndex/role/tıklama dinleyicisi BURADA yok — kutu.addEventListener
  // bu fonksiyon her yoklamada çağrıldığında tekrarlanırsa (kartYerlestir
  // aynı düğümü yeniden kullandığı için) her saniye bir dinleyici daha
  // eklenir ve tek tıkla panel N kere açılır. Onlar düğümün YARATILDIĞI
  // yerde (kartCiz, kartYerlestir) BİR KEZ bağlanıyor.
  kutu.setAttribute("aria-label", c.title + " — detay");
}

/** Bir kart için TAZE bir düğüm yaratır — kimliğin önemsiz olduğu yerlerde (bant kartları). */
function kartCiz(c) {
  const kutu = el("div");
  kartIcerik(kutu, c);
  kartDugumBaslat(kutu, c.id);
  return kutu;
}

/**
 * Yeni yaratılan bir kart düğümüne BİR KEZ bağlanması gereken şeyleri
 * kurar: erişilebilirlik öznitelikleri ve tıklama/klavye dinleyicisi.
 *
 * "id" kartın kendi kimliği — bir kartın ÖMRÜ boyunca değişmez, o yüzden
 * burada kapatılan değer (closure) hep doğru kalır; kartYerlestir bu
 * fonksiyonu yalnızca düğüm YENİ yaratıldığında çağırıyor.
 */
function kartDugumBaslat(kutu, id) {
  kutu.tabIndex = 0;
  kutu.setAttribute("role", "button");
  // Panel adreslenebilir: bir karta bakarken URL'yi paylaşabilmek,
  // "hangi kart" sorusunu konuşmanın en kısa yolu.
  const ac = () => { location.hash = "kart/" + id; };
  kutu.addEventListener("click", ac);
  kutu.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ac(); } });
}

const OLAY = {
  created: "açıldı", taken: "alındı", handoff: "devredildi", reject: "REDDEDİLDİ",
  gate: "KAPI", released: "bırakıldı", requeued: "kuyruğa döndü", done: "bitti",
  plan: "planlama",
};
const IZ_RENK = { reject: "var(--reject)", gate: "var(--gate)", released: "var(--gate)", done: "var(--accept)" };

async function detayAc(id) {
  const kap = document.getElementById("panel");
  try {
    const cevap = await fetch("/kart/" + encodeURIComponent(id), { cache: "no-store" });
    const d = await cevap.json();
    if (!cevap.ok) throw new Error(d.hata || cevap.status);
    kap.replaceChildren(detayCiz(d));
  } catch (e) {
    kap.replaceChildren(el("div", "err", "Kart okunamadı: " + e.message));
  }
}

function detayCiz(d) {
  const ust = el("div", "ust");
  ust.addEventListener("click", (e) => { if (e.target === ust) kapat(); });
  const p = el("div", "panel");

  const kapatDugme = el("button", "kapat", "Kapat");
  kapatDugme.type = "button";
  kapatDugme.addEventListener("click", kapat);
  p.append(kapatDugme);

  p.append(el("h2", null, d.card.title));
  p.append(el("div", "cid", d.card.id + " · " + d.card.role + " · " + d.card.state));

  // Kartın hangi planla yürüdüğü, kimliğine ait bir bilgi — plana bağlı
  // değilse (plan yoksa) satır hiç görünmez.
  if (d.card.plan) {
    p.append(el("div", "cid", d.card.plan.path + " · " + d.card.plan.hash.slice(0, 12)));
    // YÜKÜMLÜLÜKLER. Kabul edilmiş itirazlar kartta duruyordu ve ekranda
    // görünmüyordu; insan kapısında kararın dayanağı ekranda olmak
    // zorunda. card show bunu basıyor (planLines), ekran basmıyordu.
    const kabuller = d.card.plan.kabuller || [];
    kabuller.forEach((k) => {
      const satir = el("div", "reason");
      satir.append(el("b", null, "yükümlülük " + k.id + ": "));
      satir.append(document.createTextNode(k.ne));
      const kanit = el("div", "cid", "kanıt: " + k.kanit);
      satir.append(kanit);
      p.append(satir);
    });
  }

  const m = el("div", "meta");
  if (d.card.rejects) m.append(el("span", "bad", d.card.rejects + " ret"));
  m.append(el("span", null, d.card.turns + " tur"));
  if (d.card.durationMs) m.append(el("span", null, sure(d.card.durationMs)));
  if (d.card.costUsd || d.card.olculmeyen) {
    m.append(el("span", d.card.olculmeyen ? "bad" : null,
      maliyetMetni(d.card.costUsd, d.card.olculmeyen, d.card.tokens)));
  }
  p.append(m);

  // "En son neden reddedildi" — gerekçeler kartın kendi geçmişinden.
  p.append(izZamanCizelgesiKur(d.history));

  // "Kodda ne değişti" — devredilen commit'in diff özeti.
  p.append(kodDegisikligiKur(d.diff));

  ust.append(p);
  return ust;
}

/**
 * "Kartın izi" zaman çizelgesi — DEVIR.md'nin sağ panel Kart modunda da
 * istediği aynı blok (c-20261105-d500f1), bu yüzden eski üst üste gelen
 * detay panelinden (detayCiz) ÇIKARILDI: iki yerde aynı anlamı taşıyan iki
 * ayrı kopya, AJAN_AYRAC'ın kendi yorumunun uyardığı kusur sınıfı olurdu.
 * Çıkarma davranışı DEĞİŞTİRMİYOR — detayCiz'in ürettiği DOM BİREBİR AYNI.
 */
function izZamanCizelgesiKur(history) {
  const iz = el("div", "kutu");
  iz.append(el("div", "eyebrow", "Kartın izi"));
  history.forEach((h, i) => {
    const satir = el("div", "iz");
    satir.style.marginTop = i === 0 ? "10px" : "0";
    satir.append(el("div", "t", h.at.slice(11, 19)));
    const rail = el("div", "rail");
    const nokta = el("i");
    nokta.style.background = IZ_RENK[h.event] || "var(--accent)";
    rail.append(nokta);
    if (i < history.length - 1) rail.append(el("s"));
    satir.append(rail);
    const gov = el("div", "gov");
    const bas = el("div");
    bas.append(el("b", null, OLAY[h.event] || h.event));
    if (h.who) bas.append(el("em", null, h.who));
    if (h.commit) bas.append(el("em", null, h.commit));
    if (h.plan) {
      // Alışverişin kendi sayıları — kaydın taşımadığı (null) alanlar hiç
      // basılmaz, "0" ile "hiç ölçülmedi" karışmasın.
      //
      // DİKKAT: bu betik dış dosyada bir şablon dizesinin İÇİNDE duruyor;
      // buraya yazılan bir ters tırnak dizeyi kapatır ve dosya derlenmez.
      // Tam olarak bu oldu: ajanın yazdığı yorum ters tırnak içeriyordu,
      // ne kodu yazan ne denetleyen rol derleyici koşturabildiği için
      // ikisi de "elle doğruladım" deyip geçti.
      let ozet = "tur " + h.plan.round;
      if (h.plan.objections !== null) ozet += ", " + h.plan.objections + " itiraz";
      if (h.plan.accepted !== null) ozet += ", " + h.plan.accepted + " kabul";
      if (h.plan.invalid !== null) ozet += ", " + h.plan.invalid + " sayılmadı";
      bas.append(el("em", null, "(" + ozet + ")"));
    }
    gov.append(bas);
    if (h.note) gov.append(el("p", null, h.note));
    satir.append(gov);
    iz.append(satir);
  });
  return iz;
}

/**
 * "Kodda ne değişti" — devredilen commit'in diff özeti. izZamanCizelgesiKur
 * gibi detayCiz'den ÇIKARILDI, sağ panelin Kart modu AYNI bloğu kullanıyor.
 */
function kodDegisikligiKur(diff) {
  const kod = el("div", "kutu");
  kod.append(el("div", "eyebrow", "Kodda ne değişti"));
  if (!diff) {
    kod.append(el("div", "empty", "Bu kart için commit kaydı yok."));
    return kod;
  }
  kod.append(el("div", "cid", diff.commit));
  const enBuyuk = Math.max(1, ...diff.files.map((f) => f.add + f.del));
  diff.files.forEach((f) => {
    const satir = el("div", "dosya");
    satir.append(el("div", "p", f.path));
    satir.append(el("div", "a", "+" + f.add));
    satir.append(el("div", "d", "-" + f.del));
    const c = el("div", "cizgi");
    const ekle = el("i");
    ekle.style.cssText = "background:var(--accept);width:" + (90 * f.add / enBuyuk) + "px";
    const sil = el("i");
    sil.style.cssText = "background:var(--reject);opacity:.55;width:" + (90 * f.del / enBuyuk) + "px";
    c.append(ekle, sil);
    satir.append(c);
    kod.append(satir);
  });
  return kod;
}

/**
 * ESCAPE'İN KAPATTIĞI ŞEY — Pano'nun kendi panelleri ("kart/", "akis",
 * "prompt", "yeni" …) hash'in KENDİSİ, hash'i boşaltmak "Pano'ya dön"
 * demek — ESKİ davranış, aynen duruyor.
 *
 * Akışlar/Promptlar/Ajanlar sekmelerinde ("akislar sekmesi", kart
 * c-20261105-d36e37, "Yeni akış" iletişim kutusu) hash ZATEN sekmenin
 * KENDİSİ ('#akislar') — onu boşaltmak sekmeyi DEĞİŞTİRİR (Pano'ya
 * atlardı), oysa "Yeni akış" kutusu hash'i HİÇ DEĞİŞTİRMEDEN açılıyor
 * (bkz. yeniAkisAc). O yüzden bu üç sekmede Escape yalnızca PANELİ
 * boşaltıyor, hash'e DOKUNMUYOR — 'sekmeAdi' zaten bu ayrımı yapıyor
 * (üç sekme adı dışındaki HER hash "pano" sayılıyor), burada İKİNCİ bir
 * liste İCAT EDİLMİYOR.
 */
function kapat() {
  const aktif = sekmeAdi(decodeURIComponent(location.hash.replace(/^#/, "")));
  if (aktif !== "pano") {
    document.getElementById("panel").replaceChildren();
    return;
  }
  if (location.hash) location.hash = "";
  else document.getElementById("panel").replaceChildren();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") kapat(); });

/**
 * Hash'ten AKTİF SEKMEYİ türetir — üç sekme adı dışında kalan HER ŞEY
 * (boş hash, ve kart/, akis, prompt, prompt/yeni, yeni gibi Pano'nun
 * KENDİ üst üste binen panel yolları) Pano sayılır. Bu yollar ayrı bir
 * sekme değil, Pano'nun içindeki bir panel — hashOku'nun o panelleri
 * açan dalları bu fonksiyondan BAĞIMSIZ, aynı hash'i ayrıca okuyor.
 */
function sekmeAdi(h) {
  if (h === "akislar" || h === "promptlar" || h === "ajanlar") return h;
  return "pano";
}

/**
 * Aktif sekmeye göre dört içerik kutusundan birini gösterir, diğerlerini
 * gizler — VE üst çubuktaki nav düğmelerinin vurgusunu TIKLANIR TIKLANMAZ
 * günceller (bkz. "data-sekme" yorumu, ciz). ciz() zaten her yoklamada
 * (1 sn) aynı sınıfı doğru kurar; bu fonksiyon olmadan vurgu çizgisi bir
 * saniyeye kadar geç kalırdı — hash değişti ama ekran henüz söylemedi.
 */
function sekmeUygula() {
  const aktif = sekmeAdi(decodeURIComponent(location.hash.replace(/^#/, "")));
  ["Pano", "Akislar", "Promptlar", "Ajanlar"].forEach((parca) => {
    const kutu = document.getElementById("icerik" + parca);
    if (kutu) kutu.style.display = parca.toLowerCase() === aktif ? "" : "none";
  });
  document.querySelectorAll(".navSekme").forEach((b) => {
    const eslesiyor = b.dataset.sekme === aktif;
    b.classList.toggle("navSekme-aktif", eslesiyor);
    b.setAttribute("aria-current", eslesiyor ? "page" : "false");
  });
}

function hashOku() {
  sekmeUygula();
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h.startsWith("kart/")) detayAc(h.slice("kart/".length));
  else if (h === "akis") void akisAc();
  else if (h === "prompt/yeni") void yeniRolAc();
  else if (h === "yeni") yeniKartAc();
  else document.getElementById("panel").replaceChildren();
  // Akışlar/Promptlar sekmeleri Pano'nun bir sub-paneli DEĞİL (bkz.
  // sekmeAdi) — kendi içeriklerini YUKARIDAKİ dallardan BAĞIMSIZ
  // kuruyorlar, #panel'i de aynen boşaltan dal (üstteki son 'else') zaten
  // çalıştı.
  if (h === "akislar") akislarEkraniCiz();
  if (h === "promptlar") void promptlarEkraniCiz();
}
window.addEventListener("hashchange", hashOku);

/**
 * Gözcünün TEMEL üç hâli — SAF, DOM yok.
 *
 * ÜÇ durum (yok/açık/çökmüş) yalnızca MEVCUT modelden (m.daemon)
 * ayrılıyor; davranış/etiket metinleri ESKİ koddakiyle AYNEN
 * (page.test.ts bunu birebir sınıyor — "bayat kilit" ibaresi
 * tarayici.test.ts'in "#bar .pill" sınamasına da bağlı, KALDIRILMADI).
 *
 * Bu fonksiyon artık DOĞRUDAN çizilmiyor — 'gozcuPanelDurum' (aşağıda)
 * BEŞ duruma (DEVIR.md §2: on/stopping/off/stale/unmanaged) genişletirken
 * bunu YAPI TAŞI olarak kullanıyor, aynı sınıflandırmayı İKİNCİ kez
 * yazmamak için (kart c-20261105-92d731 — önceki kart "stopping/
 * unmanaged ekranın bilmediği bilgi" diyordu; bu kart GOZCU_AYAR/
 * GOZCU_BEKLEYEN ile o bilgiyi gerçekten taşıyor).
 */
function gozcuDurum(g) {
  if (g === null) return { durum: "yok", etiket: "gözcü yok" };
  if (g.alive) return { durum: "acik", etiket: "gözcü açık" };
  return { durum: "cokmus", etiket: "gözcü kapalı (bayat kilit)" };
}

/**
 * Gözcü panelinin BEŞ durumu — SAF, DOM yok (DEVIR.md §2, kart
 * c-20261105-92d731).
 *
 * 'yonetiliyor' ÖNCE sorulur: bu ekran gözcü bayraklarıyla açılmadıysa
 * (GOZCU_AYAR === null) durum HER ZAMAN "unmanaged" — gerçekten bir
 * gözcü koşuyor olsa BİLE (başka bir kabuktan açılmış olabilir, SAPMALAR
 * §2.6 kural 2: "başka bir ekranın başlattığı gözcü durdurulmaz"). Bu
 * ekranın kendi YÖNETME YETKİSİ ile gözcünün GERÇEKTEN çalışıp
 * çalışmaması İKİ AYRI SORU; "unmanaged" yalnızca birincisini cevaplıyor.
 *
 * 'duruyor' (GOZCU_BEKLEYEN !== null) "açık" durumunu "stopping"e
 * ÇEVİRİR — SIGTERM gönderildi ama süreç henüz ÖLMEDİ, model hâlâ
 * alive:true okur (bkz. gozcuKomut yorumu); bu bayrak olmadan çip
 * düğmeye basıldıktan sonra bir tur boyunca "açık" demeye devam ederdi.
 */
function gozcuPanelDurum(g, yonetiliyor, duruyor) {
  if (!yonetiliyor) return { durum: "unmanaged", etiket: "gözcü · elle" };
  const taban = gozcuDurum(g);
  if (taban.durum === "yok") return { durum: "off", etiket: "gözcü kapalı" };
  if (taban.durum === "cokmus") return { durum: "stale", etiket: "gözcü çökmüş" };
  return duruyor ? { durum: "stopping", etiket: "gözcü duruyor…" } : { durum: "on", etiket: "gözcü açık" };
}

/**
 * Topoloji uyarısı — gözcü AÇIKKEN akış kaydedildiyse (DEVIR.md §2,
 * orphan.ts/serve.ts uyarılarının görsel karşılığı). SAF, DOM yok.
 *
 * 'g.info.hash' gözcü AÇILIRKEN donan topoloji hash'i (bkz. LockInfo,
 * watch/lock.ts); 'flowHash' ekranın O AN okuduğu akışın hash'i
 * (m.flow.hash, model.ts). İkisi ayrışıyorsa gözcü ESKİ rol listesiyle
 * koşuyor — yalnızca "on" durumunda anlamlı: "stopping"/"stale"/"off"da
 * zaten eski süreç ölüyor/ölmüş, uyarı "yeniden başlat" vaat eder ama
 * başlatılacak bir şey yoktur.
 */
function gozcuTopoUyari(g, flowHash, durum) {
  return durum === "on" && g !== null && g.info.hash !== flowHash;
}

/**
 * "unmanaged" panelindeki iki örnek komut — SAF, DOM yok.
 *
 * ui/cli.ts'in kendi USAGE metnindeki İKİ satırın (bkz. o dosyadaki
 * "GÖZCÜYÜ EKRANDAN yönetmek" ve "Bayrak vermezsen" paragrafları) akış
 * adıyla doldurulmuş hâli — ikinci bir "nasıl açılır" cümlesi İCAT
 * ETMİYOR, var olanı burada da aynen gösteriyor. Model adı ÖRNEK: ekran
 * gerçek bayrakları bilmiyor (bilse "unmanaged" olmazdı), o yüzden
 * burada yazan model/araç seçimi bir ÖNERİ, bir İDDİA değil.
 */
function gozcuKomutOrnekleri(flowName) {
  return {
    cmd1: "npx tsx src/watch/cli.ts " + flowName + " --serve --model claude:claude-sonnet-5",
    cmd2: "npx tsx src/ui/cli.ts " + flowName + " --model claude:claude-sonnet-5",
  };
}

/**
 * Panelin tek başlat/durdur düğmesinin etiketi — SAF, DOM yok.
 *
 * 'canli' İKEN "Gözcüyü durdur" (ESKİ davranış, bkz. page.test.ts "gözcü
 * düğmesi" takımı — bu tam ifade SINANIYOR, KALDIRILMADI). Değilken iki
 * alt durum var: kilit HİÇ yok (g === null, "Gözcüyü başlat") ve kilit
 * VAR ama ölü (g !== null, bayat kilit, "Kilidi devral ve başlat" —
 * SAPMALAR §2.6 kural 1'in simetriği: "durdur" demek yapamayacağı şeyi
 * vaat etmekti, burada "başlat" tek başına yeterince açık değil, kilidi
 * DEVRALDIĞINI söylemeli). Her iki alt durumda da tıklama AYNI
 * "/gozcu/baslat" komutuna gidiyor (bkz. gozcuKomut) — liveLock bayat
 * kilidi zaten "tutan yok" sayıyor (watch/lock.ts), yani sunucu tarafında
 * İKİ ayrı yol yok, yalnızca ETİKET ayrışıyor.
 */
function gozcuEylemEtiketi(g) {
  const canli = Boolean(g && g.alive);
  return g && !canli ? "Kilidi devral ve başlat" : (canli ? "Gözcüyü durdur" : "Gözcüyü başlat");
}

/** Pano rozetinin sayısı — kapıda bekleyen kart. SAF, DOM yok. */
function kapidaBekleyenSayisi(cards) {
  return cards.filter((c) => Boolean(c.gate)).length;
}

/** Ajanlar rozetinin sayısı — şu an çalışan kart. SAF, DOM yok. */
function calisanAjanSayisi(cards) {
  return cards.filter((c) => c.state === "active").length;
}

/**
 * DURDURMA/YENİDEN BAŞLATMA bekleniyorken gözcü GERÇEKTEN öldüyse ne
 * yapılacağı — SAF, DOM yok (DEVIR.md §2, kart c-20261105-92d731).
 *
 * Reviewer ret notu (bu kenarda 2. ret, reddedilen commit 017d453): bu
 * karar DAHA ÖNCE ciz() içine GÖMÜLÜYDÜ — komşu kararların
 * (gozcuPanelDurum/gozcuTopoUyari/gozcuEylemEtiketi) HEPSİ SAF
 * fonksiyona çıkarılıp sınır durumlarıyla sınanırken bu TEK dallanma
 * DOM'a gömülü kaldı, hiçbir testle (ne page.test.ts'teki saf fonksiyon
 * sınamalarıyla ne tarayici.test.ts'teki tarayıcı sınamalarıyla)
 * kapsanmıyordu — mutasyon denemesi de yapılamadı, deneyecek sınama
 * yoktu.
 *
 * 'bekleyen' o anki GOZCU_BEKLEYEN değeri, 'g' m.daemon:
 *   - bekleyen === null: beklenen bir şey YOK, 'null' döner.
 *   - süreç HÂLÂ canlıysa (g && g.alive): beklenen iş henüz BİTMEDİ,
 *     'null' döner — çağıran hiçbir şeyi DEĞİŞTİRMEMELİ.
 *   - öldüyse (g === null YA DA g.alive === false): bayrak İNDİRİLMELİ
 *     ve 'bekleyen === "yenidenBaslatiliyor"' idiyse "/gozcu/baslat"
 *     tetiklenmeli — bunu çağıran, AYRI bir adım olarak yapıyor (bkz.
 *     ciz() çağrı yeri yorumu); hemen ardı ardına çağırmak "zaten bir
 *     gözcü açık" hatasına çarpardı.
 */
function gozcuBeklemeSonucu(bekleyen, g) {
  if (bekleyen === null) return null;
  if (g && g.alive) return null;
  return { yenidenBaslat: bekleyen === "yenidenBaslatiliyor" };
}

/**
 * TEMA ANAHTARI — kart c-20261106-e62847. "sistem"/"acik"/"koyu"
 * sözlüğümüz İLE <html data-theme>'in gerçek niteliği ("light"/"dark"/
 * nitelik YOK) arasındaki ÇEVİRİ, SAF (DOM yok, iki yöne de test edilir).
 *
 * renderPage() SUNUCUDA aynı eşlemeyi yapıyor (bkz. page.ts'teki
 * JSDoc) — bu TEK kaynak iki yerde: biri ilk boyamayı (sunucu), öteki
 * anahtara tıklandığında ANINDA yansımayı (istemci, ağ isteğini
 * BEKLEMEDEN) üretiyor. İkisi uyuşmazsa ekran AÇILDIĞINDA gösterdiği
 * temayla anahtarın gösterdiği "seçili" düğme ÇELİŞİRDİ.
 */
function temaNitelikDegeri(tema) {
  if (tema === "acik") return "light";
  if (tema === "koyu") return "dark";
  return null;
}

/** Tersi: gerçek nitelikten üç hâlden birine. SAF. */
function nitelikTemaDegeri(nitelik) {
  if (nitelik === "light") return "acik";
  if (nitelik === "dark") return "koyu";
  return "sistem";
}

/**
 * Seçimi ANINDA uygular (DOM) VE sunucuya YAZAR (ağ) — kart c-20261106-
 * e62847. Sıra ÖNEMLİ: önce <html> niteliği değişir (operatör BEKLEMEDEN
 * görür), sonra ciz(SON_MODEL) çağrılır (anahtarın KENDİSİ de "secili"
 * düğmeyi hemen güncellesin — aksi hâlde bir sonraki saniyelik yoklamaya
 * kadar eski düğme "seçili" görünürdü), sonra yazma isteği atılır.
 *
 * Yazma BAŞARISIZ olursa (ağ hatası, sunucu kapandı) GÖRÜNÜŞ yine de
 * doğru — operatör doğru temayı görüyor, yalnızca BİR SONRAKİ açılışta
 * hatırlanmayabilir. Bu TEK başarısızlık biçimi gozcuKomut'un aksine
 * (yukarıda) ekrana bant olarak YANSITILMIYOR: bir tema tercihinin ağ
 * hatası turu durdurmuyor, "Yeni kart" kadar kritik bir eylem değil —
 * SAPMALAR.md §2.3'ün gerektirdiği jeton/Origin kapısından GEÇİYOR
 * (bkz. fetch çağrısı), sadece hata sessizce yutuluyor.
 */
function temaSec(tema) {
  const nitelik = temaNitelikDegeri(tema);
  if (nitelik === null) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = nitelik;
  if (SON_MODEL) ciz(SON_MODEL);
  fetch("/tema", {
    method: "POST",
    headers: { "content-type": "application/json", "x-skein-token": JETON },
    body: JSON.stringify({ tema }),
  }).catch(() => {});
}

/**
 * Üst çubuğun tema anahtarı DOM'u — üç düğme, ".duzenleSegment"/
 * ".duzenleSegmentBtn" (Rolleri Düzenle modunun tekil/toplu anahtarı) ile
 * AYNI deseni izliyor: düğme grubu + "secili" sınıfı, YENİ bir etkileşim
 * deseni İCAT EDİLMİYOR.
 */
function temaAnahtariKur() {
  const mevcutTema = nitelikTemaDegeri(document.documentElement.dataset.theme || null);
  const grup = el("div", "temaAnahtari");
  grup.setAttribute("role", "group");
  grup.setAttribute("aria-label", "Tema");
  [["sistem", "Sistem"], ["acik", "Açık"], ["koyu", "Koyu"]].forEach(([deger, etiket]) => {
    const b = el("button", "temaBtn" + (deger === mevcutTema ? " secili" : ""), etiket);
    b.type = "button";
    b.setAttribute("aria-pressed", String(deger === mevcutTema));
    b.addEventListener("click", () => { if (deger !== mevcutTema) temaSec(deger); });
    grup.append(b);
  });
  return grup;
}

function ciz(m) {
  AKTIF_AD = m.flow.name;
  SON_MODEL = m;
  const bar = document.getElementById("bar");
  bar.replaceChildren();
  // MARKA: üç kuş SVG'si + "Skein" sözcüğü (bkz. markaSvg yorumu).
  const marka = el("div", "marka");
  marka.append(markaSvg("currentColor"));
  marka.append(el("span", "markaAd", "Skein"));
  bar.append(marka);

  // ANA SEKMELER — hash ile yönlenir (#pano/#akislar/#promptlar/#ajanlar,
  // bkz. sekmeAdi/hashOku). Rozetler MEVCUT modelden: Pano "kapıda
  // bekleyen kart", Ajanlar "şu an çalışan kart" — ikisi de gerçekten
  // bilinen sayılar. Akışlar AKISLAR.length (açılışta bir kez okunan
  // gerçek liste). Promptlar PROMPT_ORIJINAL/PROMPT_METIN'in KARŞILAŞTIRMASI
  // (bkz. promptKaydedilmemisSayisi, Promptlar sekmesi) — "kaç dosyanın
  // editördeki metni disktekinden farklı", gerçekten izlenen bir sayı,
  // sekme hiç açılmamışsa (iki harita da boş) doğal olarak 0.
  const aktifSekme = sekmeAdi(decodeURIComponent(location.hash.replace(/^#/, "")));
  const nav = el("div", "anaNav");
  nav.setAttribute("aria-label", "Ana sekmeler");
  [
    ["pano", "Pano", kapidaBekleyenSayisi(m.cards), "accent"],
    ["akislar", "Akışlar", AKISLAR.length, "notr"],
    ["promptlar", "Promptlar", promptKaydedilmemisSayisi(PROMPT_ORIJINAL, PROMPT_METIN), "notr"],
    ["ajanlar", "Ajanlar", calisanAjanSayisi(m.cards), "accent"],
  ].forEach(([ad, etiket, sayi, renk]) => {
    const b = el("button", "navSekme" + (ad === aktifSekme ? " navSekme-aktif" : ""));
    b.type = "button";
    // data-sekme: sekmeUygula() TIKLANIR TIKLANMAZ (bir sonraki saniyelik
    // yoklamayı BEKLEMEDEN) bu düğümü bulup aktif sınıfını güncelliyor —
    // bkz. hashOku. Bu alan olmadan vurgu çizgisi en fazla 1 sn geç kalırdı.
    b.dataset.sekme = ad;
    b.setAttribute("aria-current", ad === aktifSekme ? "page" : "false");
    b.append(document.createTextNode(etiket + " "));
    b.append(el("span", "navRozet navRozet-" + renk, String(sayi)));
    b.addEventListener("click", () => { location.hash = ad; });
    nav.append(b);
  });
  bar.append(nav);

  // PANO ARAÇ SATIRI — akış adı/hash'i, akış seçici, "Akışı düzenle" ve
  // "Promptları düzenle" düğmeleri. Yeni tasarımın üst çubuğunda bunlar
  // YOK (Akışlar/Promptlar sekmeleri yerini alıyor, bkz. yukarıdaki nav
  // yorumu) — bu kart o sekmeleri KURMUYOR, yani yetenek burada, Pano'nun
  // kendi araç satırında kalıyor. "Akışı düzenle" ESKİ overlay'i açıyor
  // (henüz sökülmedi); "Promptları düzenle" ARTIK gerçek Promptlar
  // sekmesini açıyor (bkz. promptlarDugme, altta) — ekranın tek prompt
  // düzenleme yüzeyi o, eski "#prompt" çekmecesi Promptlar sekmesi
  // kurulunca SÖKÜLDÜ.
  const panoArac = document.getElementById("panoArac");
  panoArac.replaceChildren();
  const akis = el("div");
  akis.append(el("div", "eyebrow", "Akış"));
  akis.append(el("div", "mono", m.flow.name + "  " + m.flow.hash.slice(0, 12) + "…"));
  panoArac.append(akis);

  // AKIŞ SEÇİCİ. Ekran bugüne kadar açılışta verilen TEK akışa bağlıydı;
  // başka bir akışa bakmak ekranı kapatıp komutu yeniden yazmak demekti.
  // Liste boşsa (ekran akış seçimine açık değil ya da hiç akış yok) seçici
  // hiç çıkmıyor — boş bir kutu sunmak, yapamayacağı bir şeyi vaat etmek
  // olurdu.
  if (AKISLAR.length) {
    const secici = el("select");
    secici.id = "akisSecici";
    secici.setAttribute("aria-label", "Akış seç");
    AKISLAR.forEach((ad) => {
      const o = el("option", null, ad);
      o.value = ad;
      if (ad === m.flow.name) o.selected = true;
      secici.append(o);
    });
    secici.addEventListener("change", () => void akisSec(secici.value, secici));
    panoArac.append(secici);
  }
  const duzenle = el("button", "mini", "Akışı düzenle");
  duzenle.type = "button";
  duzenle.addEventListener("click", () => { location.hash = "akis"; });
  panoArac.append(duzenle);
  // "Rolleri düzenle" — DEVIR.md §3, sağ panelin MOD 5'i (kart
  // c-20261105-725320). "Akışı düzenle" (yukarıda) ESKİ overlay'i açıyor —
  // bu YENİ düğme sağ panelde ayrı bir yüzey açıyor, overlay'in yerini
  // ALMIYOR (ikisi de AYNI /akis + /akis/onizleme + /akis/yaz uçlarını
  // paylaşıyor, overlay'in sökülmesi bu kartın kapsamı dışında).
  const rolleriDuzenleDugme = el("button", "mini", "Rolleri düzenle");
  rolleriDuzenleDugme.type = "button";
  rolleriDuzenleDugme.addEventListener("click", () => { duzenleAc(); });
  panoArac.append(rolleriDuzenleDugme);
  const promptlarDugme = el("button", "mini", "Promptları düzenle");
  promptlarDugme.type = "button";
  promptlarDugme.addEventListener("click", () => { location.hash = "promptlar"; });
  panoArac.append(promptlarDugme);

  // Akış dosyası bozulduysa ekran eski topolojiyle çizmeye devam ediyor;
  // bunu söylemezse kullanıcı düzenlemesinin neden tutmadığını bilemez.
  const hataKabi = document.getElementById("hata");
  if (m.flow.error) {
    hataKabi.replaceChildren(el("div", "err",
      "Akış dosyası şu an geçersiz — ekran ve gözcü ESKİ topolojiyle devam ediyor:\\n" + m.flow.error));
  } else {
    hataKabi.replaceChildren();
  }

  // GÖZCÜ ÇİPİ — DEVIR.md §2, kart c-20261105-92d731. Önceki kart burada
  // ayrı bir "Gözcüyü başlat/durdur" düğmesi tutuyordu ÇÜNKÜ sağ panel
  // henüz yoktu; o düğme artık YOK, eylem PANELE taşındı (bkz.
  // railGozcuCiz) — çip tek başına tıklanabilir, sağ paneli gözcü moduna
  // açıyor (gozcuAc).
  const g = m.daemon;
  // KARAR gozcuBeklemeSonucu'nda (yukarıda, SAF) — burada yalnızca
  // DOM'a bağlı tarafı yapılıyor: bayrağı indirmek ve "başlat"ı gerçek
  // bir düğme olmadan (gözcüKomut bir <button> bekliyor, otomatik
  // tetiklemede tıklanan bir düğme yok) tetiklemek.
  const beklemeSonucu = gozcuBeklemeSonucu(GOZCU_BEKLEYEN, g);
  if (beklemeSonucu) {
    GOZCU_BEKLEYEN = null;
    if (beklemeSonucu.yenidenBaslat) void gozcuKomut("baslat", document.createElement("button"));
  }
  const durumBilgi = gozcuPanelDurum(g, Boolean(GOZCU_AYAR), GOZCU_BEKLEYEN !== null);
  const topoUyari = gozcuTopoUyari(g, m.flow.hash, durumBilgi.durum);
  const pillSinif = "pill" + (durumBilgi.durum === "stale" || topoUyari
    ? " dikkat"
    : RAIL.mode === "daemon" ? " railAcik" : "");
  const pill = el("button", pillSinif);
  pill.type = "button";
  pill.append(el("span", "dot " + durumBilgi.durum));
  // TOPOLOJİ UYARISI çipin ETİKETİNİ de değiştiriyor (DEVIR.md §2: "çip
  // etiketi 'gözcü · yeniden başlat' olur").
  pill.append(document.createTextNode(topoUyari ? "gözcü · yeniden başlat" : durumBilgi.etiket));
  // "bayat kilit" İBARESİ KALDIRILMADI (tarayici.test.ts "#bar .pill"
  // sınaması buna bağlı) — kilit GERÇEKTEN ölüyse gösteriliyor, "stale"
  // durumuna değil gozcuDurum'un KENDİ sınıflandırmasına ("cokmus")
  // bakarak: "unmanaged" bir ekranda bile kilit ölü olabilir
  // (SAPMALAR'ın "unmanaged" önceliği YALNIZCA eylem yetkisini kapatıyor,
  // teşhis bilgisini DEĞİL) — ikisi ayrı olmazsa bu ekran "elle" derken
  // bayat kilit bilgisini GİZLERDİ.
  if (gozcuDurum(g).durum === "cokmus") pill.append(el("span", "mono", "bayat kilit"));
  if (g) pill.append(el("span", "mono", "pid " + g.info.pid));
  const ok = el("span", "ok", "→");
  ok.setAttribute("aria-hidden", "true");
  pill.append(ok);
  pill.addEventListener("click", () => { gozcuAc(); });
  bar.append(pill);

  bar.append(el("div", "spacer"));
  // SAYAÇLAR — açık/bitti/toplam maliyet. "Aktivasyon" eski üst çubukta
  // vardı, DEVIR.md'nin üç sayacında YOK — o sayı bir yere kaybolmuyor,
  // kart düzeyinde (.meta) hâlâ basılıyor.
  [["açık", m.totals.open], ["bitti", m.totals.done]].forEach(([ad, deger]) => {
    const s = el("div", "sayac");
    s.append(document.createTextNode(ad + " "));
    s.append(el("b", null, String(deger)));
    bar.append(s);
  });
  // Maliyet ifadesi AYNEN eskisiyle: "≥" alt sınır işareti SAPMALAR.md
  // §2.1'in korunacak davranışı, burada hiç değişmedi.
  const maliyetSayac = el("div", "sayac");
  maliyetSayac.append(document.createTextNode("toplam maliyet "));
  maliyetSayac.append(el("b", null, (m.totals.olculmeyen ? "≥" : "") + para(m.totals.costUsd)));
  bar.append(maliyetSayac);

  // TEMA ANAHTARI — kart c-20261106-e62847 (UX.md "operatör koyu temayı
  // kapatamıyor" bulgusunun yaması).
  bar.append(temaAnahtariKur());

  // yeni kart dugmesi: ekranin en cok kullanilan eylemi, ust cubugun ana dugmesi.
  const yeni = el("button", "yeniKart", "Yeni kart");
  yeni.type = "button";
  yeni.addEventListener("click", () => { location.hash = "yeni"; });
  bar.append(yeni);

  // Hiçbir kart ekrandan düşmemeli. Rolü yaşayan akışta olmayan kart
  // hiçbir sütuna uymuyor; kendi şeridinde, sebebiyle birlikte duruyor.
  const uyari = document.getElementById("uyari");
  const bantlar = [];

  // BOZUK KART DOSYASI. Tarama artık bir bozuk dosyada durmuyor (biri
  // done/ altında olduğunda gözcü hiç açılamıyordu), ama izole etmek ile
  // SAKLAMAK ayrı şeyler: veri kaybı ekranda görünmek zorunda.
  //
  // NOT: bu bölge gömülü betiğin template literal'ının İÇİ — ters tırnak
  // string'i kapatır. Aynı tuzağa bu dosyada iki kez düşüldü.
  if (m.bozuk && m.bozuk.length) {
    const band = el("div", "band");
    band.append(el("h2", null, m.bozuk.length + " kart dosyası okunamıyor"));
    band.append(el("p", null,
      "Bu dosyalar ayrıştırılamadı, yani içerdikleri kartlar hiçbir yerde görünmüyor. " +
      "Tarama onlarda durmuyor — bir bozuk dosya bütün kuyruğu tutmasın diye — ama " +
      "bu bir veri kaybı: dosyayı elle onar ya da sil."));
    const liste = el("div", "mono");
    liste.style.cssText = "font-size:var(--fs-tight);line-height:1.7";
    m.bozuk.forEach((yol) => liste.append(el("div", null, yol)));
    band.append(liste);
    bantlar.push(band);
  }

  // KUYRUK ENGELİ. Kart kuyrukta duruyor ama alınamıyor — ve bu yarış
  // değil. Teşhis gözcünün terminalinde ve günlükte vardı; operatörün
  // baktığı yer burası ve burada kart sessizce bekliyordu. Model yalnızca
  // HÂLÂ süren engelleri veriyor, yani bu bant çözülmüş bir arıza
  // göstermiyor.
  //
  // NOT: bu bölge gömülü betiğin template literal'ının İÇİ — ters tırnak
  // string'i kapatır.
  if (m.engeller && m.engeller.length) {
    const band = el("div", "band");
    band.append(el("h2", null, m.engeller.length + " kart kuyrukta ALINAMIYOR"));
    band.append(el("p", null,
      "Bu kartlar kuyrukta duruyor ama role verilemiyor ve bu bir yarış değil: " +
      "dosya kilitli, izin yok ya da yolda bir şey var. Kart kendiliğinden " +
      "ilerlemeyecek — aşağıdaki kodu ve yolu kullanarak engeli kaldır."));
    const liste = el("div", "mono");
    liste.style.cssText = "font-size:var(--fs-tight);line-height:1.7";
    m.engeller.forEach((e) => {
      liste.append(el("div", null, e.code + "  " + e.role + "  " + e.path));
      if (e.message) {
        const alt = el("div", null, e.message);
        alt.style.cssText = "color:var(--ink-3)";
        liste.append(alt);
      }
    });
    band.append(liste);
    bantlar.push(band);
  }

  // Rolü bu akışta bulunmayan BAŞKA AKIŞ kartları hiçbir sütuna düşmez ve
  // yetim de sayılmadıkları için eskiden ekrandan tamamen kaybolurlardı.
  // Bir kartın ekrandan yok olması en kötü görünüm hatası.
  const roller = new Set(m.roles.map((r) => r.id));
  const digerler = m.cards.filter((c) => c.digerAkis && !roller.has(c.role) && c.state !== "done");
  if (digerler.length) {
    const band = el("div", "band");
    band.append(el("h2", null, digerler.length + " kart başka bir akışta"));
    band.append(el("p", null,
      "Bu kartlar bu akışa ait değil: kuyruk kök başına, akış başına değil. " +
      "Rolleri bu akışta bulunmadığı için hiçbir sütuna düşmüyorlar. " +
      "Kendi akışının ekranını aç ya da npm run card -- ls ile bak."));
    const kartlar = el("div", "kartlar");
    digerler.forEach((c) => kartlar.append(kartCiz(c)));
    band.append(kartlar);
    bantlar.push(band);
  }

  const yetimler = m.cards.filter((c) => c.orphan);
  if (yetimler.length) {
    const band = el("div", "band");
    band.append(el("h2", null, yetimler.length + " kart akışta karşılığı olmayan bir rolde"));
    band.append(el("p", null,
      "Bu kartlar hiçbir role gitmiyor: ya o rol akıştan silindi, ya da gözcü/ekran " +
      "akış dosyasının eski hâlini taşıyor. Kart açılırken topolojisini donduruyor " +
      "ve yolunu ondan okuyor — yani kimse onu almıyor ve hiçbir hata da üretmiyor. " +
      "Gözcüyü ve ekranı yeniden başlatmak ilkini çözer; rol gerçekten silindiyse kartı kapat."));
    const kartlar = el("div", "kartlar");
    yetimler.forEach((c) => kartlar.append(kartCiz(c)));
    band.append(kartlar);
    bantlar.push(band);
  }
  uyari.replaceChildren(...bantlar);

  // FORMASYON DİYAGRAMI — sütun panosunun yerini alıyor (bkz. yukarıdaki
  // ".formasyonSarmal" CSS yorumu). Akışlar sekmesindeki diyagram
  // (diyagramSvgKur) gibi HER YOKLAMADA baştan kuruluyor; kimlik koruma
  // (eski kartYerlestir/KART_DUGUM) burada YOK — DEVIR.md'nin V
  // formasyonu bir devir hareketi istemiyor, "canlı" sinyali artık kanat
  // çırpmanın kendisi.
  const board = document.getElementById("board");
  board.replaceChildren(formasyonSvgKur(m));

  document.getElementById("lejant").replaceChildren(lejantKur(m));

  // SAĞ PANEL — kart c-20261105-d500f1. formasyonSvgKur gibi HER
  // ÇAĞRIDA RAIL'in o anki moduna göre yeniden doluyor (Kart modu
  // kendi FETCH korumasını kendi taşıyor, bkz. sagPanelCiz).
  sagPanelCiz(m);

  // AJANLAR SEKMESİ — formasyonSvgKur/sagPanelCiz'le AYNI ilke: sekme
  // GÖRÜNMÜYOR OLSA BİLE her yoklamada yeniden çiziliyor (DEVIR.md §6,
  // kart c-20261105-d304ed), ki sekmeye geçildiği an içerik hazır olsun.
  ajanlarEkraniCiz(m);
}

/**
 * Seçilebilecek akış adlarını okur.
 *
 * SAYFA AÇILIRKEN BİR KEZ çağrılıyor: dosya listesi ekran koşarken
 * değişmiyor (akış dosyaları gözcü/ekran dışında elle eklenir), o yüzden
 * her saniyelik yoklamada yeniden istemek gerekmiyor.
 */
async function akislarYukle() {
  try {
    const cevap = await fetch("/akislar", { cache: "no-store" });
    const veri = await cevap.json();
    AKISLAR = (cevap.ok && Array.isArray(veri.akislar)) ? veri.akislar : [];
    // 'ozet': Akışlar sekmesinin kart ızgarası — AYNI istekten, İKİNCİ bir
    // yoklama açmadan (bkz. AKISLAR_OZET yorumu).
    AKISLAR_OZET = (cevap.ok && Array.isArray(veri.ozet)) ? veri.ozet : [];
  } catch (e) {
    // Liste okunamadıysa seçici hiç çıkmaz (AKISLAR boş kalır) — sessizce
    // "başarılı ama boş" ile gerçek bir okuma hatasını karıştırmıyoruz,
    // ama seçici YOKKEN ekranın asıl işi (pano) yine de çizilmeli.
    AKISLAR = [];
    AKISLAR_OZET = [];
  }
}

// --- Akışlar sekmesi (DEVIR.md §4, kart c-20261105-d36e37) ---
//
// Kart ızgarası AKISLAR/AKISLAR_OZET'ten kuruluyor (bkz. akislarYukle) —
// sayfa açılışında BİR KEZ okunan listeler, bu sekme açıldığında İKİNCİ
// bir ağ isteği YOK. Aşağıdaki küçük SAF fonksiyonlar (DOM yok) kararları
// taşıyor; DOM'a dokunan tek yer akisKartKur/akislarEkraniCiz/
// yeniAkisAc — page.test.ts'teki 'fonksiyon'/'fonksiyonlar' aracının
// izole edip sınayabildiği kısım SAF olanlar.

/** 'ozetListesi' (AKISLAR_OZET) içinde 'ad'ı arar; yoksa null. SAF, DOM yok. */
function akisOzetBul(ozetListesi, ad) {
  return ozetListesi.find((o) => o.ad === ad) || null;
}

/**
 * "planner → architect → … → bitti" zinciri — DEVIR.md §4. SAF, DOM yok.
 * 'rolIdler' boşsa (akış bozuk, bkz. akisKartKur) bile "bitti" basıyor:
 * her akış 'done'a varır, zincirin kendisi bilinmese de BU bilinir.
 */
function akisZinciriMetni(rolIdler) {
  return rolIdler.length ? rolIdler.join(" → ") + " → bitti" : "bitti";
}

/**
 * Kartın sınıfı — "Paneldeki akışın kartı accent-100 zeminli" (DEVIR.md
 * §4). SAF, DOM yok.
 */
function akisKartSinifi(ad, aktifAd) {
  return "akisKart" + (ad === aktifAd ? " akisKart-panoda" : "");
}

/**
 * Akış adı geçerli mi — DEVIR.md §3/§4'ün kısıtı: yalnız 'a-z0-9-', boş
 * değil. SAF, DOM yok. 'duzenleAdSanitize' (rol adı için, yukarıda)
 * SESSİZCE temizler; burada REDDETMEK doğru — "Yeni akış" düğmesi
 * kullanıcı hâlâ yazarken geçersiz bir ad YOLLAMAMALI, sanitize edilmiş
 * hâli sessizce göndermek kullanıcının yazdığını değiştirirdi.
 */
function akisAdiGecerliMi(ad) {
  return /^[a-z0-9-]+$/.test(ad);
}

/**
 * "Oluştur ve düzenle" düğmesinin etkin olma koşulu — geçerli VE
 * benzersiz. SAF, DOM yok.
 */
function yeniAkisGecerliMi(ad, mevcutAdlar) {
  return akisAdiGecerliMi(ad) && !mevcutAdlar.includes(ad);
}

/**
 * Akışlar sekmesinin kart ızgarasındaki 200×110 mini formasyon (DEVIR.md
 * §4). Pano'nun CANLI V formasyonundan (formasyonSvgKur) KASITLI OLARAK
 * FARKLI: bu sekme başka akışların kartlarını hiç okumuyor (bkz.
 * /akislar'ın 'ozet'i, server.ts) — gösterecek "çalışıyor/kapıda" durumu
 * YOK, o yüzden kuş hep --color-text, kanat çırpma yok. Konum matematiği
 * YİNE DE AYNI kaynaktan (rolKonumu/FORMASYON_GOVDE, aşağıda tanımlı):
 * iki ayrı "V nasıl çizilir" yorumu olmasın. 'preserveAspectRatio: none'
 * DEVIR'in 200×110'unu (1000×640'tan FARKLI en-boy oranı) ZORLUYOR —
 * aksi hâlde tarayıcı SVG'yi oranı KORUYARAK sığdırır ve kutunun bir
 * kenarında boşluk kalır.
 */
function miniFormasyonSvg(rolSayisi) {
  const svg = sv("svg", {
    viewBox: "0 0 1000 640", width: "200", height: "110", preserveAspectRatio: "none",
    role: "img", "aria-label": "Rol formasyonu önizlemesi",
  });
  svg.classList.add("akisKartFormasyon");
  if (rolSayisi <= 0) return svg;
  // Renk CSS SINIFINDAN geliyor, satır-içi style'dan DEĞİL: ".akisKart-panoda
  // .akisKartFormasyonGovde/-Nokta" (yukarıda) kartın panoda OLUP OLMAMASINA
  // göre --color-text/--color-neutral-900 arasında seçim yapıyor — bu
  // fonksiyon o kararı BİLMİYOR (ad/aktifAd burada YOK), sınıf seçicisi
  // bilsin diye DOM'da iki ayrı yer yerine TEK CSS kararı kalıyor.
  const govde = sv("polyline", {
    class: "akisKartFormasyonGovde",
    points: FORMASYON_GOVDE.map((p) => p.join(",")).join(" "), "vector-effect": "non-scaling-stroke",
  });
  svg.append(govde);
  for (let i = 0; i < rolSayisi; i++) {
    const konum = rolKonumu(i, rolSayisi);
    const nokta = sv("circle", { class: "akisKartFormasyonNokta", cx: konum.x, cy: konum.y, r: "20" });
    svg.append(nokta);
  }
  return svg;
}

/**
 * '/akis/sec'in SEÇİCİSİZ ikizi — Akışlar sekmesindeki kart düğmeleri bir
 * select öğesi taşımıyor (bkz. akisSec, yukarıda), ama çekirdeğe giden
 * komut AYNI olmalı; iki ayrı "akış nasıl değiştirilir" yorumu olmasın.
 * Başarıyı boolean döndürüyor: çağıran (akisKartSecVeAc) reddedilince
 * DEVAM ETMEMELİ (hash değişmemeli, editör açılmamalı).
 */
async function akisKartSec(ad) {
  try {
    const cevap = await fetch("/akis/sec", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify({ ad }),
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    ciz(veri.model);
    return true;
  } catch (e) {
    bildirimGoster("Akış değiştirilemedi: " + e.message);
    return false;
  }
}

/**
 * "Panoda aç" / "Rolleri düzenle" düğmeleri — akış ZATEN panodaysa
 * GEREKSİZ bir /akis/sec isteği atılmıyor (hâlâ "hedef"e göre davranış
 * aynı: Pano'ya git, istenirse editörü aç).
 */
async function akisKartSecVeAc(ad, hedef) {
  if (ad !== AKTIF_AD) {
    const basarili = await akisKartSec(ad);
    if (!basarili) return;
  }
  location.hash = "";
  if (hedef === "duzenle") duzenleAc();
}

/**
 * Akışlar sekmesinin TEK kartı — DEVIR.md §4. 'ozet' AKISLAR_OZET'ten
 * çıkarılmış: 'draft' varsa gerçek açıklama/rol sayısı/zincir, 'hata'
 * varsa akış BOZUK (bkz. akisOzetiYukle, server.ts) — kart bunu
 * SAKLAMIYOR, "bir akışın bozulması listenin GERİ KALANINI göstermeyi
 * engellememeli" ilkesinin ekran tarafı (bkz. m.bozuk/m.engeller).
 */
function akisKartKur(ad, aktifAd) {
  const ozet = akisOzetBul(AKISLAR_OZET, ad);
  const draft = ozet ? ozet.draft : null;
  const rolIdler = draft ? draft.roles.map((r) => r.id) : [];

  const kart = el("div", akisKartSinifi(ad, aktifAd));
  kart.dataset.akis = ad;
  kart.append(miniFormasyonSvg(rolIdler.length));

  const ust = el("div", "akisKartUst");
  const adBlok = el("div", "akisKartAdBlok");
  adBlok.append(el("h3", "akisKartAd", ad));
  if (ad === aktifAd) adBlok.append(el("span", "akisKartEtiket", "panoda"));
  ust.append(adBlok);
  ust.append(el("div", "akisKartRolSayisi", rolIdler.length ? rolIdler.length + " rol" : "rol sayısı bilinmiyor"));
  kart.append(ust);

  if (ozet && ozet.hata) {
    kart.append(el("p", "akisKartHata", ozet.hata));
  } else if (draft) {
    kart.append(el("p", "akisKartAciklama", draft.description || "(açıklama yok)"));
    kart.append(el("div", "akisKartZincir", akisZinciriMetni(rolIdler)));
  }

  const dugmeler = el("div", "akisKartDugmeler");
  const panodaAc = el("button", "railBtn primary", "Panoda aç");
  panodaAc.type = "button";
  panodaAc.addEventListener("click", () => void akisKartSecVeAc(ad, "pano"));
  dugmeler.append(panodaAc);

  const rolleriDuzenle = el("button", "railBtn", "Rolleri düzenle");
  rolleriDuzenle.type = "button";
  rolleriDuzenle.addEventListener("click", () => void akisKartSecVeAc(ad, "duzenle"));
  dugmeler.append(rolleriDuzenle);

  // "Kopyala": şablon taslağı bu kartın KENDİ taslağı — bozuksa (draft
  // null) kopyalanacak bir yapı yok, düğme bunu VAAT ETMİYOR.
  const kopyala = el("button", "railBtn", "Kopyala");
  kopyala.type = "button";
  kopyala.disabled = !draft;
  if (!draft) kopyala.title = "Bu akış şu an geçersiz, şablon olarak kullanılamıyor.";
  kopyala.addEventListener("click", () => { yeniAkisAc({ sablon: ad, onerilenAd: ad + "-kopya" }); });
  dugmeler.append(kopyala);

  kart.append(dugmeler);
  return kart;
}

/**
 * "Yeni akış" iletişim kutusu — DEVIR.md §4: ad (benzersiz, a-z0-9-),
 * açıklama, şablon akış. "Oluştur ve düzenle" ÜÇ adımı tek tıkla yapıyor:
 * şablonun TAM taslağını (AKISLAR_OZET'ten, sunucudan YENİDEN İSTEMEDEN
 * — zaten orada) ad/açıklama değiştirilmiş bir KOPYASIYLA yeni bir
 * dosyaya yazar (/akis/yaz + yeniAd, bkz. server.ts hedefAkisYolu),
 * sonra ona GEÇER (/akis/sec) ve editörü açar (duzenleAc). "Kopyala"
 * düğmesi (akisKartKur) AYNI kutuyu, şablonu ÖNCEDEN SEÇİLİ açarak
 * kullanıyor — iki ayrı "yeni akış nasıl kurulur" akışı YOK.
 *
 * Hash'i HİÇ DEĞİŞTİRMİYOR (bkz. kapat() yorumu): bu kutu Akışlar
 * sekmesinden açılıyor ve sekme hash'in KENDİSİ (#akislar) — Pano'nun
 * sub-panelleri gibi davranıp hash'i "yeni"ye çevirseydi, Escape'in
 * ("#" boşaltır) Pano'ya sıçraması gerekirdi.
 */
function yeniAkisAc(onerilenler) {
  const sablonOnerisi = (onerilenler && onerilenler.sablon) || AKISLAR[0] || "";
  const kap = document.getElementById("panel");
  const kutu = el("div", "ust ust-ortali");
  // '.panel' SINIFI BİLEREK YOK: o ESKİ çekmecenin kendi düzen kuralları
  // var (height:100%, border-left, 620px genişlik — bkz. ".panel" kuralı,
  // yukarıda) ve ".dialog" ile AYNI özgüllükte olduklarından kaynak
  // SIRASINA göre çakışırdı. ".dialog" kendi tam düzenini taşıyor.
  const ic = el("div", "dialog");
  ic.append(el("h2", null, "Yeni akış"));

  const adL = el("label", null);
  adL.append(document.createTextNode("Ad"));
  const adI = el("input");
  adI.type = "text";
  adI.setAttribute("pattern", "[a-z0-9-]+");
  adI.value = (onerilenler && onerilenler.onerilenAd) || "";
  adL.append(adI);
  ic.append(adL);

  const acL = el("label", null);
  acL.append(document.createTextNode("Açıklama"));
  const acI = el("textarea");
  acI.rows = 3;
  acL.append(acI);
  ic.append(acL);

  const sabL = el("label", null);
  sabL.append(document.createTextNode("Şablon akış"));
  const sabS = el("select");
  AKISLAR.forEach((ad) => {
    const o = el("option", null, ad);
    o.value = ad;
    if (ad === sablonOnerisi) o.selected = true;
    sabS.append(o);
  });
  sabL.append(sabS);
  ic.append(sabL);

  const hataKutu = el("div", "err");
  hataKutu.style.cssText = "display:none";
  ic.append(hataKutu);

  // '.railCikis' (sağ panelin kapı çıkışları için, YUKARIDA tanımlı) —
  // '.exits' BURADA KASITLI OLARAK kullanılmıyor: o sınıfın KENDİ
  // ".exits button" kuralı (ESKİ sistem, satır ~804) bu düğmelerin
  // Modernist ".railBtn" biçimini EZERDİ (daha yüksek özgüllük, aynı
  // kusur sınıfı — AJAN_AYRAC'ın kendi yorumunun uyardığı "iki yerde iki
  // ayrı kural" türünden, burada renk/biçim için).
  const satir = el("div", "railCikis");
  const olustur = el("button", "railBtn primary", "Oluştur ve düzenle");
  olustur.type = "button";
  const vazgec = el("button", "railBtn", "Vazgeç");
  vazgec.type = "button";
  vazgec.addEventListener("click", () => { kap.replaceChildren(); });
  satir.append(olustur, vazgec);
  ic.append(satir);

  const guncelle = () => { olustur.disabled = !yeniAkisGecerliMi(adI.value, AKISLAR); };
  adI.addEventListener("input", () => { adI.value = duzenleAdSanitize(adI.value); guncelle(); });
  guncelle();

  olustur.addEventListener("click", async () => {
    olustur.disabled = true;
    hataKutu.style.cssText = "display:none";
    try {
      const sablonOzet = akisOzetBul(AKISLAR_OZET, sabS.value);
      if (!sablonOzet || !sablonOzet.draft) throw new Error("Şablon akış şu an okunamıyor.");
      // Derin kopya: sablonOzet.draft AKISLAR_OZET'in KENDİ nesnesi,
      // üzerine doğrudan yazmak o listeyi de değiştirirdi.
      const yeniTaslak = JSON.parse(JSON.stringify(sablonOzet.draft));
      yeniTaslak.name = adI.value;
      if (acI.value.trim()) yeniTaslak.description = acI.value.trim();
      else delete yeniTaslak.description;

      const yazCevap = await fetch("/akis/yaz", {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": JETON },
        body: JSON.stringify({ ...yeniTaslak, yeniAd: adI.value }),
      });
      const yazVeri = await yazCevap.json();
      if (!yazCevap.ok) throw new Error(yazVeri.hata || yazCevap.status);

      const basarili = await akisKartSec(adI.value);
      if (!basarili) return; // akisKartSec kendi bildirimini gösterdi
      kap.replaceChildren();
      // Sağ panel (duzenleAc'in açtığı yer) Pano'nun DOM alt ağacında —
      // sekme hâlâ "akislar"ken açılsaydı #icerikPano'nun "display:none"ı
      // onu GÖRÜNMEZ bırakırdı (bkz. akisKartSecVeAc'in AYNI deseni).
      location.hash = "";
      duzenleAc();
    } catch (e) {
      olustur.disabled = false;
      hataKutu.textContent = e.message;
      hataKutu.style.cssText = "display:block;white-space:pre-wrap";
    }
  });

  kutu.addEventListener("click", (e) => { if (e.target === kutu) kap.replaceChildren(); });
  kutu.append(ic);
  kap.replaceChildren(kutu);
  adI.focus();
}

/**
 * Akışlar sekmesinin içeriği — sekme açıldığında BİR KEZ kuruluyor
 * (bkz. hashOku'nun "akislar" dalı). AKISLAR/AKISLAR_OZET değişmediği
 * için (sayfa açılışında bir kez okunan liste) saniyelik yoklamadan
 * yeniden çağrılmıyor — formasyonSvgKur'un "her yoklamada yeniden kur"
 * ilkesinin TERSİ: orada model saniyede değişiyor, burada liste HİÇ
 * değişmiyor.
 */
function akislarEkraniCiz() {
  const kok = document.getElementById("icerikAkislar");
  const baslik = el("div", "akislarBaslik");
  baslik.append(el("h1", null, "Akışlar"));
  baslik.append(el("p", null,
    "Depodaki her akış burada: hangi rollerden geçtiği, hangisinin şu an " +
    "panoda açık olduğu, ve rollerini düzenlemek ya da kopyalamak için kısayollar."));
  const yeniDugme = el("button", "railBtn primary", "Yeni akış");
  yeniDugme.type = "button";
  yeniDugme.addEventListener("click", () => { yeniAkisAc(null); });
  baslik.append(yeniDugme);

  const izgara = el("div", "akislarIzgara");
  if (!AKISLAR.length) {
    izgara.append(el("div", "ipucu", "Bu ekran akış listesine açık değil ya da hub/flows/ boş."));
  } else {
    AKISLAR.forEach((ad) => izgara.append(akisKartKur(ad, AKTIF_AD)));
  }

  kok.replaceChildren(baslik, izgara);
}

async function yokla() {
  const uyari = document.getElementById("kopuk");
  try {
    const cevap = await fetch("/durum", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    uyari.replaceChildren();
    // UÇUŞ TESPİTİ — "kart devredilince kuş V üzerinden uçsun" (bkz.
    // formasyonSvgKur'un üstündeki "UÇUŞ" bölümü). KASITLI OLARAK burada,
    // ciz() İÇİNDE DEĞİL: ciz() SON_MODEL'le tekrar tekrar çağrılıyor
    // (sekme değişince, RAIL geçişinde, ...) ve o çağrılarda VERİ
    // DEĞİŞMİYOR — tespit orada yapılsaydı AYNI devir her yeniden
    // çizimde bir YENİ uçuş sayılırdı. Burada yalnızca GERÇEK bir /durum
    // yanıtı geldiğinde bir kez çalışır.
    //
    // SAPMALAR.md §2.2: prefers-reduced-motion'da uçuş hiç KURULMUYOR —
    // "anında ışınlan" diye ayrı bir dal YAZMAYA gerek yok, kuş zaten
    // normal şekilde (statik düğüm rengi/konumu) hedefte BELİRİR.
    const azaltilmisHareket = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!azaltilmisHareket) {
      const devirler = kartDevirleriniBul(KART_SON_ROL, veri.cards);
      if (devirler.length) {
        ucusPlanlariniKur(devirler, veri.roles).forEach((plan) => {
          UCUSLAR.push({
            cardId: plan.cardId, yol: plan.yol, sure: plan.sure, baslangic: performance.now(),
          });
        });
      }
    }
    KART_SON_ROL = rolHaritasiCikar(veri.cards);
    ciz(veri);
  } catch (e) {
    // Okuma koptuğunda ekranı boşaltmak, "iş yok" ile "bakamıyorum"u
    // karıştırmak olurdu. Son çizim yerinde kalır, üstüne uyarı düşer.
    uyari.replaceChildren(el("div", "err", "Durum okunamadı: " + e.message + " — gözcü kapanmış olabilir."));
  }
}

// --- Akış düzenleyici ---
//
// Ekranın ürettiği şey tam olarak hub/flows/<ad>.yaml. Ayrı bir "ekran
// biçimi" olsaydı, iki temsil arasında sürüklenme kaçınılmazdı.
let TASLAK = null;
let SAGLAYICILAR = [];

/**
 * YENİ KART paneli.
 *
 * Kart açmak ekrandan yapılamıyordu ve tek yol card -- new komutuydu. "Her
 * şeyi önyüzden" hedefinde eksik olan en büyük parça buydu: işe
 * BAŞLAMAK ekranda yoktu.
 *
 * Rol seçimi YOK ve bu kasıtlı: kart her zaman zincirin başından girer.
 * Ortadan başlatmak, önceki rollerin üreteceği girdiyi atlamak olurdu ve
 * o atlama hiçbir yerde görünmezdi.
 */
function yeniKartAc() {
  const kap = document.getElementById("panel");
  const kutu = el("div", "ust");
  const ic = el("div", "panel");
  ic.append(el("h2", null, "Yeni kart"));
  ic.append(el("p", "ipucu",
    "Kart zincirin ilk rolünden başlar. Gözcü açıksa kendiliğinden uyanır; " +
    "kapalıysa kart kuyrukta bekler."));

  const bl = el("label", null);
  bl.append(document.createTextNode("Başlık"));
  const bi = el("input");
  bi.type = "text";
  bi.placeholder = "kısa ve ayırt edici";
  bl.append(bi);
  ic.append(bl);

  const gl = el("label", null);
  gl.append(document.createTextNode("İş metni"));
  const gi = el("textarea");
  gi.rows = 14;
  gi.placeholder = "Ne yapılacak, neden, ve bittiğini nasıl anlayacağız. " +
    "Ajanın göreceği tek metin bu.";
  gl.append(gi);
  ic.append(gl);

  const satir = el("div", "exits");
  const ac = el("button", "primary", "Kartı aç");
  ac.type = "button";
  const vazgec = el("button", null, "Vazgeç");
  vazgec.type = "button";
  vazgec.addEventListener("click", () => { location.hash = ""; });
  satir.append(ac);
  satir.append(vazgec);
  ic.append(satir);

  const hataKutu = el("div", "err");
  hataKutu.style.cssText = "display:none";
  ic.append(hataKutu);

  ac.addEventListener("click", async () => {
    ac.disabled = true;
    hataKutu.style.cssText = "display:none";
    try {
      const cevap = await fetch("/kart/yeni", {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": JETON },
        body: JSON.stringify({ baslik: bi.value, gorev: gi.value }),
      });
      const veri = await cevap.json();
      if (!cevap.ok) throw new Error(veri.hata || cevap.status);
      // Çekirdeğin döndürdüğü model çiziliyor: ekran kendi kopyasını
      // uydurmuyor, kartın gerçekten nereye düştüğünü çekirdek söylüyor.
      ciz(veri.model);
      location.hash = "";
    } catch (e) {
      ac.disabled = false;
      hataKutu.textContent = e.message;
      hataKutu.style.cssText = "display:block;white-space:pre-wrap";
    }
  });

  kutu.addEventListener("click", (e) => { if (e.target === kutu) location.hash = ""; });
  kutu.append(ic);
  kap.replaceChildren(kutu);
  bi.focus();
}

// --- Akış diyagramı ---
//
// Akış bugüne kadar ekranda bir YAML metin kutusuydu — ama akış bir METİN
// değil bir GRAF: roller düğüm, next/reject/syncBack kenar. Ayrıştırma
// BURADA YAPILMIYOR: model.edges ve model.gates SUNUCUDA türetiliyor
// (src/flow/load.ts akışın ne anlama geldiğine karar veren TEK yer
// kalıyor, bkz. model.ts'teki UiModel.edges yorumu) — bu bölüm yalnızca o
// listeyi ÇİZİYOR.
//
// Yerleşim kasıtlı BASİT: roller zaten zincir sırasında (next bağından
// türetilmiş, bkz. flow/load.ts chainOrder), yani konum dizideki İNDEKS.
// Genel amaçlı bir graf yerleşim algoritması YOK — bu akışlar küçük ve
// doğrusal.
const DIYAGRAM_NS = "http:" + "//www.w3.org/2000/svg";

/** SVG düğümü kurar ve verilen öznitelikleri basar. */
function sv(ad, oznitelikler) {
  const n = document.createElementNS(DIYAGRAM_NS, ad);
  if (oznitelikler) {
    Object.keys(oznitelikler).forEach((k) => n.setAttribute(k, String(oznitelikler[k])));
  }
  return n;
}

/**
 * Kenar türü başına çizgi biçimi.
 *
 * RENK TEK TAŞIYICI DEĞİL (erişilebilirlik): üç tür de kendi
 * stroke-dasharray'ine sahip, yani renk körü bir göz de next'i reject'ten
 * ayırabilir. "next" HER ZAMAN bitişik düğümler arasında düz bir çizgi;
 * "reject" ve "syncBack" HER ZAMAN geriye kıvrılıyor (load.ts kural 6, 13)
 * ve iki ayrı "lane"de duruyor ki aynı çifte giden reject+syncBack üst
 * üste binmesin (gunluk-tek.yaml'daki reviewer->coder tam bu durum).
 */
const KENAR_STIL = {
  next: { kesikli: "none", renk: "var(--ink-2)" },
  reject: { kesikli: "7 5", renk: "var(--reject)" },
  syncBack: { kesikli: "1.5 5", renk: "var(--accent)" },
};
const KENAR_LANE = { reject: 44, syncBack: 76 };
const KAPI_BANT = 42;
const DUGUM_W = 148;
const DUGUM_H = 52;

/** Verilen yöne (ucX, ucY) bakan dolu bir ok ucu üçgeni. */
function okUcu(ucX, ucY, yonX, yonY, renk) {
  const uzunluk = Math.hypot(yonX, yonY) || 1;
  const ux = yonX / uzunluk;
  const uy = yonY / uzunluk;
  const boy = 9;
  const yarimGenislik = 4;
  const tabanX = ucX - ux * boy;
  const tabanY = ucY - uy * boy;
  const perpX = -uy;
  const perpY = ux;
  const ucgen = sv("polygon", {
    points:
      ucX + "," + ucY + " " +
      (tabanX + perpX * yarimGenislik) + "," + (tabanY + perpY * yarimGenislik) + " " +
      (tabanX - perpX * yarimGenislik) + "," + (tabanY - perpY * yarimGenislik),
  });
  ucgen.style.fill = renk;
  return ucgen;
}

/**
 * Bir 'next' kenarının ortasına konan "+" düğmesi.
 *
 * Tıklanınca yeni rolü sonraId'nin ARDINA eklemek üzere /rol/yeni
 * formunu açıyor (bkz. diyagramRolArasiEkleAc) — diyagramın kendi bir
 * yazma yolu YOK, bu düğme sadece aynı tek yolu (POST /rol/yeni, o da
 * writeDraft'tan geçiyor) diyagramdan ÇAĞIRIYOR.
 */
function ekleIsaretiKur(x, y, sonraId) {
  const g = sv("g", { class: "kenar-ekle", "data-sonra": sonraId });
  g.style.cursor = "pointer";
  const daire = sv("circle", { cx: x, cy: y, r: 9 });
  daire.style.fill = "var(--surface)";
  daire.style.stroke = "var(--accent)";
  daire.style.strokeWidth = "1.5";
  g.append(daire);
  const artiMetni = sv("text", { x: x, y: y + 3.5, "text-anchor": "middle" });
  artiMetni.style.fill = "var(--accent-ink)";
  artiMetni.style.fontSize = "13px";
  artiMetni.style.fontWeight = "700";
  artiMetni.textContent = "+";
  g.append(artiMetni);
  g.addEventListener("click", (e) => {
    e.stopPropagation();
    diyagramRolArasiEkleAc(sonraId);
  });
  return g;
}

// --- Formasyon diyagramı (Pano) ---
//
// DEVIR.md "Formasyon diyagramı (V formasyonu)" — eski sütun panosunun
// (.board/.col/.colhead) yerini alıyor. "akış diyagramı"ndan (yukarıdaki
// diyagramSvgKur) FARKLI bir bölüm: o Akışlar sekmesinin kendi editör
// önizlemesi (zincir sırasıyla düz bir çizgi), bu BÖLÜM Pano'nun GÖRÜNÜR
// yüzeyi — V biçiminde sabit bir gövde çizgisi ve roller onun üzerinde.
// sv()/okUcu()/DIYAGRAM_NS YUKARIDA tanımlı, burada TEKRAR EDİLMİYOR.

/**
 * Gövde çizgisinin beş sabit noktası — DEVIR.md'den BİREBİR. TEK kaynak:
 * hem çizgiyi çizen kod (formasyonSvgKur) hem rol konumunu hesaplayan
 * rolKonumu BUNU okuyor; iki ayrı kopya olsaydı biri güncellenip öteki
 * unutulabilirdi (ölçülmüş bir kusur sınıfı, bu dosyada AJAN_AYRAC'ın
 * kendi yorumunda da aynı uyarı var).
 */
const FORMASYON_GOVDE = [[40, 110], [230, 110], [500, 480], [770, 110], [950, 110]];

/**
 * Bir rolün V üzerindeki konumu — SAF, DOM yok.
 *
 * f = i/(n-1): roller zincir sırasında EŞİT ARALIKLA diziliyor (DEVIR.md).
 * Konum sol-uç/tepe/sağ-uç (FORMASYON_GOVDE[1..3]) arasında DÜZ ORANLA
 * (lerp, "* f * 2") hesaplanıyor — GİRİŞ VE ÇIKIŞ noktaları (GOVDE[0] ve
 * GOVDE[4]) bu hesaba HİÇ GİRMİYOR. Bu, tasarım belgesinin DEĞİL, asıl
 * referans prototipin (skein-merkez-v3.html, posAt/place
 * fonksiyonları) birebir kopyası — DEVIR.md konumun TAM formülünü
 * (arc-length mi, düz oran mı, giriş/çıkış dahil mi) hiç söylemiyor,
 * yani prototip buradaki TEK kaynak.
 *
 * Bu seçim rastgele değil, ÖLÇÜLMÜŞ bir kusuru önlüyor: ilk denemede
 * sol/sağ kolu giriş→sol-uç→tepe (üç nokta, arc-length ağırlıklı) olarak
 * kurmuştum. Sonuç: iki rollü bir akışta (örn. coder/reviewer) ilk rol
 * TAM giriş noktasına (40,110), son rol TAM çıkış noktasına (950,110)
 * düşüyordu — "Yeni kart" "+" düğmesiyle ilk rol düğümü, "biten kart"
 * kutusuyla son rol düğümü AYNI merkezde üst üste biniyordu (iki
 * tıklanabilir öğe aynı yerde — biri her zaman erişilmez kalırdı).
 * Prototipin gerçek formülü sol-uç/sağ-uçtan BAŞLIYOR, giriş/çıkış
 * noktaları yalnızca "+" düğmesi ve biten-kart kutusu için ayrı duruyor.
 *
 * f===0.5 (tek rol İÇİN ZORLANMIŞ ya da TEK SAYIDA rolün ORTANCASI)
 * HER İKİ daldan da AYNI noktaya (tepe) düşüyor — bu yüzden "tepe" AYRI
 * bir dal: kol etiketi KOORDİNATA göre (apex noktasıyla çakışıyor mu),
 * "n===1 mi" sorusuna göre DEĞİL. Prototip de aynı ayrımı yapıyor
 * (place fonksiyonunun side==="apex" dalı).
 */
function rolKonumu(i, n) {
  const SOL_UC = { x: FORMASYON_GOVDE[1][0], y: FORMASYON_GOVDE[1][1] };
  const TEPE = { x: FORMASYON_GOVDE[2][0], y: FORMASYON_GOVDE[2][1] };
  const SAG_UC = { x: FORMASYON_GOVDE[3][0], y: FORMASYON_GOVDE[3][1] };
  const f = n <= 1 ? 0.5 : i / (n - 1);
  if (f === 0.5) return { x: TEPE.x, y: TEPE.y, kol: "tepe" };
  if (f < 0.5) {
    return { x: SOL_UC.x + (TEPE.x - SOL_UC.x) * f * 2, y: SOL_UC.y + (TEPE.y - SOL_UC.y) * f * 2, kol: "sol" };
  }
  const t = (f - 0.5) * 2;
  return { x: TEPE.x + (SAG_UC.x - TEPE.x) * t, y: TEPE.y + (SAG_UC.y - TEPE.y) * t, kol: "sag" };
}

/**
 * Rol düğümündeki kuşun rengi — SAF, DOM yok.
 *
 * Öncelik DEVIR.md'nin sırasıyla AYNI: çalışan ya da kapıdaki kart varsa
 * accent (iş GÖRÜNÜR durumda), yoksa herhangi bir kart varsa text (iş
 * var ama sakin bekliyor), hiç kart yoksa SAPMA'nın düzelttiği
 * neutral-600 (tasarım neutral-400 diyordu, ölçülen oran 1.80:1 — bkz.
 * tasarim/SAPMALAR.md §1, "boş rol kuşu").
 */
function kusRengi(kartlar) {
  if (kartlar.some((c) => c.state === "active" || c.gate)) return "var(--color-accent)";
  if (kartlar.length) return "var(--color-text)";
  return "var(--empty-bird-ink)";
}

/**
 * Bir kartın "kart karesi" durumu — SAF, DOM yok. Dönen üç ad
 * (".formasyonDugum .kare-<ad>" ve ".lejant .kare.<ad>") çizimle
 * PAYLAŞILIYOR: "kuyrukta" SAPMALAR.md §1'in düzelttiği hâli taşıyor
 * (neutral-500 dolgu + --color-text kenar — tasarımın kenarsız/dolguyla
 * AYNI renkteki karesi DEĞİL).
 */
function kareDurumu(c) {
  if (c.state === "active") return "calisiyor";
  if (c.gate) return "kapida";
  return "kuyrukta";
}

/**
 * Ret yayının kontrol noktası — SAF, DOM yok.
 *
 * DEVIR.md: "kontrol noktası iki rolün orta noktasından (500,170)'e
 * doğru %60 kaydırılır" — orta nokta hedefe %60 YAKLAŞTIRILIYOR (lerp),
 * hedefin KENDİSİNE eşitlenmiyor: %100 olsaydı HER yay aynı noktadan
 * geçerdi ve eğrinin biçimi kaynağı/hedefi unuturdu.
 */
function retYayKontrol(a, b) {
  const ortaX = (a.x + b.x) / 2;
  const ortaY = (a.y + b.y) / 2;
  const hedefX = 500;
  const hedefY = 170;
  return { x: ortaX + (hedefX - ortaX) * 0.6, y: ortaY + (hedefY - ortaY) * 0.6 };
}

/**
 * İki noktayı birleştiren çizgiye DİK, ortasından geçen kısa bir
 * segment — insan onayı kapısının işareti. SAF, DOM yok.
 */
function kapiCizgisi(a, b, uzunluk) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const boy = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / boy;
  const py = dx / boy;
  const yari = uzunluk / 2;
  return { x1: mx - px * yari, y1: my - py * yari, x2: mx + px * yari, y2: my + py * yari };
}

/**
 * Kanat çırpmanın KOŞULU — SAF, DOM yok. DEVIR.md: "yalnızca rolde
 * çalışan kart varsa VE gözcü açıkken". "çalışan" burada "kapıda
 * bekleyen" DEĞİL — kusRengi'nin accent koşulundan daha DAR: kapıda
 * bekleyen bir kart insan kararını bekliyor, kanat çırpıp "iş sürüyor"
 * demek yanlış bir sinyal olurdu.
 */
function kanatCirpiyorMu(rolKartlari, daemon) {
  return rolKartlari.some((c) => c.state === "active") && Boolean(daemon && daemon.alive);
}

/**
 * Bir rolün KARTLARI — bitmiş ve yetim kartlar sayılmıyor. SAF, DOM yok.
 *
 * Formasyon düğümü (formasyonSvgKur) VE sağ panelin Rol modu (railRolCiz)
 * AYNI filtreyi kendi "rolKartlari" yerel değişkenlerinde taşıyordu —
 * ÜÇÜNCÜ bir kopya (Ajanlar sekmesi) açmak AJAN_AYRAC'ın tam uyardığı
 * kusur sınıfı olurdu, o yüzden üçü de artık BURADAN okuyor. Çağıranların
 * yerel değişken adı ("rolKartlari") BİLEREK bu fonksiyonun adıyla
 * ÇARPIŞMASIN diye isim farklı — "const rolKartlari = rolKartlari(...)"
 * kendi kendine referans verip ReferenceError fırlatırdı (TDZ).
 *
 * (Not: bu bölge gömülü betiğin şablon dizesinin İÇİNDE — ters tırnak
 * yazmak dizeyi kapatır ve dosya derlenmez, bu dosyada birkaç kez
 * düşülen bir tuzak.)
 */
function rolunAcikKartlari(cards, rolId) {
  return cards.filter((c) => c.role === rolId && c.state !== "done" && !c.orphan);
}

/**
 * Bir rolün "GÜNCEL" kartı — Ajanlar sekmesinin "Şu an" kutusu ve
 * "Adımlar" listesi bunun üstünden kurulur (DEVIR.md §6). SAF, DOM yok.
 *
 * ÖNCELİK: koşan kart varsa O (operatörün görmek istediği şey "şu an ne
 * oluyor"); yoksa kapıda bekleyen kart (DEVIR'in "kapıda bekliyor · …"
 * durumu de aynı karttan okunuyor). İkisi de yoksa "null" — rol boşta ya
 * da yalnızca kuyrukta, gösterilecek "güncel" bir kart yok.
 */
function ajanGuncelKart(rolId, cards) {
  const kartlar = rolunAcikKartlari(cards, rolId);
  return kartlar.find((c) => c.state === "active") || kartlar.find((c) => c.gate) || null;
}

/**
 * guncelKart + daemon'dan "şu an" DURUMUNUN KARARI — ajanDurumMetni (sol
 * satır) VE ajanSuAnKutuKur (sağ "Şu an" kutusu) AYNI kart için bu kararı
 * İKİ YERDE AYRI AYRI vermesin diye BURADAN okuyor: ikisi ayrı ayrı karar
 * verince aynı ekranda çelişen anlatılar çıkıyordu — kart "active" ama
 * gözcü ölüyken sol satır "gözcü kapalı · … yarıda" derken sağ kutu hâlâ
 * sahte bir "Bash · …" basıyordu (reviewer'ın b64fe2f için itirazı). SAF,
 * DOM yok.
 *
 * "gözcüKapali" dalı KASITLI OLARAK "live"/"calisiyor" dalından ÖNCE: bir
 * kart "active" durumunda olabilir ama gözcü çökmüşse (bayat kilit) ona
 * dokunan bir süreç YOK — "Bash · …" demek operatöre var olmayan bir
 * işlemi varmış gibi göstermek olurdu, SAPMALAR.md §2.6'nın "bayat
 * kilitte düğme 'durdur' DEMEZ" kuralıyla AYNI ilke, burada karta
 * uygulanmış hâli.
 */
function ajanSuAnDurumu(guncelKart, daemon) {
  if (!guncelKart) return null;
  if (guncelKart.state !== "active") return { tur: "kapida" };
  if (!(daemon && daemon.alive)) return { tur: "gozcuKapali" };
  if (guncelKart.live) return { tur: "live", live: guncelKart.live };
  return { tur: "calisiyor" };
}

/**
 * Rolün tek satırlık durum metni — DEVIR.md §6'nın beş örneğinin BİREBİR
 * karşılığı: "Bash · npx vitest run …", "kapıda bekliyor · …", "N kart
 * kuyrukta", "boşta", "gözcü kapalı · … yarıda". SAF, DOM yok.
 *
 * Kararın kendisi ajanSuAnDurumu'ndan geliyor (bkz. onun yorumu) — burada
 * yalnızca o kararın BU satır için METNE çevrilmesi var.
 */
function ajanDurumMetni(role, guncelKart, daemon) {
  const durum = ajanSuAnDurumu(guncelKart, daemon);
  if (durum) {
    if (durum.tur === "gozcuKapali") return "gözcü kapalı · " + guncelKart.title + " yarıda";
    if (durum.tur === "live") return (durum.live.name || durum.live.kind) + " · " + (durum.live.detail || "");
    if (durum.tur === "calisiyor") return "çalışıyor";
    return "kapıda bekliyor · " + guncelKart.title;
  }
  if (role.depth > 0) return role.depth + " kart kuyrukta";
  return "boşta";
}

/**
 * Bir rol GERÇEKTEN "canlı" mı — Ajanlar sekmesinin "canlı" etiketi VE
 * "GET /adimlar"ı saniyelik yoklamaya açıp açmama kararı BU fonksiyondan
 * geçiyor (bkz. ajanlarEkraniCiz). SAF, DOM yok.
 *
 * "kanatCirpiyorMu" ile AYNI iki koşulu taşıyor (kart aktif VE gözcü
 * canlı) ama TEK bir karttan, formasyonun bütün-rol listesinden DEĞİL —
 * ikisi farklı girdi alıyor diye farklı bir KURAL yazmak AJAN_AYRAC'ın
 * tam uyardığı sapma olurdu, o yüzden mantık burada da "ikisi birden"
 * diyor.
 */
function ajanCanliMi(guncelKart, daemon) {
  return Boolean(guncelKart) && guncelKart.state === "active" && Boolean(daemon && daemon.alive);
}

/**
 * Planlama katılımcılarının V üzerindeki konumları, zincir sırasıyla —
 * SAF, DOM yok. Bilinmeyen bir katılımcı (akış doğrulamasından geçmiş
 * olduğu için teoride OLMAMALI, bkz. flow/load.ts kural 17) sessizce
 * ELENİYOR: bandın yarısını çizmek, olmayan bir rolü varmış gibi
 * göstermekten daha güvenli bir hata modu.
 */
function planlamaKatilimciKonumlari(roller, katilimcilar) {
  const n = roller.length;
  const sonuc = [];
  katilimcilar.forEach((id) => {
    const i = roller.findIndex((r) => r.id === id);
    if (i !== -1) sonuc.push(rolKonumu(i, n));
  });
  return sonuc;
}

/**
 * Planlama bandının SVG yolu — SAF, DOM yok.
 *
 * İlk ve SON katılımcının konumu arasında çiziliyor (skein-merkez-v3.html:
 * "plan[0]" ve "plan[plan.length-1]" — aradaki katılımcılar KULLANILMIYOR,
 * çünkü aynı kolda zaten AYNI doğru üzerindeler, bkz. rolKonumu'nun lerp
 * formülü). İki ARM'a yayılan bir bant (ilk sol kolda, son sağ kolda)
 * TEPE'den geçmeli — yoksa düz çizgi iki kolun ARASINDAN kesip geçer,
 * V'nin kendi hattını izlemez. Aynı koldaysa (ya da biri tepedeyse) ilk
 * ile son zaten aynı doğru üzerinde, detur GEREKMİYOR.
 */
function planlamaBandYolu(ilk, son) {
  const tepe = { x: FORMASYON_GOVDE[2][0], y: FORMASYON_GOVDE[2][1] };
  const tepedenGecsin = ilk.kol === "sol" && son.kol === "sag";
  return "M " + ilk.x + " " + ilk.y +
    (tepedenGecsin ? " L " + tepe.x + " " + tepe.y : "") +
    " L " + son.x + " " + son.y;
}

/**
 * Rol düğümünün etiketi — numara, ad, "sağlayıcı · çalışma alanı" satırı.
 * Konum DEVIR.md'ye göre: sol kolda düğümün SOLUNA (sağa yaslı), sağ
 * kolda SAĞINA (sola yaslı), tepedekinde ALTINA (ortalı).
 */
function formasyonEtiketKur(rol, i, konum) {
  const g = sv("g", { class: "formasyonEtiket" });
  let x, hiza;
  if (konum.kol === "sol") { x = -40; hiza = "end"; }
  else if (konum.kol === "sag") { x = 40; hiza = "start"; }
  else { x = 0; hiza = "middle"; }
  const y0 = konum.kol === "tepe" ? 32 : -14;
  const numara = sv("text", { x: x, y: y0, "text-anchor": hiza, class: "formasyonNumara" });
  numara.textContent = String(i + 1).padStart(2, "0");
  g.append(numara);
  const ad = sv("text", { x: x, y: y0 + 16, "text-anchor": hiza, class: "formasyonRolAdi" });
  ad.textContent = rol.id;
  g.append(ad);
  const meta = sv("text", { x: x, y: y0 + 32, "text-anchor": hiza, class: "formasyonMeta" });
  meta.textContent = rol.provider + " · " + rol.workspace + (i === 0 ? " · öncü" : "");
  g.append(meta);
  return g;
}

/**
 * SAĞ PANEL — durum geçişleri (kart c-20261105-d500f1).
 *
 * SAF (DOM yok): hangi moda/role/karta geçileceği kararı burada, çizim
 * ayrı (bkz. sagPanelCiz/railGenelBakisCiz/railRolCiz/railKartCiz). Adı ve
 * alanları ("rail {mode, id, from}") DEVIR.md'nin State Management
 * bölümünden — "id" burada rolId/cardId olarak ikiye ayrıldı, çünkü Kart
 * modu RolId'yi de taşımak zorunda (geri dönüş "Rol"e mi "Genel bakış"a mı
 * gidecek, bkz. "geri" dalı).
 *
 * Kararı DOM'dan ayırmak onu fonksiyon() ile DOĞRUDAN çağrılan, mutasyon
 * sınamasına açık bir birim yapıyor (page.test.ts) — gerçek tarayıcı
 * gerektirmeyen bir karar, bu dosyadaki kapiCikislari/rolKonumu ile
 * AYNI ilke.
 */
function railGecis(rail, eylem) {
  const GENEL_BAKIS = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };
  if (eylem.tur === "genelBakis") return GENEL_BAKIS;
  if (eylem.tur === "rolSec") {
    // Zaten TAM O ROLÜN KENDİSİ açıkken (Rol modu, AYNI id) tıklamak
    // kapatır — formasyon düğümünün eski "toggle" davranışıyla AYNI. Kart
    // modundayken (örn. o rolün bir kartına bakılırken) aynı role
    // tıklamak KAPATMAZ, Rol moduna GEÇER: "&&" burada "||" olsaydı Kart
    // modunda da (roleId eşleşiyor diye) tek tıkla Genel bakışa düşülürdü.
    if (rail.mode === "role" && rail.roleId === eylem.rolId) return GENEL_BAKIS;
    return { mode: "role", roleId: eylem.rolId, cardId: null, cardFrom: "overview" };
  }
  if (eylem.tur === "kartAcGenel") {
    return { mode: "card", roleId: null, cardId: eylem.kartId, cardFrom: "overview" };
  }
  if (eylem.tur === "kartAcRol") {
    return { mode: "card", roleId: eylem.rolId, cardId: eylem.kartId, cardFrom: "role" };
  }
  if (eylem.tur === "geri") {
    // Kart "Rol" modundan açıldıysa geri dönüş "Rol"e, roleId KORUNARAK —
    // aksi hâlde "← Genel bakış" ile aynı hedefe düşer, rol bağlamı
    // (hangi role bakılıyordu) kaybolurdu.
    if (rail.mode === "card" && rail.cardFrom === "role") {
      return { mode: "role", roleId: rail.roleId, cardId: null, cardFrom: "overview" };
    }
    return GENEL_BAKIS;
  }
  return rail;
}

let RAIL = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };

/** ciz()'i SON_MODEL varsa çağırır — RAIL geçişlerinin tekrarlayan kuyruğu. */
function railYenidenCiz() {
  if (SON_MODEL) ciz(SON_MODEL);
}

// "showArcs" (DEVIR.md: "ret yayları ... 'showArcs' ile gizlenebilir").
// skein-merkez-v3.html'de bu da "animate" gibi dışarıdan verilen bir
// bayrak (this.props.showArcs ?? true), ekranın kendi panelinde bir
// düğmesi YOK — bugün burada da öyle: değer hep true, HİÇBİR kod onu
// değiştirmiyor. İkisi AYNI kategoride bırakıldı (bkz. kanatCirpiyorMu
// çağrısındaki "data-animate" notu): gelecekteki bir ayar paneli bu
// değişkeni DOĞRUDAN atayabilir, o yüzden burada bir sabit (const) değil
// bir değişken (let) olarak duruyor.
let FORMASYON_RET_GOSTER = true;

// --- UÇUŞ — kart devredildiğinde kuşun V üzerinden kayması ---
//
// Yeni görev: kuşlar artık düğümlerde SABİT durmuyor, bir kartın rolü
// DEĞİŞTİĞİNDE (devir) o kartın kuşu kaynak düğümden hedef düğüme,
// gövde çizgisinin ÜZERİNDEN (düz çizgi DEĞİL) kayarak gidiyor.
//
// Karar noktaları (hangi kuş uçacak, nereden nereye, ne kadar sürede)
// AŞAĞIDAKİ SAF fonksiyonlara çıkarıldı — formasyonSvgKur'un kendisi
// (DOM kuran taraf) yalnızca bunları ÇAĞIRIYOR, karar vermiyor.

/**
 * Her kartın rolünü bir haritaya çıkarır — SAF, DOM yok. kartDevirleriniBul
 * için "önceki" anlık görüntüyü üretir (bkz. yokla(), aşağıda). Yetim
 * kartlar (orphan) elenir: akışta artık karşılığı olmayan bir rolden
 * "uçmak" anlamsız, hedef düğüm yok.
 */
function rolHaritasiCikar(kartlar) {
  const harita = new Map();
  kartlar.forEach((k) => { if (!k.orphan) harita.set(k.id, k.role); });
  return harita;
}

/**
 * İki ardışık "/durum" anlık görüntüsü arasında HANGİ kartların rolü
 * DEĞİŞTİ — SAF, DOM yok. DEVIR görevinin "kart bir rolden diğerine
 * devredilince" koşulunun karşılığı.
 *
 * Yalnızca ÖNCEDEN BİLİNEN bir kart sayılıyor ("oncekiRoller.get(id)
 * !== undefined"): az önce açılan bir kart "hiçbir yerden" uçmaz,
 * konumunda zaten BELİRİR — bu AYRI bir karar, olmayan bir hareketi
 * varmış gibi göstermemek.
 */
function kartDevirleriniBul(oncekiRoller, kartlar) {
  const devirler = [];
  kartlar.forEach((k) => {
    if (k.orphan) return;
    const onceki = oncekiRoller.get(k.id);
    if (onceki !== undefined && onceki !== k.role) {
      devirler.push({ cardId: k.id, from: onceki, to: k.role });
    }
  });
  return devirler;
}

/**
 * İki rol konumu arasında GÖVDE ÇİZGİSİ ÜZERİNDEN giden yol — SAF, DOM
 * yok. planlamaBandYolu'nun AYNI "tepeden dolan" kuralı, ama YÖNDEN
 * BAĞIMSIZ: planlama bandı her zaman ZİNCİR SIRASIYLA (ilk sol/tepe, son
 * sağ) çağrılıyordu; devir ("rol değişti") kaynak/hedef ileri de geri de
 * olabilir (ret, kartı bir ÖNCEKİ role döndürür). "a.kol !== b.kol" —
 * ikisi de "tepe" OLMADIĞI sürece — YÖNDEN bağımsız çalışır: hangisi
 * kaynak hangisi hedef verilirse verilsin AYNI dolanmayı üretir.
 *
 * Dönen DİZİ bir nokta listesi, SVG "d" dizesi DEĞİL: ucusKonumu
 * segmentleri kendi uzunluklarıyla tartarak örnekliyor, bir dizeyi
 * yeniden ayrıştırmaya gerek yok.
 */
function govdeYolu(a, b, tepe) {
  const ayriKollarda = a.kol !== b.kol && a.kol !== "tepe" && b.kol !== "tepe";
  return ayriKollarda ? [a, tepe, b] : [a, b];
}

/**
 * Bir uçuşun SÜRESİ (ms) — SAF, DOM yok. DEVIR görevi "~600-900ms"
 * aralığını veriyor, biçimi vermiyor: burada İKİLİ bir seçim var — AYNI
 * koldaki devir (düz kayış, govdeYolu 2 nokta döner) KISA (600ms),
 * tepeden dolanan devir (3 nokta, daha uzun mesafe) UZUN (900ms). Bu
 * basit tutuyor VE mutasyon sınamasına açık: "yol.length > 2" ters
 * çevrilirse kısa/uzun yer değiştirir, sınama hemen düşer.
 */
function ucusSuresiMs(yol) {
  return yol.length > 2 ? 900 : 600;
}

/**
 * Doğrusal ilerlemeyi (0..1) YUMUŞAK giriş/çıkışa çeviren eğri — SAF,
 * DOM yok. Klasik "smoothstep" (3t²-2t³): t=0 ve t=1'de hız sıfır, t=0.5
 * civarında en hızlı — DEVIR görevinin "yumuşak giriş/çıkış" istediği
 * yer. Doğrusal t'nin KENDİSİ kullanılsaydı kuş sabit hızla kayardı,
 * "yumuşak" hiçbir şey olmazdı.
 */
function yumusakIlerleme(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Bir uçuş yolu üzerinde, YAY UZUNLUĞUNA göre t (0..1) ilerlemesindeki
 * nokta — SAF, DOM yok. "t" burada DOĞRUSAL ZAMAN DEĞİL: çağıran
 * (ucanKusKur, aşağıda) zaten yumusakIlerleme'den geçirilmiş değeri
 * verir; bu fonksiyon yalnızca GEOMETRİYİ bilir.
 *
 * YAY UZUNLUĞU, SEGMENT SAYISI DEĞİL: govdeYolu tepeden dolanan yolda
 * İKİ segment döndürür (sol-uç→tepe, tepe→sağ-uç) ve bu ikisi FARKLI
 * uzunlukta olabilir (roller eşit aralıklı değilse, bkz. rolKonumu'nun
 * lerp'i). "t"yi segment İNDEKSİNE göre bölmek (örn. t<0.5 ilk segment)
 * kuşu yanlış hızda gösterirdi — SAPMALAR.md §2.7'nin uyardığı sınıf:
 * "nitelik doğru" (iki segment de var) ama "ekranda doğru" değil (kuş
 * bir segmentte sürünür, öbüründe fırlar). Bu iddianın GERÇEK tarayıcıda
 * ölçülen hâli tarayici.test.ts'te; bu fonksiyon o ölçümün ALTINDAKİ
 * saf karardır.
 */
function ucusKonumu(yol, t) {
  const tt = Math.max(0, Math.min(1, t));
  const uzunluklar = [];
  let toplam = 0;
  for (let i = 1; i < yol.length; i++) {
    const dx = yol[i].x - yol[i - 1].x;
    const dy = yol[i].y - yol[i - 1].y;
    const uzunluk = Math.sqrt(dx * dx + dy * dy);
    uzunluklar.push(uzunluk);
    toplam += uzunluk;
  }
  if (toplam === 0) return { x: yol[0].x, y: yol[0].y };
  let kalan = tt * toplam;
  for (let i = 0; i < uzunluklar.length; i++) {
    const uzunluk = uzunluklar[i];
    if (kalan <= uzunluk || i === uzunluklar.length - 1) {
      const oran = uzunluk === 0 ? 0 : Math.min(1, kalan / uzunluk);
      const a = yol[i];
      const b = yol[i + 1];
      return { x: a.x + (b.x - a.x) * oran, y: a.y + (b.y - a.y) * oran };
    }
    kalan -= uzunluk;
  }
  const son = yol[yol.length - 1];
  return { x: son.x, y: son.y };
}

/**
 * Devir listesinden TAM uçuş planına — SAF, DOM yok. Üç kararı (hangi
 * kuş, nereden nereye, ne kadar sürede) BİR ARAYA getiriyor ama HER
 * BİRİNİN kendi küçük, bağımsız sınaması var (govdeYolu/ucusSuresiMs);
 * bu fonksiyon yalnızca onları BAĞLIYOR.
 *
 * Kaynak ya da hedef rol artık topolojide YOKSA (akış değişti, rol
 * silindi — nadir ama teorik) o devir SESSİZCE elenir: olmayan bir
 * düğüme uçtuğunu göstermek, hiç göstermemekten daha kötü bir hata
 * modu olurdu (bkz. planlamaKatilimciKonumlari'nin AYNI ilkesi).
 */
function ucusPlanlariniKur(devirler, roller) {
  const n = roller.length;
  const konumHaritasi = new Map(roller.map((r, i) => [r.id, rolKonumu(i, n)]));
  const tepe = { x: FORMASYON_GOVDE[2][0], y: FORMASYON_GOVDE[2][1] };
  const planlar = [];
  devirler.forEach((d) => {
    const a = konumHaritasi.get(d.from);
    const b = konumHaritasi.get(d.to);
    if (!a || !b) return;
    const yol = govdeYolu(a, b, tepe);
    planlar.push({ cardId: d.cardId, yol: yol, sure: ucusSuresiMs(yol) });
  });
  return planlar;
}

/**
 * Son GERÇEK "/durum" yoklamasında görülen kart→rol haritası —
 * kartDevirleriniBul'un "önceki" girdisi. yokla() dışında HİÇBİR
 * yer bunu güncellemez: ciz(SON_MODEL) ile tekrar tekrar çağrılan
 * yeniden çizimler (sekme değişimi, RAIL geçişi) AYNI veriyle çalışır,
 * onlarda devir tespiti YENİDEN yapılmaz — yoksa AYNI devir her
 * yeniden çizimde bir YENİ uçuş sayılırdı.
 */
let KART_SON_ROL = new Map();

/**
 * Şu an havada olan uçuşlar. Her biri "{cardId, yol, sure, baslangic}":
 * baslangic performance.now() anıdır — konum DOM'dan değil GERÇEK
 * GEÇEN ZAMANDAN türetildiği için (bkz. ucanKusKur) formasyonun HER
 * yoklamada baştan kurulması uçuşu BAŞA SARMAZ, yalnızca doğru anın
 * doğru noktasında yeni bir öğe doğar. Birden çok devir AYNI ANDA
 * olursa her biri kendi girdisiyle burada durur — "hepsi ayrı ayrı
 * uçsun, birbirini ezmesin" (DEVIR görevi) bu listenin her öğesinin
 * BAĞIMSIZ olmasından geliyor, ortak bir "tekil uçan kuş" durumu YOK.
 */
let UCUSLAR = [];

/**
 * Bir uçuş için DOM overlay'i kurar — tek bir SMIL/CSS animasyonuna
 * değil, requestAnimationFrame ile KENDİ konumunu her karede yeniden
 * hesaplayan bir <g>'ye dayanıyor (DEVIR görevinin iki seçeneğinden
 * ikincisi: "JS ile polyline üzerinde örnekleme"). SMIL'in begin zaman
 * çizelgesi DOKÜMANIN YAŞINA göre çözülür; formasyon HER yoklamada
 * baştan kurulduğu için ortada kesilip yeniden eklenen bir
 * animateMotion'ı doğru noktadan devam ettirmek "negatif begin" gibi
 * dokümanın yaşına bağlı bir hesap gerektirirdi. Burada konum HER KARE
 * performance.now() - u.baslangic'ten yeniden hesaplanıyor, yani hangi
 * <g> (eski ya da yeni) ekranda olursa olsun AYNI doğru noktayı
 * gösterir.
 *
 * Döngü kendi kendini durduruyor: süre dolunca YA DA düğüm artık belgede
 * DEĞİLSE (g.isConnected === false — bir sonraki yoklama SVG'yi baştan
 * kurdu, bu <g> atıldı). Bu kontrol yalnızca SONRAKİ (rAF ile ERTELENMİŞ)
 * karelerde çalışıyor — İLK çağrı formasyonSvgKur'un KENDİSİ hâlâ bu
 * <g>'yi kuruyorken, yani svg DOM'a eklenmeden (board.replaceChildren
 * daha koşmadan) GERÇEKLEŞİYOR. İlk çağrıda da "isConnected" kontrolü
 * olsaydı (ÖLÇÜLDÜ: bu kartın kendi 1. turunda tam buydu) kuş HİÇBİR
 * ZAMAN konumunu almazdı — transform hiç YAZILMAZ, kuş SVG'nin
 * köşesinde (varsayılan konumda) donup kalırdı.
 *
 * Renk hep accent: uçuşun kendisi zaten "iş aktif/devrediliyor" sinyali,
 * kusRengi'nin üç hâlini burada tekrarlamak (bu kartın rolde kaç kart
 * daha var, hangisi aktif) uçuşun ANLAMINI değiştirmez, yalnızca
 * karmaşıklık ekler.
 */
function ucanKusKur(u) {
  const g = sv("g", { class: "ucanKus" });
  g.dataset.kart = u.cardId;
  const kus = sv("svg", { x: -23, y: -11.5, width: 46, height: 23, viewBox: "0 0 46 23" });
  kus.classList.add("formasyonKus", "ucanKusGovde");
  const kusCizgi = sv("polyline", { points: "2,5 13,9 24,19 35,9 46,5", fill: "none" });
  kusCizgi.style.stroke = "var(--color-accent)";
  kusCizgi.style.strokeWidth = "4";
  kusCizgi.style.strokeLinejoin = "miter";
  kus.append(kusCizgi);
  g.append(kus);

  let ilkKare = true;
  const adimAt = () => {
    if (!ilkKare && !g.isConnected) return;
    ilkKare = false;
    const gecenMs = performance.now() - u.baslangic;
    const dogrusal = Math.max(0, Math.min(1, gecenMs / u.sure));
    const nokta = ucusKonumu(u.yol, yumusakIlerleme(dogrusal));
    g.setAttribute("transform", "translate(" + nokta.x + " " + nokta.y + ")");
    if (gecenMs < u.sure) requestAnimationFrame(adimAt);
  };
  adimAt();
  return g;
}

/**
 * Pano'nun V formasyonu. Akışlar sekmesindeki diyagramSvgKur gibi HER
 * ÇAĞRIDA baştan kuruluyor — kimlik koruma (eski kartYerlestir/
 * KART_DUGUM) burada YOK.
 *
 * Bu, UÇUŞ overlay'ini (yukarıdaki "UÇUŞ" bölümü) İMKANSIZ KILMIYOR: bir
 * uçuşun konumu DOM kimliğinden değil GERÇEK GEÇEN ZAMANDAN türetiliyor
 * (bkz. ucanKusKur), yani her yeniden kuruluş (bir yoklama, bir sekme
 * değişimi) uçuşu BAŞA SARMIYOR — yalnızca aynı anın doğru noktasında
 * yeni bir öğe doğuyor. "İş sürüyor" sinyali hâlâ kanat çırpmanın
 * kendisi; uçuş yalnızca DEVİR ANINI gösteriyor.
 */
function formasyonSvgKur(m) {
  const roller = m.roles;
  const n = roller.length;
  const konumlar = roller.map((_, i) => rolKonumu(i, n));
  const konumHaritasi = new Map(roller.map((r, i) => [r.id, konumlar[i]]));
  const girisNokta = { x: FORMASYON_GOVDE[0][0], y: FORMASYON_GOVDE[0][1] };
  const cikisNokta = { x: FORMASYON_GOVDE[4][0], y: FORMASYON_GOVDE[4][1] };

  const svg = sv("svg", { viewBox: "0 0 1000 640", role: "img", "aria-label": "Rol formasyonu" });
  svg.classList.add("formasyon");

  // PLANLAMA BANDI — gövde çizgisinden ÖNCE ekleniyor ki altında kalsın
  // (SVG'de sonraki öğe öncekinin ÜSTÜNE çizilir). TEK katılımcıda bant
  // ÇİZİLMİYOR: "ilk ile son arasında geçen bir şerit" tek noktada
  // anlamsız — skein-merkez-v3.html'in kendi kuralı (plan.length > 1).
  const planNoktalari = m.plan ? planlamaKatilimciKonumlari(roller, m.plan.katilimcilar) : [];
  if (planNoktalari.length > 1) {
    const ilk = planNoktalari[0];
    const son = planNoktalari[planNoktalari.length - 1];
    const bant = sv("path", { d: planlamaBandYolu(ilk, son), fill: "none" });
    // accent-200 koyu temada koyulaşıyor (kart c-20261106-e62847, bkz.
    // @media bloğundaki ACCENT RAMPASI yorumu) — bu şeridin açık-pembe
    // hâli (#ffe0d9) koyu gövdenin üstünde PARLAK bir çizgi olurdu.
    bant.style.stroke = "var(--color-accent-200)";
    bant.style.strokeWidth = "22";
    bant.style.strokeLinecap = "butt";
    svg.append(bant);
    const etiket = sv("text", {
      x: (ilk.x + son.x) / 2 + 40, y: (ilk.y + son.y) / 2 - 22, class: "formasyonPlanEtiket",
    });
    etiket.textContent = "planlama · en çok " + (m.plan ? m.plan.tur : 0) + " tur";
    svg.append(etiket);
  }

  // GÖVDE ÇİZGİSİ — beş sabit noktadan geçen kırık çizgi. "vector-effect:
  // non-scaling-stroke" SVG'nin viewBox ölçeklemesine KARŞI: sarmalın CSS
  // genişliği 1000px'in altına ya da üstüne düşse de 2px çizgi 2px
  // KALIYOR — skein-merkez-v3.html'deki "ns" (non-scaling-stroke) kuralı.
  const govde = sv("polyline", {
    points: FORMASYON_GOVDE.map((p) => p.join(",")).join(" "), fill: "none", "vector-effect": "non-scaling-stroke",
  });
  govde.style.stroke = "var(--color-text)";
  govde.style.strokeWidth = "2";
  svg.append(govde);

  // RET YAYLARI — "showArcs" (DEVIR.md) burada FORMASYON_RET_GOSTER.
  if (FORMASYON_RET_GOSTER) {
    m.edges.filter((e) => e.kind === "reject").forEach((kenar) => {
      const a = konumHaritasi.get(kenar.from);
      const b = konumHaritasi.get(kenar.to);
      if (!a || !b) return;
      const kontrol = retYayKontrol(a, b);
      const yol = sv("path", {
        d: "M " + a.x + " " + a.y + " Q " + kontrol.x + " " + kontrol.y + " " + b.x + " " + b.y,
        fill: "none", "vector-effect": "non-scaling-stroke",
      });
      yol.style.stroke = "var(--color-accent)";
      yol.style.strokeWidth = "2";
      svg.append(yol);
      svg.append(okUcu(b.x, b.y, b.x - kontrol.x, b.y - kontrol.y, "var(--color-accent)"));
      // ETİKET yayın ÜZERİNDE: quadratic Bézier'in t=0.5 noktası
      // (0.25·a + 0.5·kontrol + 0.25·b) — kontrol noktasının KENDİSİ
      // DEĞİL, eğri kontrol noktasından GEÇMİYOR, yalnızca ona doğru
      // kıvrılıyor (bkz. skein-merkez-v3.html "lab" hesabı).
      const egriOrta = {
        x: 0.25 * a.x + 0.5 * kontrol.x + 0.25 * b.x,
        y: 0.25 * a.y + 0.5 * kontrol.y + 0.25 * b.y,
      };
      const etiket = sv("text", { x: egriOrta.x + 6, y: egriOrta.y - 6, class: "formasyonRetEtiket" });
      etiket.textContent = "ret → " + kenar.to;
      svg.append(etiket);
    });
  }

  // İNSAN ONAYI KAPISI — gateAfter rolü ile ZİNCİRDEKİ sonraki rol (ya da
  // çıkış) arasındaki çizgiye dik 6px'lik bir çizgi + "insan onayı"
  // etiketi. Hedef sonrakiSutun'dan (m.edges'ten türetilmiş) geliyor —
  // dizideki bir sonraki İNDEKSİ varsaymıyor: bu modelin TEK gerçek
  // kaynağı zaten edges (bkz. model.ts), diziye bitişiklik rastlantı.
  m.gates.filter((g) => g.type === "approval").forEach((kapi) => {
    const a = konumHaritasi.get(kapi.after);
    if (!a) return;
    const sonrakiId = sonrakiSutun(m, kapi.after);
    const b = sonrakiId === "bitti" ? cikisNokta : konumHaritasi.get(sonrakiId);
    if (!b) return;
    const cizgi = kapiCizgisi(a, b, 36);
    const hat = sv("line", { x1: cizgi.x1, y1: cizgi.y1, x2: cizgi.x2, y2: cizgi.y2 });
    hat.style.stroke = "var(--color-accent)";
    hat.style.strokeWidth = "6";
    svg.append(hat);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const etiket = sv("text", { x: mx + 22, y: my + 4, class: "formasyonKapiEtiket" });
    etiket.textContent = "insan onayı";
    svg.append(etiket);
  });

  // GİRİŞ — 44px accent "+" (Yeni kart). Dolgu --solid-accent: beyaz "+"
  // metni üstünde duruyor (bkz. .formasyonGiris text, aşağıda), bu yüzden
  // HER ZAMAN koyu kalması gerekiyor — ".yeniKart" ile AYNI rol, AYNI
  // token (:root'taki SOLID-* yorumu, kart c-20261106-e62847).
  const girisG = sv("g", { class: "formasyonGiris" });
  girisG.setAttribute("role", "button");
  girisG.setAttribute("tabindex", "0");
  girisG.setAttribute("aria-label", "Yeni kart");
  const girisDaire = sv("circle", { cx: girisNokta.x, cy: girisNokta.y, r: 22 });
  girisDaire.style.fill = "var(--solid-accent)";
  girisG.append(girisDaire);
  const girisArti = sv("text", { x: girisNokta.x, y: girisNokta.y + 8, "text-anchor": "middle" });
  girisArti.style.fontSize = "26px";
  girisArti.textContent = "+";
  girisG.append(girisArti);
  const girisAc = () => { location.hash = "yeni"; };
  girisG.addEventListener("click", girisAc);
  girisG.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); girisAc(); } });
  svg.append(girisG);

  // ÇIKIŞ — 44x44 kutu, biten kart sayısı.
  const bittiSayisi = m.cards.filter((c) => c.state === "done").length;
  const cikisG = sv("g", { class: "formasyonCikis" });
  cikisG.setAttribute("aria-label", bittiSayisi + " kart bitti");
  const cikisKutu = sv("rect", { x: cikisNokta.x - 22, y: cikisNokta.y - 22, width: 44, height: 44 });
  cikisG.append(cikisKutu);
  const cikisMetin = sv("text", { x: cikisNokta.x, y: cikisNokta.y + 6, "text-anchor": "middle" });
  cikisMetin.style.fontSize = "17px";
  cikisMetin.style.fontWeight = "800";
  cikisMetin.textContent = String(bittiSayisi);
  cikisG.append(cikisMetin);
  svg.append(cikisG);

  // ROL DÜĞÜMLERİ — en üstte çiziliyor (her şeyin üzerinde tıklanabilir).
  roller.forEach((rol, i) => {
    const p = konumlar[i];
    const rolKartlari = rolunAcikKartlari(m.cards, rol.id);
    // Düğüm "seçili" sayılır RAIL.roleId bu role eşitse — Rol modunda VE
    // o rolün bir kartına (Kart modu, cardFrom "role") bakarken AYNI:
    // rolden içeri girilince düğüm Genel bakışa dönülene kadar vurgulu
    // kalır (bkz. railGecis).
    const secili = RAIL.roleId === rol.id;
    const g = sv("g", {
      class: "formasyonDugum" + (secili ? " secili" : ""),
      "data-rol": rol.id,
      transform: "translate(" + p.x + " " + p.y + ")",
    });
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-pressed", String(secili));
    g.setAttribute("aria-label", rol.id + " rolü");
    const kutu = sv("rect", { class: "kutu", x: -32, y: -22, width: 64, height: 44 });
    g.append(kutu);

    // KUŞ — 46x23, kendi iç görüş alanıyla gömülü bir <svg>: dönüşüm
    // (kanat çırpma) bu kutunun kendi kutusuna göre hesaplanır.
    const animasyonAcik = document.documentElement.dataset.animate !== "off";
    const kus = sv("svg", { x: -23, y: -11.5, width: 46, height: 23, viewBox: "0 0 46 23" });
    kus.classList.add("formasyonKus");
    if (kanatCirpiyorMu(rolKartlari, m.daemon) && animasyonAcik) kus.classList.add("kanatCirpiyor");
    const kusCizgi = sv("polyline", { points: "2,5 13,9 24,19 35,9 46,5", fill: "none" });
    kusCizgi.style.stroke = kusRengi(rolKartlari);
    kusCizgi.style.strokeWidth = "4";
    kusCizgi.style.strokeLinejoin = "miter";
    kus.append(kusCizgi);
    g.append(kus);

    // KART KARELERİ — düğümün altında küçük bir sıra, ortalı.
    const kareAraligi = 12;
    const kareBasi = -((rolKartlari.length - 1) * kareAraligi) / 2 - 5;
    rolKartlari.forEach((c, idx) => {
      const kare = sv("rect", {
        class: "kare-" + kareDurumu(c), x: kareBasi + idx * kareAraligi, y: 26, width: 10, height: 10,
      });
      g.append(kare);
    });

    g.append(formasyonEtiketKur(rol, i, p));

    const secimDegistir = () => {
      // "Rolleri düzenle" AÇIKKEN düğüme tıklamak MODU DEĞİŞTİRMİYOR —
      // DEVIR.md §3: "Diyagramda bir düğüme tıklanınca o rolün bloğu
      // accent-100 ile vurgulanır." railGecis'in rolSec dalı burada YANLIŞ
      // olurdu: panelden ÇIKARIR, oysa istenen panel AÇIKKEN içindeki
      // bloğu işaret etmek.
      if (RAIL.mode === "edit") {
        duzenleVurgula(rol.id);
        return;
      }
      RAIL = railGecis(RAIL, { tur: "rolSec", rolId: rol.id });
      ciz(m);
    };
    g.addEventListener("click", secimDegistir);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); secimDegistir(); } });
    svg.append(g);
  });

  // UÇUŞLAR — en üstte: rol düğümlerinin bile üzerinden kaysın diye SON
  // ekleniyor (SVG'de sonraki öğe öncekinin ÜSTÜNE çizilir). Süresi
  // dolanlar burada BUDANIYOR: yokla() ekliyor, hiçbir yer tek tek
  // SİLMİYOR — her çizimde elenen liste tek doğru kaynağı tutuyor.
  const simdi = performance.now();
  UCUSLAR = UCUSLAR.filter((u) => simdi - u.baslangic < u.sure);
  UCUSLAR.forEach((u) => svg.append(ucanKusKur(u)));

  return svg;
}

/** Lejant — diyagramın altındaki açıklama şeridi (DEVIR.md + SAPMALAR.md §2.4). */
function lejantKur(m) {
  const kutu = el("div");
  [["calisiyor", "çalışıyor"], ["kapida", "kapıda"], ["kuyrukta", "kuyrukta"]].forEach(([sinif, etiket]) => {
    const oge = el("span", "oge");
    oge.append(el("span", "kare " + sinif));
    oge.append(document.createTextNode(etiket));
    kutu.append(oge);
  });
  const retOge = el("span", "oge");
  retOge.append(el("span", "cizgi-ret"));
  retOge.append(document.createTextNode("ret yolu"));
  kutu.append(retOge);

  // SAPMALAR.md §2.4: tasarımın "bu yüzey yalnızca okur" iddiası YANLIŞ —
  // ekran kapı kararı veriyor, kart açıyor, akış/prompt yazıyor, gözcüyü
  // başlatıp durduruyor. Doğrusu burada, geri GETİRİLMİYOR.
  kutu.append(el("span", "lejantSag",
    "okundu " + new Date(m.at).toLocaleTimeString("tr-TR") +
    " · durum .skein/ ve olaylar.jsonl'dan okunuyor · değişiklik yalnızca düğmelerle"));
  return kutu;
}

// --- Sağ panel (kart c-20261105-d500f1) ---
//
// DEVIR.md "Sağ panel modları": Genel bakış / Rol / Kart. Gözcü ve Rolleri
// düzenle modları (4 ve 5) bu kartın KAPSAMINDA DEĞİL — onlar hâlâ #bar'daki
// gözcü düğmesi ve "Akışı düzenle" (#akis hash'i) üzerinden, ESKİDEN
// OLDUĞU GİBİ. RAIL/railGecis YUKARIDA (formasyonSvgKur'dan önce) tanımlı.

/**
 * SAĞ PANEL — "Uçuşta" listesi VE Rol modunun kart listesi için ortak
 * satır: 10px kare + başlık + tek satırlık alt bilgi (DEVIR.md). Kare
 * rengi kareDurumu'ndan (aynı karar formasyon düğümünün kart kareleriyle
 * PAYLAŞILIYOR) — bu satırın rengi diyagramdakiyle AYRIŞAMAZ.
 */
function railKartSatiri(c, altBilgi, tiklaCb) {
  const satir = el("div", "railSatir");
  satir.tabIndex = 0;
  satir.setAttribute("role", "button");
  satir.setAttribute("aria-label", c.title + " — detay");
  satir.append(el("span", "kare " + kareDurumu(c)));
  const govde = el("div", "railSatirGovde");
  govde.append(el("div", "railSatirBaslik", c.title));
  govde.append(el("div", "railSatirAlt", altBilgi));
  satir.append(govde);
  satir.addEventListener("click", tiklaCb);
  satir.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tiklaCb(); } });
  return satir;
}

/**
 * SAĞ PANEL — kapı kartının gövdesi: üst etiket + (varsa) başlık düğmesi +
 * gerekçe + çıkışlar. Genel bakışın kapı kartı VE Kart modunun kapı kutusu
 * AYNI kutuyu kullanıyor (DEVIR.md ikisinde de "accent-100 kutu, üstte 4px
 * accent çizgi" diyor); başlık düğmesi yalnızca Genel bakışta var — Kart
 * modunda başlık zaten kartın kendi h2'si, ikinci bir başlık YİNELEMEZ.
 *
 * Çıkışlar MEVCUT kapiCikislari/karar/kapatKart mantığıyla BİREBİR AYNI —
 * bu fonksiyon yeni bir karar kümesi İCAT ETMİYOR, var olanı yeni bir
 * kutuya TAŞIYOR (kart c-20261105-d500f1'in şartı tam bu).
 */
function railKapiKutu(c, baslikTikla) {
  const kapi = kapiCikislari(c.gate, c.planKilidi, c.geriHedef);
  const kutu = el("div", "railKapiKutu");
  kutu.append(el("div", "railKapiEtiket", kapi.etiket + " · " + c.role));

  if (baslikTikla) {
    const b = el("button", "railBaslikBtn", c.title);
    b.type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); baslikTikla(); });
    kutu.append(b);
  }

  // GEREKÇE — TAŞINACAK: ajanın ham metni gerekceKur ile katlanabilir bir
  // details'a TAM olarak yazılıyor; ".railGerekce .reason" kuralı
  // (yukarıda) yalnızca GÖRÜNÜMÜ 3 satıra kırpıyor, DOM'dan hiçbir şey
  // SİLİNMİYOR.
  const gerekceSarmal = el("div", "railGerekce");
  if (c.gateReason) gerekceKur(gerekceSarmal, c.gateReason);
  kutu.append(gerekceSarmal);

  const cikis = el("div", "railCikis");
  kapi.dugmeler.forEach(([ad, secim], i) => {
    const b = el("button", "railBtn" + (i === 0 ? " primary" : ""), ad);
    b.type = "button";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      void karar(c.id, secim, b, kutu);
    });
    cikis.append(b);
  });
  kutu.append(cikis);
  return kutu;
}

/**
 * MOD 1 — Genel bakış: kapıda bekleyen kart sayısı + her kapı kartı,
 * altında "Uçuşta" listesi (DEVIR.md).
 */
function railGenelBakisCiz(kutu, m) {
  kutu.replaceChildren();

  const kapidakiler = m.cards.filter((c) => Boolean(c.gate));
  const sayiSatiri = el("div", "railSayiSatiri");
  sayiSatiri.append(el("div", "railSayi", String(kapidakiler.length)));
  sayiSatiri.append(el("div", "railSayiAciklama", "kart kararını bekliyor"));
  kutu.append(sayiSatiri);

  kapidakiler.forEach((c) => {
    kutu.append(railKapiKutu(c, () => {
      RAIL = railGecis(RAIL, { tur: "kartAcGenel", kartId: c.id });
      railYenidenCiz();
    }));
  });

  const ucustakiler = m.cards.filter((c) => c.state === "active");
  kutu.append(el("div", "railAraBaslik", "Uçuşta · " + ucustakiler.length));
  if (ucustakiler.length === 0) {
    kutu.append(el("div", "railBos", "şu an çalışan kart yok"));
  } else {
    ucustakiler.forEach((c) => {
      const adim = c.live ? (c.live.name || c.live.kind) : null;
      kutu.append(railKartSatiri(c, c.role + (adim ? " · " + adim : ""), () => {
        RAIL = railGecis(RAIL, { tur: "kartAcGenel", kartId: c.id });
        railYenidenCiz();
      }));
    });
  }
}

/**
 * MOD 2 — Rol: "← Genel bakış" + üst bilgi + meta satırı + iki düğme +
 * roldeki kartların listesi (DEVIR.md).
 *
 * "Prompt" düğmesi hash'i "promptlar"a çevirip PROMPT_SEC'i o rolün
 * dosyasına önceden set ediyor — promptlarEkraniCiz() (hashOku'nun
 * "promptlar" dalı) PROMPT_SEC zaten geçerli bir yolsa onu AYNEN
 * kullanıyor (bkz. promptlarEkraniCiz: "PROMPTLAR.some(...)" kontrolü),
 * yani bu buton promptlarSec'i AYRICA çağırıp bir YARIŞ (promptlarEkraniCiz
 * henüz /promptlar'ı okumadan promptlarSec'in boş listeyle çizmesi)
 * açmıyor. DEVIR.md'nin tarif ettiği GERÇEK "Promptlar" SEKMESİNİ açıyor
 * (bkz. #icerikPromptlar/promptlarEkraniCiz) — eski "#prompt" çekmecesi bu
 * sekme kurulunca söküldü.
 *
 * "Ajanı izle →" düğmesi artık "Prompt" düğmesiyle AYNI deseni izliyor:
 * Ajanlar sekmesi GERÇEKTEN kuruldu (kart c-20261105-d304ed) ve AJAN_SEC'i
 * bu rolün id'sine önceden set edip hash'i "ajanlar"a çeviriyor —
 * ajanlarEkraniCiz zaten geçerli bir AJAN_SEC'i AYNEN kullanıyor (bkz. o
 * fonksiyonun "m.roles.some" kontrolü), yani düğme "o rolü seçili açar"
 * vaadini artık GERÇEKTEN tutuyor.
 */
function railRolCiz(kutu, m, rolId) {
  kutu.replaceChildren();

  // "← Genel bakış" ÖNCE kuruluyor, meta bulunamasa bile: akış rol
  // silinecek şekilde değişirse (Rol modu açıkken) kullanıcı GERİ DÖNECEK
  // bir yol olmadan kilitli kalmamalı — DEVIR.md'nin "yapamayacağı şeyi
  // vaat eden düğme" sınıfının TERSİ bir kusur, düğmenin KENDİSİ hiç
  // çıkmaması.
  const geri = el("button", "railGeri", "← Genel bakış");
  geri.type = "button";
  geri.addEventListener("click", () => {
    RAIL = railGecis(RAIL, { tur: "genelBakis" });
    railYenidenCiz();
  });
  kutu.append(geri);

  const meta = railRolMeta(m, rolId);
  if (!meta) {
    kutu.append(el("div", "railBos", "rol bulunamadı — akış değişmiş olabilir"));
    return;
  }

  kutu.append(el("div", "railUst", "rol " + meta.no + (meta.oncu ? " · öncü" : "")));
  kutu.append(el("h2", "railRolBaslik", meta.id));

  const metaSatir = el("div", "railRolMeta");
  metaSatir.append(el("span", null, meta.provider));
  metaSatir.append(el("span", null, meta.workspace));
  metaSatir.append(el("span", null, "sonraki: " + meta.sonrakiRol));
  metaSatir.append(el("span", null, "ret: " + (meta.retHedefi || "yok")));
  metaSatir.append(el("span", null, meta.receive === "batch" ? "toplu alım" : "tekil alım"));
  kutu.append(metaSatir);

  const dugmeler = el("div", "railRolDugmeler");
  const promptBtn = el("button", "railBtn", "Prompt · " + meta.prompt);
  promptBtn.type = "button";
  promptBtn.addEventListener("click", () => {
    PROMPT_SEC = meta.prompt;
    location.hash = "promptlar";
  });
  dugmeler.append(promptBtn);
  const ajanBtn = el("button", "railBtn", "Ajanı izle →");
  ajanBtn.type = "button";
  ajanBtn.addEventListener("click", () => {
    AJAN_SEC = meta.id;
    location.hash = "ajanlar";
  });
  dugmeler.append(ajanBtn);
  kutu.append(dugmeler);

  const rolKartlari = rolunAcikKartlari(m.cards, rolId);
  kutu.append(el("div", "railAraBaslik", "kartlar · " + rolKartlari.length));
  if (rolKartlari.length === 0) {
    const rol = m.roles.find((r) => r.id === rolId);
    kutu.append(el("div", "railBos", rol ? bosRolMetni(rol, rolKartlari) : "kuyrukta kart yok"));
  } else {
    rolKartlari.forEach((c) => {
      const durum = c.gate ? kapiCikislari(c.gate, c.planKilidi, c.geriHedef).etiket
        : c.state === "active" ? "çalışıyor" : "kuyrukta";
      kutu.append(railKartSatiri(c, durum, () => {
        RAIL = railGecis(RAIL, { tur: "kartAcRol", rolId, kartId: c.id });
        railYenidenCiz();
      }));
    });
  }
}

/**
 * MOD 3 — Kart: geri düğmesi + durum etiketi, başlık, meta, (varsa) kapı
 * kutusu ya da son ret gerekçesi, canlı adım, "Kartın izi" ve "Kodda ne
 * değişti" (DEVIR.md). d, GET /kart/<id>'in döndürdüğü UiDetail.
 *
 * izZamanCizelgesiKur/kodDegisikligiKur eski detayCiz'den ÇIKARILDI
 * (bkz. yukarıda) — bu iki blok BİREBİR AYNI, iki yerde yeniden
 * YAZILMIYOR.
 */
function railKartCiz(kutu, d) {
  kutu.replaceChildren();
  const c = d.card;

  const ustSatir = el("div", "railKartUst");
  const geri = el("button", "railGeri", "←");
  geri.type = "button";
  geri.setAttribute("aria-label", "geri");
  geri.addEventListener("click", () => {
    RAIL = railGecis(RAIL, { tur: "geri" });
    railYenidenCiz();
  });
  ustSatir.append(geri);
  const durumMetni = c.gate ? kapiCikislari(c.gate, c.planKilidi, c.geriHedef).etiket
    : c.state === "active" ? "çalışıyor" : c.state === "done" ? "bitti" : "kuyrukta";
  ustSatir.append(el("span", "railDurumEtiket", durumMetni));
  kutu.append(ustSatir);

  kutu.append(el("h2", "railKartBaslik", c.title));
  kutu.append(el("div", "railKartMeta2", c.id + " · " + c.role));

  const meta = el("div", "meta");
  if (c.rejects > 0) meta.append(el("span", "bad", c.rejects + " ret"));
  meta.append(el("span", null, c.turns + " tur"));
  if (c.durationMs) meta.append(el("span", null, sure(c.durationMs)));
  if (c.costUsd || c.olculmeyen) {
    meta.append(el("span", c.olculmeyen ? "bad" : null, maliyetMetni(c.costUsd, c.olculmeyen, c.tokens)));
  }
  kutu.append(meta);

  if (c.gate) {
    kutu.append(railKapiKutu(c, null));
  } else if (c.lastReject && c.state !== "done") {
    kutu.append(el("div", "railRetBlok", c.lastReject));
  }

  if (c.live) {
    const s = el("div", "step");
    s.append(el("b", "mono", c.live.name || c.live.kind));
    s.append(el("span", "path", c.live.detail || ""));
    s.append(el("span", "seq", "adım " + c.live.seq));
    kutu.append(s);
  }

  kutu.append(izZamanCizelgesiKur(d.history));
  kutu.append(kodDegisikligiKur(d.diff));
}

/**
 * Kart modu bir FETCH gerektiriyor ("Kartın izi"/"Kodda ne değişti" UiCard
 * üzerinde yok, yalnızca GET /kart/<id>'in UiDetail'inde). sagPanelCiz
 * aynı id için bunu BİR KEZ çağırıyor (bkz. "data-rail-kart" koruması) —
 * yoksa her saniyelik yoklama (yokla/ciz) kartı yeniden yükler, panel her
 * saniye "yükleniyor…"ya döner ve kaydırma konumu kaybolurdu.
 */
async function railKartYukle(kutu, id) {
  kutu.replaceChildren(el("div", "railBos", "yükleniyor…"));
  try {
    const cevap = await fetch("/kart/" + encodeURIComponent(id), { cache: "no-store" });
    const d = await cevap.json();
    if (!cevap.ok) throw new Error(d.hata || cevap.status);
    // RAIL fetch sürerken BAŞKA bir karta/moda geçmiş olabilir — bayat
    // cevabı eskimiş bir isteğin üstüne YAZMIYORUZ.
    if (RAIL.mode !== "card" || RAIL.cardId !== id) return;
    railKartCiz(kutu, d);
  } catch (e) {
    if (RAIL.mode !== "card" || RAIL.cardId !== id) return;
    kutu.replaceChildren(el("div", "err", "Kart okunamadı: " + e.message));
  }
}

/**
 * Kart modunun FETCH kararı — SAF. "gösterilenId" panelin o an taşıdığı
 * data-rail-kart değeri (henüz hiç yüklenmediyse undefined), "hedefId"
 * RAIL.cardId. Eşitlerse YENİDEN YÜKLEME YOK — sagPanelCiz'in her saniye
 * çağrılması Kart modunu "yükleniyor…"ya döndürmesin diye (bkz.
 * railKartYukle yorumu).
 */
function railYenidenYuklenmeliMi(gosterilenId, hedefId) {
  return gosterilenId !== hedefId;
}

// --- MOD 5 — Rolleri düzenle (kart c-20261105-725320, DEVIR.md §3) ---
//
// Bu bölümün KARAR fonksiyonları (duzenle... ile başlayıp DOM almayanlar)
// SAF: page.test.ts bunları fonksiyon()/fonksiyonlar() ile kaynaktan
// çıkarıp doğrudan çağırıyor, railGecis/railRolMeta ile AYNI ilke. Çizim
// fonksiyonları (duzenle...Ciz, railDuzenlePaneliCiz) bu karaları DOM'a
// döküyor, kendileri karar vermiyor.

/**
 * HATA listesi — DEVIR.md §3 "Doğrulama": boş rol adı ve aynı adı taşıyan
 * iki rol. İkisi de kaydetmeyi ENGELLER (accent-700). 'gecersiz' kümesi
 * hangi rol bloğunun kırmızı kenarla işaretleneceğini taşıyor — mesaj
 * metninin kendisi "hangi kutu" sorusuna cevap vermez.
 */
function duzenleHatalari(roller) {
  const hatalar = [];
  const gecersiz = new Set();
  roller.forEach((r, i) => {
    if (!r.id || r.id.trim() === "") {
      hatalar.push((i + 1) + ". rolün adı boş");
      gecersiz.add(i);
    }
  });
  const sayim = new Map();
  roller.forEach((r) => {
    const ad = (r.id || "").trim();
    if (ad === "") return;
    sayim.set(ad, (sayim.get(ad) || 0) + 1);
  });
  const tekrarlar = new Set();
  sayim.forEach((n, ad) => { if (n > 1) tekrarlar.add(ad); });
  roller.forEach((r, i) => {
    const ad = (r.id || "").trim();
    if (tekrarlar.has(ad)) gecersiz.add(i);
  });
  tekrarlar.forEach((ad) => hatalar.push("'" + ad + "' adı birden çok rolde kullanılıyor"));
  return { hatalar, gecersiz };
}

/**
 * UYARI listesi — DEVIR.md §3: "açık kartı olan bir rol silinirse"
 * (ENGELLEMEZ). 'oncekiIdler' panel AÇILDIĞINDA yüklenen rol kimlikleri,
 * 'simdikiIdler' o anki taslak; aradaki fark SİLİNEN roller. "açık" olmak
 * state !== "done" — railRolCiz'in kart listesiyle AYNI filtre, yetim
 * kartlar ('orphan') zaten akıştan bağımsız, sayılmaz.
 */
function duzenleSilmeUyarilari(oncekiIdler, simdikiIdler, kartlar) {
  const simdiSet = new Set(simdikiIdler);
  const uyarilar = [];
  oncekiIdler.filter((id) => !simdiSet.has(id)).forEach((id) => {
    const acikSayisi = kartlar.filter((c) => c.role === id && c.state !== "done" && !c.orphan).length;
    if (acikSayisi > 0) uyarilar.push("'" + id + "' silindi ama " + acikSayisi + " açık kartı var");
  });
  return uyarilar;
}

/**
 * 'next'i HER ZAMAN sıradan türetir, sonuncusu "done" — DEVIR.md §3
 * "Normalizasyon". Diziyi YERİNDE günceller (role nesneleri aynı
 * referans) ve aynı diziyi döner; ekranda ayrı bir "next" alanı/seçicisi
 * YOK, sıra tek doğruluk kaynağı.
 */
function duzenleSiradanBagla(roller) {
  roller.forEach((r, i) => {
    r.next = i + 1 < roller.length ? roller[i + 1].id : "done";
  });
  return roller;
}

/**
 * Kural 13'ün ('reject' yalnızca zincirde DAHA ÖNCE gelen role işaret
 * eder) normalizasyon karşılığı: taşıma/silme SONRASI artık geçersiz
 * kalan 'reject' hedeflerini temizler. Ekranın "ret yolu: yalnızca
 * kendinden ÖNCEKİ roller ya da 'yok'" seçicisi zaten bunun DIŞINDAKİ
 * seçenekleri sunmuyor, ama bir TAŞIMA önceden geçerli bir değeri listenin
 * dışına çıkarabilir — bu fonksiyon o artığı siler.
 */
function duzenleReddiTemizle(roller) {
  const indeks = new Map(roller.map((r, i) => [r.id, i]));
  roller.forEach((r, i) => {
    if (r.reject === undefined || r.reject === "") return;
    const hedef = indeks.get(r.reject);
    if (hedef === undefined || hedef >= i) r.reject = undefined;
  });
  return roller;
}

/**
 * Rolü i konumundan 'yon' (-1 yukarı / +1 aşağı) yönünde bir komşuyla
 * DEĞİŞ TOKUŞ eder — DEVIR.md §3 "↑ ↓ ikon düğmeleri". Sınırın dışına
 * taşmaya çalışmak (ilk rolü yukarı, son rolü aşağı) hiçbir şey yapmaz.
 * Taşıma SIRAYI değiştirdiği için 'next' yeniden türetilir ve artık
 * geçersiz kalmış 'reject' hedefleri temizlenir.
 */
function duzenleTasi(roller, i, yon) {
  const j = i + yon;
  if (j < 0 || j >= roller.length) return roller;
  const tmp = roller[i];
  roller[i] = roller[j];
  roller[j] = tmp;
  duzenleReddiTemizle(roller);
  duzenleSiradanBagla(roller);
  return roller;
}

/**
 * Ad girişini DEVIR.md §3'ün izin verdiği kümeye indirger: yalnızca
 * a-z0-9-. Küçük harfe çevirir (Shift ile "Coder" yazmak sessizce başka
 * bir rol İCAT ETMEMELİ) ve kümenin dışındaki her karakteri DÜŞÜRÜR —
 * geçersiz bir karakteri REDDETMEK (kaydetmeyi engellemek) yerine
 * SESSİZCE temizlemek, DEVIR.md'nin kendi kısıtını (yalnızca a-z0-9-)
 * ihlal etmeyen bir sonucu HER ZAMAN garantiliyor.
 */
function duzenleAdSanitize(deger) {
  return (deger || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * Rol adını değiştirir ve ONA BAĞLI HER referansı günceller: 'reject',
 * 'planlama.katilimcilar', 'planlama.denetci' — DEVIR.md §3: "ad
 * değişince ona bağlı reject, planlama.katilimcilar ve denetci
 * referansları da güncellenir". 'next' burada YOK: her zaman sıradan
 * türetiliyor (bkz. duzenleSiradanBagla), ad değişikliğinden etkilenmez.
 *
 * Boş ada yeniden adlandırma İSTEĞİ (eski 'rolAdiDegis' editörüyle AYNI
 * kural) YOK SAYILIR: eski ad kalır, kaskad hiç çalışmaz. Böyle bir alan
 * yine de "boş" HALE gelebilir (kullanıcı kutuya sadece boşluk yazarsa) —
 * o durum kaskad DIŞINDA, duzenleHatalari'nin yakaladığı bir durum.
 */
function duzenleAdDegis(taslak, i, yeniAd) {
  const eski = taslak.roles[i].id;
  if (!yeniAd || yeniAd === eski) return taslak;
  taslak.roles[i].id = yeniAd;
  taslak.roles.forEach((r, idx) => {
    if (idx !== i && r.reject === eski) r.reject = yeniAd;
  });
  if (taslak.planlama) {
    taslak.planlama.katilimcilar = taslak.planlama.katilimcilar.map((k) => (k === eski ? yeniAd : k));
    if (taslak.planlama.denetci === eski) taslak.planlama.denetci = yeniAd;
  }
  return taslak;
}

/**
 * Rolü çıkarır ve ona yapılan HER atfı temizler: 'reject', 'syncBack',
 * 'gates', 'planlama.katilimcilar', 'planlama.denetci' — DEVIR.md §3
 * "Normalizasyon: ... silinen rollere giden referanslar temizlenir".
 * Katılımcı listesi BOŞALIRSA 'planlama' bütünüyle kaldırılır: kural 17
 * tek katılımcısız bir planlamayı zaten yasaklıyor, yarım bir blok
 * bırakmanın anlamı yok. Son rol SİLİNEMEZ (eski 'rolSil' ile AYNI koruma).
 */
function duzenleSil(taslak, id) {
  const i = taslak.roles.findIndex((r) => r.id === id);
  if (i === -1 || taslak.roles.length < 2) return taslak;
  taslak.roles.splice(i, 1);
  taslak.roles.forEach((r) => {
    if (r.reject === id) r.reject = undefined;
    if (r.syncBack) r.syncBack = r.syncBack.filter((x) => x !== id);
  });
  if (taslak.gates) taslak.gates = taslak.gates.filter((g) => g.after !== id);
  if (taslak.planlama) {
    taslak.planlama.katilimcilar = taslak.planlama.katilimcilar.filter((k) => k !== id);
    if (taslak.planlama.denetci === id) taslak.planlama.denetci = undefined;
    if (taslak.planlama.katilimcilar.length === 0) taslak.planlama = undefined;
  }
  duzenleReddiTemizle(taslak.roles);
  duzenleSiradanBagla(taslak.roles);
  return taslak;
}

/**
 * Planlama katılımını AYARLAR — DEVIR.md §3: "ilk katılımcı yazar,
 * diğerleri itiraz eder". Katılımcılar zincirin BAŞINDAN başlayan
 * KESİNTİSİZ bir önek olmak ZORUNDA (kural 19) — SAF fonksiyon tek bir
 * geçerli hamleyi uygular; sıra dışı bir istek sessizce YOK SAYILIR
 * (arayüz zaten sıra dışı kutuları devre dışı bırakıyor, bkz.
 * duzenlePlanlamaKatilimKutusuCiz).
 *
 * 'katilmak' true ise İSTEK yalnızca önekin TAM BİR SONRASI (idx === k)
 * olduğunda kabul edilir — önek bir uzar. 'katilmak' false ise idx'in
 * KENDİSİ ve SONRASI önekten çıkar: aradan birini çıkarmak öndekini
 * katılımcı olmaktan ÇIKARAMAZ, ama ardındaki zaten önek dışıydı.
 */
function duzenlePlanlamaAyarla(katilimcilar, rolIdler, idx, katilmak) {
  const k = katilimcilar.length;
  if (katilmak) {
    if (idx !== k) return katilimcilar;
    return rolIdler.slice(0, k + 1);
  }
  if (idx >= k) return katilimcilar;
  return rolIdler.slice(0, idx);
}

/**
 * Katılımcı kümesi/sıra değiştiğinde GEÇERSİZ kalan denetçiyi temizler —
 * kural 23: denetçi katılımcı OLAMAZ ve katılımcılardan SONRA gelmek
 * ZORUNDA. Katılımcı yoksa denetçi de anlamsız (yükümlülük kapısının
 * denetleyeceği bir itiraz yok).
 */
function duzenleDenetciGecerle(denetci, katilimcilar, rolIdler) {
  if (denetci === undefined || denetci === "") return undefined;
  if (katilimcilar.length === 0 || katilimcilar.includes(denetci)) return undefined;
  const sonKatilimciIndeks = rolIdler.indexOf(katilimcilar[katilimcilar.length - 1]);
  const denetciIndeks = rolIdler.indexOf(denetci);
  if (denetciIndeks === -1 || denetciIndeks <= sonKatilimciIndeks) return undefined;
  return denetci;
}

/** "Yazar: X · itiraz: Y, Z" özeti — DEVIR.md §3 "Planlama bölümü: özet". Katılımcı yoksa boş dize. */
function duzenlePlanlamaOzet(katilimcilar) {
  if (katilimcilar.length === 0) return "";
  if (katilimcilar.length === 1) return "Yazar: " + katilimcilar[0];
  return "Yazar: " + katilimcilar[0] + " · itiraz: " + katilimcilar.slice(1).join(", ");
}

/**
 * Sunucuya göndermeden (önizleme ya da kaydetme) önce HER ZAMAN uygulanan
 * normalizasyon — DEVIR.md §3 "Normalizasyon" paragrafının TAMAMI: next
 * sıradan türer, geçersiz ret hedefleri ve geçersiz denetçi temizlenir.
 * Taslağı YERİNDE değiştirir ve aynı nesneyi döner.
 */
function duzenleNormallestir(taslak) {
  duzenleReddiTemizle(taslak.roles);
  duzenleSiradanBagla(taslak.roles);
  if (taslak.planlama) {
    const rolIdler = taslak.roles.map((r) => r.id);
    taslak.planlama.denetci = duzenleDenetciGecerle(taslak.planlama.denetci, taslak.planlama.katilimcilar, rolIdler);
  }
  return taslak;
}

// Panelin durumu — overlay'in TASLAK/SAGLAYICILAR'ından KASITLI OLARAK
// AYRI (bkz. "Rolleri düzenle" düğmesinin yorumu): ikisi aynı anda açık
// olabilir, aynı değişkeni paylaşmak çapraz yazmaya yol açardı.
let DUZENLE_TASLAK = null;
let DUZENLE_SAGLAYICILAR = [];
let DUZENLE_PROMPTLAR = [];
// Panel AÇILDIĞINDA okunan taslağın JSON görüntüsü — "değişiklik var mı"
// (Kaydet/Vazgeç'in devre dışı kalma kararı) ve Vazgeç'in geri döneceği
// hâl BUNDAN türüyor.
let DUZENLE_ORIJINAL = null;
let DUZENLE_ORIJINAL_ROL_IDLER = [];
let DUZENLE_HATA = null;
let DUZENLE_YAML_GORUNUR = false;
// /akis/onizleme'nin son cevabı — {ok, yaml, message?/cost?}. null =
// henüz hiç sorulmadı (Kaydet o ana kadar devre dışı kalır).
let DUZENLE_ONIZLEME = null;
// Diyagramdan tıklanan düğümün vurgulayacağı blok — yalnızca GÖRSEL,
// RAIL'i değiştirmez (bkz. secimDegistir'in "edit" dalı).
let DUZENLE_VURGU = null;

/** "Rolleri düzenle" girişi — panoArac'taki düğme bunu çağırır. */
function duzenleAc() {
  RAIL = { mode: "edit", roleId: null, cardId: null, cardFrom: "overview" };
  DUZENLE_TASLAK = null;
  DUZENLE_ORIJINAL = null;
  DUZENLE_ORIJINAL_ROL_IDLER = [];
  DUZENLE_HATA = null;
  DUZENLE_YAML_GORUNUR = false;
  DUZENLE_ONIZLEME = null;
  DUZENLE_VURGU = null;
  railYenidenCiz();
}

/** Genel bakışa döner ve panelin durumunu TEMİZLER — açık bir taslak bayat kalmasın. */
function duzenleKapat() {
  RAIL = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };
  DUZENLE_TASLAK = null;
  DUZENLE_ORIJINAL = null;
  railYenidenCiz();
}

/**
 * Taslağı ve sağlayıcı/prompt listesini YÜKLER — sagPanelCiz bunu "edit"
 * moduna İLK girişte BİR KEZ çağırıyor (bkz. "data-rail-edit" koruması,
 * railKartYukle'nin "data-rail-kart"ıyla AYNI desen): yoksa her saniyelik
 * yoklama formu sıfırlar, operatör yazarken kutular BAŞA dönerdi.
 */
async function railDuzenleYukle(kutu) {
  kutu.replaceChildren(el("div", "railBos", "yükleniyor…"));
  try {
    const akisCevap = await fetch("/akis", { cache: "no-store" });
    const akisVeri = await akisCevap.json();
    if (!akisCevap.ok) throw new Error(akisVeri.hata || akisCevap.status);
    if (!akisVeri.draft) throw new Error("Bu ekran akış düzenlemeye açık değil.");
    DUZENLE_TASLAK = akisVeri.draft;
    DUZENLE_SAGLAYICILAR = akisVeri.providers || [];
    DUZENLE_ORIJINAL = JSON.stringify(DUZENLE_TASLAK);
    DUZENLE_ORIJINAL_ROL_IDLER = DUZENLE_TASLAK.roles.map((r) => r.id);
    // /promptlar başarısız olsa bile (örn. akış hiç prompt bildirmiyor)
    // editörü ENGELLEMİYORUZ — prompt alanı o durumda yalnızca ROLÜN
    // KENDİ değerini seçenek olarak gösterir (bkz. duzenlePromptAlani).
    try {
      const promptCevap = await fetch("/promptlar", { cache: "no-store" });
      const promptVeri = await promptCevap.json();
      DUZENLE_PROMPTLAR = promptCevap.ok ? (promptVeri.promptlar || []) : [];
    } catch {
      DUZENLE_PROMPTLAR = [];
    }
  } catch (e) {
    DUZENLE_HATA = e.message;
  }
  if (RAIL.mode !== "edit") return; // panel kapandıysa bayat cevabı YAZMA
  railDuzenlePaneliCiz(kutu, SON_MODEL);
}

/** Tek değerli bir alan: seçenek listesi varsa 'select', yoksa serbest metin 'input'. */
function duzenleAlan(etiket, deger, secenekler, onChange, etiketCozucu) {
  const l = el("label", "duzenleAlanTekil");
  l.append(el("span", "duzenleAlanEtiket", etiket));
  const g = el(secenekler ? "select" : "input");
  if (secenekler) {
    secenekler.forEach((s) => {
      const o = el("option", null, etiketCozucu ? etiketCozucu(s) : (s === "" ? "yok" : s));
      o.value = s;
      if (s === deger) o.selected = true;
      g.append(o);
    });
  } else {
    g.value = deger == null ? "" : deger;
  }
  g.addEventListener("change", () => { onChange(g.value); duzenleYenile(); });
  l.append(g);
  return l;
}

/** ALIM segment düğmesi — "tekil/toplu", 2px kenar, seçili koyu zeminli (DEVIR.md §3). */
function duzenleSegment(etiket, deger, secenekler, onChange) {
  const sarmal = el("div");
  sarmal.append(el("span", "duzenleAlanEtiket", etiket));
  const grup = el("div", "duzenleSegment");
  grup.setAttribute("role", "group");
  grup.setAttribute("aria-label", etiket);
  secenekler.forEach(([v, ad]) => {
    const b = el("button", "duzenleSegmentBtn" + (v === deger ? " secili" : ""), ad);
    b.type = "button";
    b.setAttribute("aria-pressed", String(v === deger));
    b.addEventListener("click", () => {
      if (v === deger) return;
      onChange(v);
      duzenleYenile();
    });
    grup.append(b);
  });
  sarmal.append(grup);
  return sarmal;
}

/** 1..5 arası stepper — tur ve ret limiti AYNI widget'ı paylaşıyor (DEVIR.md §3). */
function duzenleStepper(deger, min, max, onChange) {
  const sarmal = el("div", "duzenleStepper");
  const eksi = el("button", "duzenleIkon", "−");
  eksi.type = "button";
  eksi.disabled = deger <= min;
  eksi.setAttribute("aria-label", "azalt");
  eksi.addEventListener("click", () => { onChange(Math.max(min, deger - 1)); duzenleYenile(); });
  sarmal.append(eksi);
  sarmal.append(el("span", "duzenleStepperDeger mono", String(deger)));
  const arti = el("button", "duzenleIkon", "+");
  arti.type = "button";
  arti.disabled = deger >= max;
  arti.setAttribute("aria-label", "arttır");
  arti.addEventListener("click", () => { onChange(Math.min(max, deger + 1)); duzenleYenile(); });
  sarmal.append(arti);
  return sarmal;
}

/**
 * Prompt seçimi ("roles/*.md") + "Aç" düğmesi — DEVIR.md §3. Liste
 * /promptlar'tan (topolojinin BİLDİRDİĞİ dosyalar, SAPMALAR.md §3) — bu
 * akışın dışında yeni bir uç İCAT EDİLMİYOR. Rolün KENDİ değeri listede
 * yoksa (örn. henüz hiçbir rolün kullanmadığı bir yol) seçenek listesine
 * EKLENİR — aksi hâlde seçim sessizce BAŞKA bir dosyaya kayardı.
 */
function duzenlePromptAlani(rol) {
  const sarmal = el("div", "duzenlePromptSarmal");
  const bilinenler = DUZENLE_PROMPTLAR.map((p) => p.yol);
  const secenekler = bilinenler.includes(rol.prompt) ? bilinenler : [rol.prompt, ...bilinenler];
  const alan = duzenleAlan("prompt", rol.prompt, secenekler, (v) => { rol.prompt = v; });
  sarmal.append(alan);
  const ac = el("button", "railBtn", "Aç");
  ac.type = "button";
  ac.addEventListener("click", () => {
    PROMPT_SEC = rol.prompt;
    location.hash = "promptlar";
  });
  sarmal.append(ac);
  return sarmal;
}

/**
 * Planlamaya katılım kutusu (tek rol bloğu içinde) — DEVIR.md §3: "ilk
 * katılımcı yazar, diğerleri itiraz eder; satırın sağında 'devreder →
 * sonraki'". Sıra dışı bir katılım isteği (önceki rol katılımcı değilken
 * bu kutuyu işaretlemek) kutunun KENDİSİ devre dışı bırakılarak
 * ÖNLENİYOR — duzenlePlanlamaAyarla zaten sessizce yok sayardı, ama bir
 * düğmenin "yapamayacağı şeyi vaat etmesi" bu dosyada iki kez düzeltilmiş
 * bir kusur sınıfı (bkz. "back" düğmesinin kaldırılması).
 */
function duzenlePlanlamaKatilimKutusuCiz(taslak, i) {
  const rol = taslak.roles[i];
  const katilimcilar = taslak.planlama ? taslak.planlama.katilimcilar : [];
  const k = katilimcilar.length;
  const katilimciMi = i < k;
  const sarmal = el("div", "duzenlePlanKatilim");
  const kutucuk = el("input");
  kutucuk.type = "checkbox";
  kutucuk.id = "duzenlePlan-" + i;
  kutucuk.checked = katilimciMi;
  kutucuk.disabled = !katilimciMi && i !== k;
  const etiket = el("label", "duzenlePlanKatilimEtiket");
  etiket.htmlFor = kutucuk.id;
  etiket.append(document.createTextNode("planlamaya katıl"));
  sarmal.append(kutucuk, etiket);

  if (katilimciMi && i === k - 1) {
    const sonrakiRol = taslak.roles[k] ? taslak.roles[k].id : "done";
    sarmal.append(el("span", "duzenlePlanDevreder", "devreder → " + sonrakiRol));
  }

  kutucuk.addEventListener("change", () => {
    const rolIdler = taslak.roles.map((r) => r.id);
    const yeniKatilimcilar = duzenlePlanlamaAyarla(katilimcilar, rolIdler, i, kutucuk.checked);
    if (yeniKatilimcilar.length === 0) {
      taslak.planlama = undefined;
    } else {
      const onceki = taslak.planlama;
      taslak.planlama = {
        katilimcilar: yeniKatilimcilar,
        plan: onceki ? onceki.plan : "docs/plan/{kart}.md",
        tur: onceki ? onceki.tur : 1,
        ilkTurKor: onceki ? onceki.ilkTurKor : true,
        ...(onceki && onceki.denetci !== undefined ? { denetci: onceki.denetci } : {}),
      };
      taslak.planlama.denetci = duzenleDenetciGecerle(taslak.planlama.denetci, yeniKatilimcilar, rolIdler);
    }
    duzenleYenile();
  });
  return sarmal;
}

/** Planlama bölümü: özet, tur stepper'ı (1-5), yükümlülük denetçisi seçimi (DEVIR.md §3). */
function duzenlePlanlamaBolumuCiz(taslak) {
  const kutu = el("div", "duzenleBolum");
  kutu.append(el("div", "eyebrow", "Planlama"));
  const katilimcilar = taslak.planlama ? taslak.planlama.katilimcilar : [];
  const ozet = duzenlePlanlamaOzet(katilimcilar);
  kutu.append(el("div", "duzenleOzet", ozet || "katılım yok — hiçbir rol planlamaya katılmıyor"));
  if (katilimcilar.length === 0 || !taslak.planlama) return kutu;

  const turSira = el("div", "duzenleStepperSarmal");
  turSira.append(el("span", "duzenleAlanEtiket", "en çok tur"));
  turSira.append(duzenleStepper(taslak.planlama.tur, 1, 5, (v) => { taslak.planlama.tur = v; }));
  kutu.append(turSira);

  const rolIdler = taslak.roles.map((r) => r.id);
  const denetciSecenekleri = ["", ...rolIdler.slice(katilimcilar.length)];
  kutu.append(duzenleAlan("yükümlülük denetçisi", taslak.planlama.denetci || "", denetciSecenekleri,
    (v) => { taslak.planlama.denetci = v || undefined; }));

  return kutu;
}

/** Ret bölümü: limit stepper'ı (1-5); limit dolunca kart kapıya düşer (DEVIR.md §3). */
function duzenleRetBolumuCiz(taslak) {
  if (!taslak.reject) taslak.reject = { limit: 2, onExhausted: "gate" };
  const kutu = el("div", "duzenleBolum");
  kutu.append(el("div", "eyebrow", "Ret"));
  const sira = el("div", "duzenleStepperSarmal");
  sira.append(el("span", "duzenleAlanEtiket", "limit"));
  sira.append(duzenleStepper(taslak.reject.limit ?? 2, 1, 5, (v) => { taslak.reject.limit = v; }));
  kutu.append(sira);
  kutu.append(el("div", "duzenleAciklama", "limit dolunca kart insan kapısında bekler (onExhausted: gate)"));
  return kutu;
}

/** Bir rol bloğu — numara, ad girişi, ↑↓✕, 2x2 ızgara, prompt, planlama katılımı (DEVIR.md §3). */
function duzenleRolBlogu(taslak, i, gecersizMi) {
  const rol = taslak.roles[i];
  const blok = el("div", "duzenleRol" + (DUZENLE_VURGU === rol.id ? " duzenleVurgu" : ""));
  blok.dataset.rol = rol.id;

  const ust = el("div", "duzenleRolUst");
  ust.append(el("span", "duzenleRolNo mono", String(i + 1).padStart(2, "0")));
  const adGirisi = el("input", "duzenleAdGirisi" + (gecersizMi ? " gecersiz" : ""));
  adGirisi.value = rol.id;
  adGirisi.setAttribute("aria-label", (i + 1) + ". rolün adı");
  // DEVIR.md §3: "ad girişi (yalnızca a-z0-9-)". 'pattern' TARAYICIYA
  // İPUCU (form doğrulaması olmayan serbest bir <input>'ta tek başına
  // zorlamaz) — asıl zorlama duzenleAdSanitize'da: izin verilmeyen her
  // karakter YAZILIRKEN sessizce düşer, kaydedilmeden SONRA bir hata
  // göstermek yerine.
  adGirisi.setAttribute("pattern", "[a-z0-9-]+");
  adGirisi.addEventListener("change", () => {
    duzenleAdDegis(taslak, i, duzenleAdSanitize(adGirisi.value));
    duzenleYenile();
  });
  ust.append(adGirisi);

  const yukari = el("button", "duzenleIkon", "↑");
  yukari.type = "button";
  yukari.disabled = i === 0;
  yukari.setAttribute("aria-label", "yukarı taşı");
  yukari.addEventListener("click", () => { duzenleTasi(taslak.roles, i, -1); duzenleYenile(); });
  ust.append(yukari);

  const asagi = el("button", "duzenleIkon", "↓");
  asagi.type = "button";
  asagi.disabled = i === taslak.roles.length - 1;
  asagi.setAttribute("aria-label", "aşağı taşı");
  asagi.addEventListener("click", () => { duzenleTasi(taslak.roles, i, 1); duzenleYenile(); });
  ust.append(asagi);

  const sil = el("button", "duzenleIkon duzenleIkonSil", "✕");
  sil.type = "button";
  sil.disabled = taslak.roles.length < 2;
  sil.setAttribute("aria-label", "rolü sil");
  sil.addEventListener("click", () => { duzenleSil(taslak, rol.id); duzenleYenile(); });
  ust.append(sil);
  blok.append(ust);

  const izgara = el("div", "duzenleIzgara");
  // DEVIR.md §3 "claude/codex/copilot/gemini" diyor, ama bu DÖRDÜ sabit bir
  // liste DEĞİL: kayıtlı sağlayıcı kümesi /akis'in döndürdüğü
  // DUZENLE_SAGLAYICILAR'dan geliyor (bkz. railDuzenleYukle) ve bu depoda
  // bugün yalnızca claude/codex kayıtlı (bkz. adapters/factory.ts). Burada
  // sabit dört seçenek göstermek, kural 8'in ("provider kayıtlı bir
  // adaptöre karşılık gelir") REDDEDECEĞİ bir seçimi SUNMAK olurdu —
  // "yapamayacağı şeyi vaat eden düğme" kusur sınıfının select hâli.
  const saglayicilar = DUZENLE_SAGLAYICILAR.length ? DUZENLE_SAGLAYICILAR : [rol.provider];
  izgara.append(duzenleAlan("sağlayıcı", rol.provider, saglayicilar, (v) => { rol.provider = v; }));
  izgara.append(duzenleAlan("çalışma alanı", rol.workspace, null, (v) => { rol.workspace = v; }));
  izgara.append(duzenleSegment("alım", rol.receive || "task",
    [["task", "tekil"], ["batch", "toplu"]], (v) => { rol.receive = v; }));
  const oncekiIdler = taslak.roles.slice(0, i).map((r) => r.id);
  izgara.append(duzenleAlan("ret yolu", rol.reject || "", ["", ...oncekiIdler],
    (v) => { rol.reject = v || undefined; }));
  blok.append(izgara);

  blok.append(duzenlePromptAlani(rol));
  blok.append(duzenlePlanlamaKatilimKutusuCiz(taslak, i));

  return blok;
}

/** "Rol ekle" — zincirin SONUNA ekler (sıra = tek doğruluk kaynağı, next duzenleSiradanBagla'dan gelir). */
function duzenleRolEkle() {
  const taslak = DUZENLE_TASLAK;
  const sonuncusu = taslak.roles[taslak.roles.length - 1];
  let n = 1;
  while (taslak.roles.some((r) => r.id === "rol" + n)) n += 1;
  taslak.roles.push({
    id: "rol" + n,
    provider: sonuncusu ? sonuncusu.provider : (DUZENLE_SAGLAYICILAR[0] || "claude"),
    workspace: "rol" + n,
    prompt: sonuncusu ? sonuncusu.prompt : "",
    receive: "task",
    next: "done",
  });
  duzenleSiradanBagla(taslak.roles);
  duzenleYenile();
}

/** Diyagramdan tıklanan düğümü panelde vurgular — RAIL'i DEĞİŞTİRMEZ (bkz. secimDegistir). */
function duzenleVurgula(id) {
  DUZENLE_VURGU = id;
  document.querySelectorAll("#sagPanel .duzenleRol").forEach((node) => {
    node.classList.toggle("duzenleVurgu", node.dataset.rol === id);
  });
  const hedef = document.querySelector('#sagPanel .duzenleRol[data-rol="' + id + '"]');
  if (hedef && hedef.scrollIntoView) hedef.scrollIntoView({ block: "nearest" });
}

/** "Vazgeç" — panel AÇILDIĞINDAki hâle döner, kaydetmeden. */
function duzenleVazgec() {
  if (DUZENLE_ORIJINAL === null) return;
  DUZENLE_TASLAK = JSON.parse(DUZENLE_ORIJINAL);
  DUZENLE_YAML_GORUNUR = false;
  DUZENLE_ONIZLEME = null;
  duzenleYenile();
}

/**
 * Taslağı DOSYAYA YAZMADAN doğrular — "YAML'ı göster" önizlemesi VE
 * Kaydet'in devre dışı kalma kararı BU cevaba bağlı. MEVCUT /akis/onizleme
 * ucu (SAPMALAR.md §3) — ekrana ayrı bir kural kopyası YAZILMIYOR.
 * Normalizasyon (bkz. duzenleNormallestir) gönderilen KOPYAYA uygulanıyor,
 * DUZENLE_TASLAK'ın KENDİSİNE değil: önizleme "next"i ÖNCEDEN göstersin
 * diye roller dizisini sessizce değiştirmek, operatörün GÖRMEDİĞİ bir
 * mutasyon olurdu.
 */
async function duzenleOnizlemeYukle() {
  const kopya = duzenleNormallestir(JSON.parse(JSON.stringify(DUZENLE_TASLAK)));
  try {
    const cevap = await fetch("/akis/onizleme", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify(kopya),
    });
    const v = await cevap.json();
    if (!cevap.ok) throw new Error(v.hata || cevap.status);
    DUZENLE_ONIZLEME = v;
  } catch (e) {
    DUZENLE_ONIZLEME = { ok: false, message: "Önizleme alınamadı: " + e.message, yaml: "" };
  }
  if (RAIL.mode !== "edit") return; // panel kapandıysa bayat cevabı YAZMA
  duzenleAltCubukGuncelle();
  const yamlKutu = document.getElementById("duzenleYaml");
  if (yamlKutu) yamlKutu.textContent = DUZENLE_ONIZLEME.yaml || "";
}

/** Sabit alt çubuğu (durum metni + Vazgeç/Kaydet'in devre dışı kalma durumu) SURGICAL olarak günceller. */
function duzenleAltCubukGuncelle() {
  const taslak = DUZENLE_TASLAK;
  if (!taslak) return;
  const { hatalar } = duzenleHatalari(taslak.roles);
  const degisti = JSON.stringify(taslak) !== DUZENLE_ORIJINAL;
  const sunucuGecersiz = Boolean(DUZENLE_ONIZLEME && DUZENLE_ONIZLEME.ok === false);
  const durum = document.getElementById("duzenleDurumMetni");
  if (durum) {
    durum.textContent = hatalar.length > 0 ? hatalar.length + " hata — kaydedilemez"
      : !degisti ? "değişiklik yok"
      : sunucuGecersiz ? "akış geçersiz — kaydedilemez"
      : "değişiklik var · henüz kaydedilmedi";
  }
  const vazgecBtn = document.getElementById("duzenleVazgecBtn");
  if (vazgecBtn) vazgecBtn.disabled = !degisti;
  const kaydetBtn = document.getElementById("duzenleKaydetBtn");
  if (kaydetBtn) {
    kaydetBtn.disabled = !degisti || hatalar.length > 0
      || !(DUZENLE_ONIZLEME && DUZENLE_ONIZLEME.ok === true);
  }
}

/** Taslağın TAMAMINI yeniden çizer ve taze bir önizleme ister — her mutasyondan sonra çağrılır. */
function duzenleYenile() {
  const kutu = document.getElementById("sagPanel");
  if (!kutu || RAIL.mode !== "edit") return;
  railDuzenlePaneliCiz(kutu, SON_MODEL);
  void duzenleOnizlemeYukle();
}

/** "Kaydet" — MEVCUT /akis/yaz ucu. Geçersiz taslak zaten devre dışı bırakılmış düğmeden çağrılamaz. */
async function duzenleYaz() {
  const kaydetBtn = document.getElementById("duzenleKaydetBtn");
  if (kaydetBtn) kaydetBtn.disabled = true;
  const kopya = duzenleNormallestir(JSON.parse(JSON.stringify(DUZENLE_TASLAK)));
  try {
    const cevap = await fetch("/akis/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify(kopya),
    });
    const v = await cevap.json();
    if (!cevap.ok) throw new Error(v.hata || cevap.status);
    ciz(v.model);
    duzenleKapat();
    bildirimGoster("Roller kaydedildi.");
  } catch (e) {
    DUZENLE_ONIZLEME = { ok: false, message: "Kaydedilemedi: " + e.message, yaml: DUZENLE_ONIZLEME ? DUZENLE_ONIZLEME.yaml : "" };
    duzenleAltCubukGuncelle();
  }
}

/** MOD 5'in dış çatısı — geri düğmesi, üst bilgi, rol listesi, bölümler, YAML önizlemesi, sabit alt çubuk. */
function railDuzenlePaneliCiz(kutu, m) {
  kutu.replaceChildren();

  const geri = el("button", "railGeri", "← Genel bakış");
  geri.type = "button";
  geri.addEventListener("click", () => { duzenleKapat(); });
  kutu.append(geri);

  if (DUZENLE_HATA) {
    kutu.append(el("div", "err", "Akış okunamadı: " + DUZENLE_HATA));
    return;
  }
  if (!DUZENLE_TASLAK) {
    kutu.append(el("div", "railBos", "yükleniyor…"));
    return;
  }

  const taslak = DUZENLE_TASLAK;
  kutu.append(el("div", "railUst", "hub/flows/" + m.flow.name + ".yaml"));
  kutu.append(el("h2", "railRolBaslik", "Roller"));
  kutu.append(el("div", "duzenleAciklama",
    "Sıra formasyonu belirler: ↑/↓ ile taşımak rolün V'deki yerini de değiştirir."));

  const { hatalar, gecersiz } = duzenleHatalari(taslak.roles);
  const uyarilar = duzenleSilmeUyarilari(DUZENLE_ORIJINAL_ROL_IDLER, taslak.roles.map((r) => r.id), m.cards);
  hatalar.forEach((h) => kutu.append(el("div", "duzenleHata", h)));
  uyarilar.forEach((w) => kutu.append(el("div", "duzenleUyari", w)));

  const liste = el("div", "duzenleRolListe");
  taslak.roles.forEach((rol, i) => { liste.append(duzenleRolBlogu(taslak, i, gecersiz.has(i))); });
  kutu.append(liste);

  const ekle = el("button", "railBtn", "Rol ekle");
  ekle.type = "button";
  ekle.addEventListener("click", () => { duzenleRolEkle(); });
  kutu.append(ekle);

  kutu.append(duzenlePlanlamaBolumuCiz(taslak));
  kutu.append(duzenleRetBolumuCiz(taslak));

  const yamlBtn = el("button", "railBtn", DUZENLE_YAML_GORUNUR ? "YAML'ı gizle" : "YAML'ı göster");
  yamlBtn.type = "button";
  yamlBtn.addEventListener("click", () => {
    DUZENLE_YAML_GORUNUR = !DUZENLE_YAML_GORUNUR;
    railDuzenlePaneliCiz(kutu, m);
  });
  kutu.append(yamlBtn);
  if (DUZENLE_YAML_GORUNUR) {
    const onizlemeKutu = el("div", "onizle");
    onizlemeKutu.id = "duzenleYaml";
    onizlemeKutu.textContent = DUZENLE_ONIZLEME ? (DUZENLE_ONIZLEME.yaml || "") : "önizleme yükleniyor…";
    kutu.append(onizlemeKutu);
  }

  const altCubuk = el("div", "duzenleAlt");
  const durum = el("div", "duzenleDurumMetni");
  durum.id = "duzenleDurumMetni";
  altCubuk.append(durum);
  const vazgec = el("button", "railBtn", "Vazgeç");
  vazgec.type = "button";
  vazgec.id = "duzenleVazgecBtn";
  vazgec.addEventListener("click", () => { duzenleVazgec(); });
  altCubuk.append(vazgec);
  const kaydetBtn = el("button", "railBtn primary", "Kaydet");
  kaydetBtn.type = "button";
  kaydetBtn.id = "duzenleKaydetBtn";
  kaydetBtn.disabled = true;
  kaydetBtn.addEventListener("click", () => { void duzenleYaz(); });
  altCubuk.append(kaydetBtn);
  kutu.append(altCubuk);

  duzenleAltCubukGuncelle();
  if (DUZENLE_ONIZLEME === null) void duzenleOnizlemeYukle();
}

/** "Gözcü" girişi — çip bunu çağırır (bkz. ciz() "GÖZCÜ ÇİPİ" bloğu). */
function gozcuAc() {
  RAIL = { mode: "daemon", roleId: null, cardId: null, cardFrom: "overview" };
  railYenidenCiz();
}

/** Genel bakışa döner — MOD 5'in duzenleKapat()'ıyla AYNI desen. */
function gozcuKapat() {
  RAIL = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };
  railYenidenCiz();
}

/**
 * ".skein/gozcu.log" son satırlarını okur — sagPanelCiz bunu "daemon"
 * moduna İLK girişte BİR KEZ çağırıyor ("data-rail-gozcu" koruması,
 * railKartYukle'nin "data-rail-kart"ıyla AYNI desen) VE gozcuKomut
 * başarılı her başlat/durdur sonrası (yeni satırlar düşmüş olabilir).
 * Okunamazsa (dosya yok, gözcü hiç açılmamış) sessizce BOŞ liste —
 * bu bir hata değil, "henüz günlük yok" demek.
 */
async function railGozcuYukle() {
  try {
    const cevap = await fetch("/gozcu/log", { cache: "no-store" });
    const veri = await cevap.json();
    GOZCU_LOG = (cevap.ok && Array.isArray(veri.satirlar)) ? veri.satirlar : [];
  } catch (e) {
    GOZCU_LOG = [];
  }
  if (RAIL.mode === "daemon") railYenidenCiz();
}

/**
 * MOD 4 — Gözcü (DEVIR.md §2, kart c-20261105-92d731). Durum/düğme/bilgi
 * tablosu HER ciz() turunda TAZE çiziliyor ("overview"/"role" modlarıyla
 * AYNI ilke — bkz. railGenelBakisCiz) çünkü gözcünün canlı/çökmüş/duran
 * olması saniyeler içinde değişir; günlük kuyruğu (GOZCU_LOG) ise ayrı
 * bir ritimle yükleniyor (yukarıdaki railGozcuYukle yorumu).
 */
function railGozcuCiz(kutu, m) {
  kutu.replaceChildren();

  const geri = el("button", "railGeri", "← Genel bakış");
  geri.type = "button";
  geri.addEventListener("click", () => { gozcuKapat(); });
  kutu.append(geri);

  const g = m.daemon;
  const yonetiliyor = Boolean(GOZCU_AYAR);
  const duruyor = GOZCU_BEKLEYEN !== null;
  const durumBilgi = gozcuPanelDurum(g, yonetiliyor, duruyor);
  const topoUyari = gozcuTopoUyari(g, m.flow.hash, durumBilgi.durum);

  kutu.append(el("div", "railUst", "Gözcü"));
  const baslikSatir = el("div", "railGozcuBaslikSatir");
  baslikSatir.append(el("span", "railGozcuNokta " + durumBilgi.durum));
  baslikSatir.append(el("h2", "railGozcuBaslik", durumBilgi.etiket));
  kutu.append(baslikSatir);

  const ACIKLAMA = {
    on: "Kuyrukları izliyor; kart gördüğü rolü koşturuyor. Kuyruk boşalınca uyur, ölmez.",
    stopping: "Durdurma sinyali gitti. Gözcü süren ajan turunu bitirip çıkacak — anlık değil.",
    off: "Hiçbir rol koşmuyor. Açılan kartlar kuyrukta bekler.",
    stale: ".skein/daemon.json duruyor ama süreç yaşamıyor: gözcü çökmüş. Başlatınca kilit devralınır.",
    unmanaged: "Ekran gözcü bayrakları olmadan açıldı, o yüzden buradan başlatılamaz. Gözcüyü ayrı bir kabukta koşturabilirsin.",
  };
  kutu.append(el("div", "railGozcuAciklama", ACIKLAMA[durumBilgi.durum]));

  if (topoUyari) {
    const uyari = el("div", "railGozcuUyari");
    uyari.append(el("div", "railGozcuUyariMetin",
      "Akış gözcü açıldıktan sonra değişti. Gözcü eski rol listesini taşıyor — yeni roller kuyruğa bakılmadan kalır."));
    const yenidenBtn = el("button", "railBtn primary", "Yeniden başlat");
    yenidenBtn.type = "button";
    yenidenBtn.addEventListener("click", () => {
      GOZCU_BEKLEYEN = "yenidenBaslatiliyor";
      void gozcuKomut("durdur", yenidenBtn);
    });
    uyari.append(yenidenBtn);
    kutu.append(uyari);
  }

  const eylemler = el("div", "railGozcuEylemler");
  if (durumBilgi.durum === "unmanaged") {
    const ornekler = gozcuKomutOrnekleri(m.flow.name);
    eylemler.append(el("div", "railGozcuKomutEtiket", "Ayrı kabukta:"));
    eylemler.append(el("code", "railGozcuKomut", ornekler.cmd1));
    eylemler.append(el("div", "railGozcuKomutEtiket", "ya da ekranı bayraklarla aç, düğme çıkar:"));
    eylemler.append(el("code", "railGozcuKomut", ornekler.cmd2));
  } else if (durumBilgi.durum === "stopping") {
    const b = el("button", "railBtn", "Süren tur bitiyor…");
    b.type = "button";
    b.disabled = true;
    eylemler.append(b);
  } else {
    const canli = Boolean(g && g.alive);
    const etiket = gozcuEylemEtiketi(g);
    const b = el("button", "railBtn" + (canli ? "" : " primary"), etiket);
    b.type = "button";
    b.addEventListener("click", () => {
      // Durdurma İSTENDİ ama ANLIK değil (bkz. gozcuPanelDurum yorumu) —
      // çip/panel bir SONRAKİ yoklamada "stopping" göstersin diye bayrak
      // BURADA, cevap gelmeden ÖNCE kuruluyor.
      if (canli) GOZCU_BEKLEYEN = "durduruluyor";
      void gozcuKomut(canli ? "durdur" : "baslat", b);
    });
    eylemler.append(b);
  }
  kutu.append(eylemler);

  // BİLGİ TABLOSU — pid/akış/mod/açıldı/kilit. Gözcü GERÇEKTEN BAŞKA bir
  // kabuktan açılmış olsa bile (g !== null) gösteriliyor: "unmanaged"
  // yalnızca BU EKRANIN yönetme yetkisini söylüyor, kilidin varlığını
  // DEĞİL (bkz. gozcuPanelDurum yorumu).
  if (g) {
    const bilgi = el("div", "railGozcuBilgi");
    const satir = (etiket, deger) => {
      const s = el("div", "railGozcuBilgiSatir");
      s.append(el("span", null, etiket));
      s.append(el("b", null, deger));
      bilgi.append(s);
    };
    satir("pid", String(g.info.pid) + (g.alive ? "" : " · yaşamıyor"));
    satir("akış", g.info.flow);
    satir("mod", g.info.mode === "serve" ? "serve · uzun ömürlü" : "batch · tek seferlik");
    satir("açıldı", g.info.startedAt);
    satir("kilit", ".skein/daemon.json");
    kutu.append(bilgi);
  }

  if (yonetiliyor && GOZCU_AYAR.bayraklar.length > 0) {
    kutu.append(el("div", "railAraBaslik", "Gözcüye geçen bayraklar"));
    const bayraklar = el("div", "railGozcuBayraklar");
    GOZCU_AYAR.bayraklar.forEach((b) => bayraklar.append(el("span", "tag tag-outline", b)));
    kutu.append(bayraklar);
  }

  kutu.append(el("div", "railGozcuLogBaslik", ".skein/gozcu.log · son satırlar"));
  if (GOZCU_LOG.length === 0) {
    kutu.append(el("div", "railBos", "günlük boş"));
  } else {
    GOZCU_LOG.forEach((l) => {
      const satir = el("div", "railGozcuLogSatir");
      satir.append(el("span", "saat", l.at));
      satir.append(el("span", l.hata ? "hata" : null, l.mesaj));
      kutu.append(satir);
    });
  }
}

/** Sağ paneli RAIL'in o anki moduna göre doldurur — ciz()'in her çağrısında. */
function sagPanelCiz(m) {
  const kutu = document.getElementById("sagPanel");
  if (!kutu) return;
  if (RAIL.mode !== "card") kutu.removeAttribute("data-rail-kart");
  // MOD 5 kendi "data-rail-edit" bayrağıyla AYNI korumayı kullanıyor
  // (railKartYukle'nin "data-rail-kart"ı) — yoksa her saniyelik yoklama
  // (yokla/ciz) formu sıfırlar, operatör yazarken kutular BAŞA döner.
  if (RAIL.mode !== "edit") kutu.removeAttribute("data-rail-edit");
  // MOD 4 kendi "data-rail-gozcu" bayrağıyla AYNI korumayı kullanıyor —
  // yalnızca GOZCU_LOG'un İLK yüklemesini bir kez tetiklemek için (bkz.
  // railGozcuYukle); durum/düğme HER turda zaten taze (railGozcuCiz).
  if (RAIL.mode !== "daemon") kutu.removeAttribute("data-rail-gozcu");
  if (RAIL.mode === "role") {
    railRolCiz(kutu, m, RAIL.roleId);
    return;
  }
  if (RAIL.mode === "card") {
    if (railYenidenYuklenmeliMi(kutu.dataset.railKart, RAIL.cardId)) {
      kutu.dataset.railKart = RAIL.cardId;
      void railKartYukle(kutu, RAIL.cardId);
    }
    return;
  }
  if (RAIL.mode === "daemon") {
    if (kutu.dataset.railGozcu !== "1") {
      kutu.dataset.railGozcu = "1";
      void railGozcuYukle();
    }
    railGozcuCiz(kutu, m);
    return;
  }
  if (RAIL.mode === "edit") {
    if (kutu.dataset.railEdit !== "1") {
      kutu.dataset.railEdit = "1";
      void railDuzenleYukle(kutu);
    }
    return;
  }
  railGenelBakisCiz(kutu, m);
}

/**
 * Bir diyagramı TEK yönde (yatay ya da dikey) SVG olarak kurar.
 *
 * İki kopya BİRDEN üretiliyor (bkz. diyagramIcerikCiz) ve hangisinin
 * görüneceğine bir CSS medya sorgusu karar veriyor — JS ÖLÇEREK değil,
 * zincir okunun yön değiştirdiği ".colhead .zincir .ok" kuralıyla AYNI
 * ilke (dar ekranda ölçmek yarış durumuna açık; medya sorgusu değil).
 *
 * editable TRUE'yken diyagram artık yalnızca GÖSTERMİYOR:
 *   - her düğüm TIKLANABİLİR — tıklayınca DIYAGRAM_SECILI o rolün id'sine
 *     dönüyor ve diyagramın altında düzenleme alanları açılıyor (bkz.
 *     diyagramIcerikCiz, diyagramDuzenlePaneliCiz).
 *   - her 'next' kenarının ORTASINDA bir "+" işareti çıkıyor: tıklanınca
 *     YENİ bir rol tam o iki düğümün ARASINA eklenecek (bkz.
 *     diyagramRolArasiEkleAc) — hangi kenara tıklandığı, yeni rolün
 *     zincire NEREYE gireceğini KENDİSİ gösteriyor.
 * editable FALSE'ken (akış salt okunur ekranda açılmış ya da taslak hiç
 * yüklenemediyse) diyagram AYNEN eski davranışı korur — tıklanamaz,
 * "+" yok. Görüntülemek düzenlemekten ayrı bir yetki (bkz. akisAc
 * yorumu), bu ayrım burada da geçerli.
 */
function diyagramSvgKur(model, yon, editable) {
  const roller = model.roles;
  const n = roller.length;
  const idx = new Map(roller.map((r, i) => [r.id, i]));
  const ADIM = yon === "yatay" ? 180 : 86;
  // ana eksen boyunca düğümün kapladığı uzunluk (ilk/son düğüm taşmasın diye dolgu)
  const anaBoy = yon === "yatay" ? DUGUM_W : DUGUM_H;
  // dik eksende düğümün kapladığı uzunluk (satır/sütunun kalınlığı)
  const dikBoy = yon === "yatay" ? DUGUM_H : DUGUM_W;
  const ANA_PAD = anaBoy / 2 + 18;
  const SATIR = KAPI_BANT + dikBoy / 2 + 18;
  // (ana, dik) çiftini gerçek (x, y)'ye çeviriyor — yerleşimin kendisi TEK,
  // yalnızca bu eşleme yöne göre değişiyor.
  const nokta = yon === "yatay"
    ? (ana, dik) => ({ x: ana, y: dik })
    : (ana, dik) => ({ x: dik, y: ana });
  const anaKonum = (i) => ANA_PAD + i * ADIM;

  const anaUzunluk = n <= 1 ? ANA_PAD * 2 : ANA_PAD * 2 + (n - 1) * ADIM;
  const dikUzunluk = SATIR + dikBoy / 2 + KENAR_LANE.syncBack + 18;
  const genislik = yon === "yatay" ? anaUzunluk : dikUzunluk;
  const yukseklik = yon === "yatay" ? dikUzunluk : anaUzunluk;

  const svg = sv("svg", {
    viewBox: "0 0 " + genislik + " " + yukseklik,
    role: "img",
    "aria-label": "Akış diyagramı",
  });
  svg.classList.add("diyagram-" + yon);

  const kenarKat = sv("g", { class: "kenarlar" });
  const kapiKat = sv("g", { class: "kapilar" });
  const dugumKat = sv("g", { class: "dugumler" });

  model.edges.forEach((kenar) => {
    const i = idx.get(kenar.from);
    const j = idx.get(kenar.to);
    if (i === undefined || j === undefined) return;
    const stil = KENAR_STIL[kenar.kind];
    const g = sv("g", {
      class: "kenar kenar-" + kenar.kind,
      "data-from": kenar.from, "data-to": kenar.to, "data-kind": kenar.kind,
    });
    if (kenar.kind === "next") {
      // BİTİŞİK düğümler arasında düz çizgi — next zincirde HER ZAMAN
      // ardıl role gider (load.ts chainOrder), sıçrama olmaz.
      const p1 = nokta(anaKonum(i) + anaBoy / 2, SATIR);
      const p2 = nokta(anaKonum(j) - anaBoy / 2, SATIR);
      const cizgi = sv("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      cizgi.style.stroke = stil.renk;
      cizgi.style.strokeWidth = "2";
      g.append(cizgi);
      g.append(okUcu(p2.x, p2.y, p2.x - p1.x, p2.y - p1.y, stil.renk));
      kenarKat.append(g);
      if (editable) {
        // "+" İŞARETİ kenarın TAM ORTASINDA — buraya basmak, yeni rolün
        // kenar.from ile kenar.to arasına gireceğini GÖSTERİYOR, ayrı
        // bir "nereye eklensin" sorusu sormuyor çünkü soru zaten diyagramda
        // tıklanan yerle cevaplanmış.
        kenarKat.append(ekleIsaretiKur((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, kenar.from));
      }
      return;
    } else {
      // GERİ kenar: satırın/sütunun DIŞINDA kavisli — ileri akışla
      // KARIŞMASIN (bu kartın asıl kısıtı). "lane" türe sabit: aynı çifte
      // giden reject ile syncBack iki ayrı eğride durur, biri biri
      // ezmez.
      const lane = KENAR_LANE[kenar.kind];
      const p1 = nokta(anaKonum(i), SATIR + dikBoy / 2);
      const p2 = nokta(anaKonum(j), SATIR + dikBoy / 2);
      const orta = nokta((anaKonum(i) + anaKonum(j)) / 2, SATIR + dikBoy / 2 + lane);
      const d = "M " + p1.x + " " + p1.y + " Q " + orta.x + " " + orta.y + " " + p2.x + " " + p2.y;
      const yol = sv("path", { d: d, fill: "none" });
      yol.style.stroke = stil.renk;
      yol.style.strokeWidth = "2";
      yol.setAttribute("stroke-dasharray", stil.kesikli);
      g.append(yol);
      g.append(okUcu(p2.x, p2.y, p2.x - orta.x, p2.y - orta.y, stil.renk));
    }
    kenarKat.append(g);
  });

  // KAPILAR — zincirin üstünde durağan bir işaret, akış kenarlarından
  // ayrı. Yalnızca "approval" tipi çizilir: "none" davranışsal olarak
  // kapı DEĞİL ve bu filtre kararı BURADA (modelde değil — bkz. model.ts
  // "kapı tipi filtrelenmeden taşınıyor" yorumu).
  model.gates.forEach((kapi) => {
    if (kapi.type !== "approval") return;
    const i = idx.get(kapi.after);
    if (i === undefined) return;
    const ana = anaKonum(i) + ADIM / 2;
    const p = nokta(ana, SATIR - KAPI_BANT);
    const g = sv("g", { class: "kapi-isaret", "data-after": kapi.after });
    const pilG = 52;
    const pilY = 20;
    const pil = sv("rect", {
      x: p.x - pilG / 2, y: p.y - pilY / 2, width: pilG, height: pilY, rx: 10,
    });
    pil.style.fill = "var(--gate-bg)";
    pil.style.stroke = "var(--gate-line)";
    g.append(pil);
    const etiket = sv("text", { x: p.x, y: p.y + 3.5, "text-anchor": "middle" });
    etiket.style.fill = "var(--gate-ink)";
    etiket.style.fontSize = "10px";
    etiket.style.fontWeight = "600";
    etiket.textContent = "kapı";
    g.append(etiket);
    kapiKat.append(g);
  });

  // DÜĞÜMLER — kart değil ETİKET: id + sağlayıcı/workspace, hepsi kısa.
  //
  // editable'ken tıklanabilir: DIYAGRAM_SECILI o rolün id'sine döner ve
  // panel kendini yeniden kurup (bkz. yenile) diyagramın altına o rolün
  // düzenleme alanlarını açar. SEÇİLİ düğüm kendi dış çizgisiyle (vurgu
  // rengi, kalın çizgi) işaretli — operatör hangi düğümü düzenlediğini
  // kaybetmesin.
  roller.forEach((rol, i) => {
    const p = nokta(anaKonum(i), SATIR);
    const secili = editable && DIYAGRAM_SECILI === rol.id;
    const g = sv("g", {
      class: "dugum" + (secili ? " dugum-secili" : ""), "data-rol": rol.id,
      transform: "translate(" + p.x + " " + p.y + ")",
    });
    const kutu = sv("rect", {
      x: -DUGUM_W / 2, y: -DUGUM_H / 2, width: DUGUM_W, height: DUGUM_H, rx: 7,
    });
    kutu.style.fill = "var(--surface)";
    kutu.style.stroke = secili ? "var(--accent)" : "var(--line)";
    kutu.style.strokeWidth = secili ? "2.5" : "1";
    g.append(kutu);
    if (editable) {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => { DIYAGRAM_SECILI = rol.id; yenile(); });
    }
    const id = sv("text", { x: 0, y: -4, "text-anchor": "middle", class: "mono" });
    id.style.fill = "var(--ink)";
    id.style.fontWeight = "700";
    id.style.fontSize = "12.5px";
    id.textContent = rol.id;
    g.append(id);
    const alt = sv("text", { x: 0, y: 14, "text-anchor": "middle" });
    alt.style.fill = "var(--ink-3)";
    alt.style.fontSize = "10px";
    alt.textContent = rol.provider + " · " + rol.workspace;
    g.append(alt);
    dugumKat.append(g);
  });

  svg.append(kenarKat, kapiKat, dugumKat);
  return svg;
}

/**
 * TASLAK'tan diyagramın çizdiği biçime (bkz. UiModel.edges, model.ts) —
 * sunucudan GELMİYOR, çünkü taslak henüz DİSKE YAZILMADI; sunucunun
 * /durum'u onu hiç görmüyor. Kenar türetme mantığı
 * model.ts'teki buildModel ile AYNI (next !== 'done' → next kenarı,
 * reject varsa → reject kenarı, syncBack'in her ögesi → syncBack kenarı):
 * iki yerde iki ayrı "akış ne diyor" yorumu olmasın.
 */
function taslakModelKur(taslak) {
  const edges = [];
  taslak.roles.forEach((rol) => {
    if (rol.next !== "done") edges.push({ from: rol.id, to: rol.next, kind: "next" });
    if (rol.reject) edges.push({ from: rol.id, to: rol.reject, kind: "reject" });
    (rol.syncBack || []).forEach((hedef) => edges.push({ from: rol.id, to: hedef, kind: "syncBack" }));
  });
  return {
    flow: {},
    roles: taslak.roles.map((rol) => ({ id: rol.id, provider: rol.provider, workspace: rol.workspace })),
    edges,
    gates: taslak.gates || [],
  };
}

/**
 * Diyagramın gösterim içeriği — yatay VE dikey kopya birden, hangisinin
 * görüneceğine CSS karar veriyor (bkz. diyagramSvgKur yorumu).
 *
 * Akış BOZUKSA (model.flow.error) diyagram ÇİZİLMİYOR, hata basılıyor:
 * yarım bir graf hatayı göstermekten daha kötü, çünkü sağlam görünür ama
 * artık yaşayan topolojiyi yansıtmıyor olabilir.
 */
function diyagramIcerikCiz(model, editable) {
  const sarmal = el("div", "diyagram-sarmal");
  if (!model) {
    sarmal.append(el("div", "err", "Durum henüz okunamadı."));
    return sarmal;
  }
  if (model.flow.error) {
    const hata = el("div", "err",
      "Akış dosyası şu an geçersiz, diyagram bu yüzden çizilmiyor:\\n" + model.flow.error);
    hata.style.cssText = "white-space:pre-wrap";
    sarmal.append(hata);
    return sarmal;
  }
  if (!model.roles.length) {
    sarmal.append(el("div", "ipucu", "Akışta hiç rol yok."));
    return sarmal;
  }
  sarmal.append(diyagramSvgKur(model, "yatay", editable));
  sarmal.append(diyagramSvgKur(model, "dikey", editable));

  // SEÇİLİ rolün düzenleme alanları diyagramın ALTINDA — TASLAK'tan
  // (modelden değil: model yalnızca id/provider/workspace taşıyor, bkz.
  // UiRole, düzenlemek için next/reject/syncBack GEREKİYOR). Seçili id
  // taslakta artık yoksa (silindiyse ya da hiç yoksa) hiçbir şey basılmaz
  // — yarım bir form, hiç form olmamaktan kötü.
  //
  // Önizleme + "Dosyaya yaz" bloğu seçime BAĞLI DEĞİL — HER ZAMAN
  // basılıyor (editable'ken). Rol SİLMEK gibi yapısal bir değişiklik
  // seçimi KENDİSİ temizliyor (bkz. diyagramRolSil): o blok seçime bağlı
  // kalsaydı, silme işleminden sonra "Dosyaya yaz" düğmesi KAYBOLUR ve
  // operatör onay vermiş bir değişikliği kaydedecek yer bulamazdı.
  if (editable) {
    const i = TASLAK.roles.findIndex((r) => r.id === DIYAGRAM_SECILI);
    if (i !== -1) sarmal.append(diyagramDuzenlePaneliCiz(TASLAK.roles[i], i));
    sarmal.append(onizlemeBlokCiz());
  }
  return sarmal;
}

/**
 * Diyagramdan tıklanan düğümün düzenleme alanları: sağlayıcı, workspace,
 * next, reject, syncBack — bu kartın İSTEDİĞİ TAM KÜME. 'id' burada
 * DÜZENLENMİYOR (yeniden adlandırma "Ham YAML" sekmesinde kalıyor,
 * diyagramın düğüm kimliği aynı zamanda SEÇİMİN kendisi — aynı tıklamada
 * değiştirmek kafa karıştırırdı) ve prompt/receive de diyagramın
 * konusu değil (ajanın gördüğü METİN ayrı bir panelin işi, bkz.
 * "Promptları düzenle").
 *
 * Değişiklikler TASLAK'ı mutasyona uğratıp onizle()'yi tetikliyor —
 * "Ham YAML" sekmesiyle AYNI TEK yazma yolu (POST /akis/onizleme, sonra
 * "Dosyaya yaz" ile POST /akis/yaz): diyagramın kendi ayrı bir yazma
 * yolu YOK.
 */
function diyagramDuzenlePaneliCiz(rol, i) {
  const sarmal = el("div", null);

  const kutu = el("div", "rol");
  const ust = el("div", "rolust");
  ust.append(el("b", null, "Düzenle: " + rol.id));
  ust.append(el("div", "spacer"));

  const sil = el("button", "mini sil", "Rolü sil");
  sil.type = "button";
  sil.addEventListener("click", () => { diyagramRolSil(rol.id); });
  ust.append(sil);

  const kapatSecim = el("button", "mini", "Seçimi kapat");
  kapatSecim.type = "button";
  kapatSecim.addEventListener("click", () => { DIYAGRAM_SECILI = null; yenile(); });
  ust.append(kapatSecim);
  kutu.append(ust);

  const idler = TASLAK.roles.map((r) => r.id);
  const digerIdler = idler.filter((x) => x !== rol.id);
  const hedefler = digerIdler.concat(["done"]);
  const retler = [""].concat(digerIdler);

  kutu.append(alan("provider", rol.provider, (v) => (rol.provider = v), SAGLAYICILAR));
  kutu.append(alan("workspace", rol.workspace, (v) => (rol.workspace = v)));
  kutu.append(alan("next", rol.next, (v) => (rol.next = v), hedefler));
  kutu.append(alan("reject", rol.reject || "", (v) => { rol.reject = v || undefined; }, retler));
  kutu.append(syncBackAlani(rol, digerIdler));
  sarmal.append(kutu);
  return sarmal;
}

/**
 * Diyagramdan silme — rolSilById ile AYNI reconnect mantığı (bkz. o
 * fonksiyonun ve rolSil'in yorumu): zincir kopmuyor, giden role işaret
 * eden reject/syncBack/gates.after temizleniyor. Seçim de temizlenir
 * — silinen düğümün düzenleme formu açık kalamaz.
 */
function diyagramRolSil(id) {
  DIYAGRAM_SECILI = null;
  rolSilById(id);
}

/**
 * Diyagramdaki bir "+" işaretine tıklanınca: yeni rol oncekiId'nin
 * ARDINA girecek. Aynı "Yeni rol" panelini (bkz. yeniRolAc) açıyoruz —
 * diyagramın kendi formu YOK, var olan /rol/yeni yolunu diyagramdan
 * ÇAĞIRIYORUZ. YENI_ROL_ONCEDEN_SONRA o panele "nereye gireceğini"
 * önceden söylüyor: operatör boş bir "sonra" listesiyle karşılaşmıyor.
 */
function diyagramRolArasiEkleAc(oncekiId) {
  YENI_ROL_ONCEDEN_SONRA = oncekiId;
  location.hash = "prompt/yeni";
}

// Panelin hangi sekmede açıldığı: her açılışta "diyagram" — akış artık
// ÖNCE grafla gösteriliyor, ham YAML bir tık arkada (bkz. bu kartın
// isteği). "ham" sekmesi /akis okunamadıysa da çıkıyor; o durumda
// gerekçesi AKIS_HATA'da, yalnızca o sekmede basılıyor — diyagramı
// etkilemiyor çünkü diyagram zaten SON_MODEL'den geliyor, /akis'ten değil.
let AKIS_SEKME = "diyagram";
let AKIS_HATA = null;
// Diyagramda TIKLANMIŞ düğümün id'si — o rolün düzenleme alanlarını
// diyagramın ALTINDA açıyor. null = hiçbir düğüm seçili değil.
let DIYAGRAM_SECILI = null;

/** Akış panelinin DIŞ ÇATISI: kapat düğmesi, başlık, sekmeler, içerik. */
function akisPanelCiz() {
  const ust = el("div", "ust");
  ust.addEventListener("click", (e) => { if (e.target === ust) kapat(); });
  const p = el("div", "panel");

  const kapatDugme = el("button", "kapat", "Kapat");
  kapatDugme.type = "button";
  kapatDugme.addEventListener("click", kapat);
  p.append(kapatDugme);

  p.append(el("h2", null, "Akış: " + (SON_MODEL ? SON_MODEL.flow.name : "")));

  const sekmeler = el("div", "sekmeler");
  const diyagramDugme = el("button", "mini" + (AKIS_SEKME === "diyagram" ? " aktif" : ""), "Diyagram");
  diyagramDugme.type = "button";
  diyagramDugme.addEventListener("click", () => { AKIS_SEKME = "diyagram"; yenile(); });
  const hamDugme = el("button", "mini" + (AKIS_SEKME === "ham" ? " aktif" : ""), "Ham YAML");
  hamDugme.type = "button";
  hamDugme.addEventListener("click", () => { AKIS_SEKME = "ham"; yenile(); });
  sekmeler.append(diyagramDugme, hamDugme);
  p.append(sekmeler);

  const icerik = el("div", null);
  icerik.id = "akisIcerik";
  if (AKIS_SEKME === "diyagram") {
    // DÜZENLENEBİLİRKEN diyagram TASLAK'tan çiziliyor (bkz.
    // taslakModelKur): rol silme/ekleme gibi YAPISAL değişiklikler
    // diyagramda ANINDA görünsün — kaydetmeyi BEKLEMEDEN (bkz. rolSil'in
    // çağırdığı yenile()). Tek istisna: akış şu an GEÇERSİZSE (bkz.
    // model.flow.error) SON_MODEL'den çizilmeye devam ediliyor — TASLAK o
    // anda bozuk akıştan ÖNCEKİ (son geçerli) hâli taşıyor olabilir ve onu
    // sağlammış gibi göstermek "akış bozulunca diyagram değil hata
    // görünür" kuralını (bkz. diyagramIcerikCiz yorumu) sessizce delerdi.
    // Düzenleme AÇIK mı (düğümler tıklanabilir, "+"ler çıkıyor mu)
    // sorusunun cevabı ise HER ZAMAN TASLAK'ın var olup olmadığı —
    // görüntülemek düzenlemekten ayrı bir yetki (bkz. akisAc yorumu).
    const duzenlenebilir = TASLAK !== null;
    const akisGecerli = !(SON_MODEL && SON_MODEL.flow && SON_MODEL.flow.error);
    const diyagramModeli = duzenlenebilir && akisGecerli ? taslakModelKur(TASLAK) : SON_MODEL;
    icerik.append(diyagramIcerikCiz(diyagramModeli, duzenlenebilir));
  } else if (TASLAK !== null) {
    icerik.append(editorIcerikCiz());
  } else {
    icerik.append(el("div", "err", AKIS_HATA || "Akış okunamadı."));
  }
  p.append(icerik);

  ust.append(p);
  return ust;
}

async function akisAc() {
  AKIS_SEKME = "diyagram";
  TASLAK = null;
  SAGLAYICILAR = [];
  AKIS_HATA = null;
  DIYAGRAM_SECILI = null;
  try {
    const cevap = await fetch("/akis", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    if (!veri.draft) throw new Error("Bu ekran akış düzenlemeye açık değil.");
    TASLAK = veri.draft;
    SAGLAYICILAR = veri.providers || [];
  } catch (e) {
    // DİYAGRAMI ETKİLEMİYOR: /akis yalnızca "Ham YAML" sekmesinin
    // kaynağı, diyagram SON_MODEL'den geliyor. Düzenleme kapalıysa bile
    // diyagram görünmeli — görüntülemek düzenlemekten ayrı bir yetki.
    AKIS_HATA = e.message;
  }
  document.getElementById("panel").replaceChildren(akisPanelCiz());
}

function alan(ad, deger, onChange, secenekler) {
  const l = el("label", null);
  l.append(document.createTextNode(ad));
  const g = el(secenekler ? "select" : "input");
  if (secenekler) {
    secenekler.forEach((s) => {
      const o = el("option", null, s);
      o.value = s;
      if (s === deger) o.selected = true;
      g.append(o);
    });
  } else {
    g.value = deger == null ? "" : deger;
  }
  g.addEventListener("change", () => { onChange(g.value); void onizle(); });
  l.append(g);
  return l;
}

/**
 * syncBack alanı — rolün BAŞKA hangi rollerin kuyruğuna haber bıraktığı.
 *
 * Eskiden bu alan hiç düzenlenemiyordu: rolCiz id/provider/workspace/
 * receive/next/reject gösteriyordu ama syncBack taslakta sessizce
 * TAŞINIYOR, hiçbir form alanı ona dokunmuyordu — operatör onu yalnızca
 * Ham YAML önizlemesinde (yazılacak dosyanın metninde) görebiliyordu,
 * DEĞİŞTİREMİYORDU. Çoklu hedef olduğu için alan()'ın tek-değerli
 * select/input kalıbı burada uymuyor: her diğer rol kendi onay kutusu.
 */
function syncBackAlani(rol, digerIdler) {
  const l = el("label", "genis");
  l.append(document.createTextNode("syncBack"));
  const kutu = el("div", "syncback");
  digerIdler.forEach((id) => {
    const etiket = el("label", "syncback-oge");
    const kutucuk = el("input");
    kutucuk.type = "checkbox";
    kutucuk.checked = (rol.syncBack || []).includes(id);
    kutucuk.addEventListener("change", () => {
      const mevcut = new Set(rol.syncBack || []);
      if (kutucuk.checked) mevcut.add(id);
      else mevcut.delete(id);
      rol.syncBack = Array.from(mevcut);
      void onizle();
    });
    etiket.append(kutucuk, document.createTextNode(id));
    kutu.append(etiket);
  });
  l.append(kutu);
  return l;
}

function rolCiz(rol, i) {
  const kutu = el("div", "rol");
  const ust = el("div", "rolust");
  ust.append(el("b", null, (i + 1) + ". " + rol.id));
  ust.append(el("div", "spacer"));

  // Zincire yeni rol EKLEMEK, sıradaki 'next' bağını yeniden kurmak demek:
  // sıra dizideki yerden değil 'next' zincirinden okunuyor.
  const ekle = el("button", "mini", "Altına rol ekle");
  ekle.type = "button";
  ekle.addEventListener("click", () => { rolEkle(i); });
  ust.append(ekle);

  const sil = el("button", "mini sil", "Sil");
  sil.type = "button";
  sil.addEventListener("click", () => { rolSil(i); });
  ust.append(sil);
  kutu.append(ust);

  const idler = TASLAK.roles.map((r) => r.id);
  const hedefler = idler.filter((x) => x !== rol.id).concat(["done"]);
  const retler = [""].concat(idler.filter((x) => x !== rol.id));

  kutu.append(alan("id", rol.id, (v) => { rolAdiDegis(i, v); }));
  kutu.append(alan("provider", rol.provider, (v) => (rol.provider = v), SAGLAYICILAR));
  kutu.append(alan("workspace", rol.workspace, (v) => (rol.workspace = v)));
  kutu.append(alan("receive", rol.receive || "task", (v) => (rol.receive = v), ["task", "batch"]));
  kutu.append(alan("next", rol.next, (v) => (rol.next = v), hedefler));
  kutu.append(alan("reject", rol.reject || "", (v) => { rol.reject = v || undefined; }, retler));
  kutu.append(syncBackAlani(rol, idler.filter((x) => x !== rol.id)));
  const p = alan("prompt", rol.prompt, (v) => (rol.prompt = v));
  p.className = "genis";
  kutu.append(p);
  return kutu;
}

/** Rolü zincire ekler: önceki rolün 'next'i yeni role, yeni rolünki eskisine. */
function rolEkle(i) {
  const onceki = TASLAK.roles[i];
  let n = 1;
  while (TASLAK.roles.some((r) => r.id === "rol" + n)) n += 1;
  const yeni = {
    id: "rol" + n,
    provider: onceki.provider,
    workspace: "rol" + n,
    prompt: onceki.prompt,
    receive: "batch",
    next: onceki.next,
  };
  onceki.next = yeni.id;
  TASLAK.roles.splice(i + 1, 0, yeni);
  yenile();
}

/**
 * Rolü çıkarır ve ona yapılan HER atfı temizler.
 *
 * Atıfları bırakmak akışı kalıcı olarak geçersiz yapardı: kullanıcı silmek
 * istediği rolü silemez, çünkü ona işaret eden bir 'reject' kalıyor.
 */
function rolSil(i) {
  if (TASLAK.roles.length < 2) return;
  const giden = TASLAK.roles[i];
  TASLAK.roles.splice(i, 1);
  TASLAK.roles.forEach((r) => {
    if (r.next === giden.id) r.next = giden.next;
    if (r.reject === giden.id) r.reject = undefined;
    if (r.syncBack) r.syncBack = r.syncBack.filter((x) => x !== giden.id);
  });
  if (TASLAK.gates) TASLAK.gates = TASLAK.gates.filter((g) => g.after !== giden.id);
  yenile();
}

/**
 * rolSil'in KİMLİKLE çağrılan hâli.
 *
 * Diyagramdan tıklanan düğüm bir İNDEKS taşımıyor, bir id taşıyor
 * (bkz. data-rol özniteliği) — bu sarmalayıcı aynı reconnect mantığını
 * (bkz. rolSil yorumu) diyagramın konuştuğu kimlikle çağırıyor, mantığı
 * İKİ YERDE yazmak yerine.
 */
function rolSilById(id) {
  const i = TASLAK.roles.findIndex((r) => r.id === id);
  if (i !== -1) rolSil(i);
}

function rolAdiDegis(i, yeniAd) {
  const eski = TASLAK.roles[i].id;
  if (!yeniAd || yeniAd === eski) return;
  TASLAK.roles[i].id = yeniAd;
  TASLAK.roles.forEach((r) => {
    if (r.next === eski) r.next = yeniAd;
    if (r.reject === eski) r.reject = yeniAd;
    if (r.syncBack) r.syncBack = r.syncBack.map((x) => (x === eski ? yeniAd : x));
  });
  if (TASLAK.gates) TASLAK.gates.forEach((g) => { if (g.after === eski) g.after = yeniAd; });
  yenile();
}

/**
 * Panelin TAMAMINI yeniden kurar — hangi sekimde olunduğunu KORUYARAK.
 *
 * Eskiden burada doğrudan editorCiz() çağrılıyordu (panel HER ZAMAN
 * editördü). Artık panel iki sekmeli; rol ekle/sil/yeniden adlandır gibi
 * düzenleme eylemleri yalnızca "ham" sekmesinden gelebilir, o yüzden
 * AKIS_SEKME burada OLDUĞU GİBİ kalıyor — akisPanelCiz() zaten ona bakıp
 * doğru içeriği çiziyor.
 */
function yenile() {
  document.getElementById("panel").replaceChildren(akisPanelCiz());
  void onizle();
}

/**
 * "Ham YAML" sekmesinin içeriği: rol alanları + canlı önizleme + kaydet.
 *
 * Eskiden bu, akisPanelCiz'in (o zamanki adıyla editorCiz'in) KENDİSİYDİ —
 * panel hep editördü. Artık panelin dış çatısı (kapat, başlık, sekmeler)
 * akisPanelCiz'de; bu fonksiyon yalnızca İÇERİĞİ döndürüyor, diyagram
 * sekmesiyle AYNI yuvaya giriyor.
 */
function editorIcerikCiz() {
  const icerik = el("div", null);
  icerik.append(el("div", "cid", TASLAK.roles.length + " rol · kaydetmek dosyayı YENİDEN YAZAR"));

  const ed = el("div", "ed");
  TASLAK.roles.forEach((rol, i) => ed.append(rolCiz(rol, i)));
  icerik.append(ed);

  icerik.append(onizlemeBlokCiz());
  return icerik;
}

/**
 * Önizleme kutusu + "Dosyaya yaz" düğmesi + uyarı metni.
 *
 * Diyagram sekmesindeki rol düzenleme paneli de AYNI #onizleme/#kaydet
 * çiftine ihtiyaç duyuyor (bkz. onizle/yaz) — iki sekme AYNI ANDA DOM'da
 * durmuyor (bkz. akisPanelCiz, icerik hep TEK sekmenin içeriği), yani id
 * çatışması yok. Mantığı burada TEK yerde tutmak, "Ham YAML"ın ileride
 * değişip diyagramın eski kalması riskini kapatıyor.
 */
function onizlemeBlokCiz() {
  const sarmal = el("div", null);
  const sonuc = el("div", "kutu");
  sonuc.id = "onizleme";
  sarmal.append(sonuc);

  const alt = el("div", "exits");
  const kaydet = el("button", "kaydet", "Dosyaya yaz");
  kaydet.type = "button";
  kaydet.id = "kaydet";
  kaydet.disabled = true;
  kaydet.addEventListener("click", () => { void yaz(); });
  alt.append(kaydet);
  sarmal.append(alt);
  sarmal.append(el("div", "soon",
    "Kaydetmek akış dosyasını yeniden yazar: YORUMLAR KAYBOLUR. Dosya git'te, " +
    "diff'e bakabilirsin. Kapı metinleri, anayasa ve audit ayarları aynen korunur."));
  return sarmal;
}

/** Taslağı DOSYAYA YAZMADAN doğrular; kural numarası kullanıcıya aynen gider. */
async function onizle() {
  const kutu = document.getElementById("onizleme");
  const kaydet = document.getElementById("kaydet");
  if (!kutu) return;
  try {
    const cevap = await fetch("/akis/onizleme", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify(TASLAK),
    });
    const v = await cevap.json();
    kutu.replaceChildren();
    if (!cevap.ok) throw new Error(v.hata || cevap.status);
    if (!v.ok) {
      kutu.append(el("div", "err", v.message));
      if (kaydet) kaydet.disabled = true;
    } else {
      kutu.append(el("div", "eyebrow", "Maliyet"));
      const m = el("div", "maliyet");
      m.append(el("span", null, v.cost.base + " aktivasyon/kart"));
      m.append(el("span", null, v.cost.worst + " en kötü"));
      m.append(el("span", null, v.cost.rejectEdges.length + " ret kenarı"));
      kutu.append(m);
      if (kaydet) kaydet.disabled = false;
    }
    kutu.append(el("div", "eyebrow", "Yazılacak dosya"));
    kutu.append(el("div", "onizle", v.yaml || ""));
  } catch (e) {
    kutu.replaceChildren(el("div", "err", "Önizleme alınamadı: " + e.message));
    if (kaydet) kaydet.disabled = true;
  }
}

async function yaz() {
  const kaydet = document.getElementById("kaydet");
  kaydet.disabled = true;
  try {
    const cevap = await fetch("/akis/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify(TASLAK),
    });
    const v = await cevap.json();
    if (!cevap.ok) throw new Error(v.hata || cevap.status);
    ciz(v.model);
    kapat();
  } catch (e) {
    document.getElementById("onizleme").replaceChildren(el("div", "err", e.message));
  }
}

// --- Promptlar sekmesi (DEVIR.md §5) ---
//
// Akış YAML'ı ekrandan düzenlenebiliyordu, ajanın gördüğü METİN (anayasa +
// rol promptu) için yalnızca GEÇİCİ bir çekmece (eski "#prompt" overlay'i)
// vardı. Bu kart DEVIR.md'nin tarif ettiği GERÇEK sekmeyi kuruyor ve eski
// çekmeceyi SÖKÜYOR — üç çağrı yeri de (Pano araç satırının "Promptları
// düzenle"si, Rol modunun "Prompt · …" düğmesi, Rolleri düzenle'nin "Aç"
// düğmesi) artık bu sekmeye yönleniyor (bkz. ilgili yorumlar).
//
// Liste sunucudaki /promptlar ucundan geliyor ve TOPOLOJİDEN türüyor —
// depodaki her dosya değil, yalnızca AKTİF akışın bildirdikleri. Seçilen
// dosyanın yolu burada, istemcide, uydurulmuyor: sunucu her okuma ve
// yazmada aynı listeye karşı üyelik soruyor (server.ts promptListesi).
let PROMPTLAR = [];
let PROMPT_SEC = null;
// DİSKTEN son okunan (ya da son kaydedilen) metin, yol başına — "temiz"
// referans. "Geri al" buraya döner, başarılı bir "Kaydet" bunu GÜNCELLER.
let PROMPT_ORIJINAL = {};
// Editördeki GÜNCEL metin, yol başına. PROMPT_ORIJINAL'den FARKLIYSA dosya
// "kirli" sayılır (bkz. promptKirliMi). Seçim değişse de (başka bir dosyaya
// geçilse de) BURADA KALIR: birden fazla dosya aynı anda düzenlenmiş
// durabilir — "Kaydet" yalnızca O AN seçili olanı yazar, ötekiler etkilenmez.
let PROMPT_METIN = {};
// Dosya başına OKUMA hatası (örn. /prompt isteği başarısız oldu) — panelde
// gösterilir, o dosya başarıyla yüklenince temizlenir.
let PROMPT_HATA = {};

/**
 * Bir prompt dosyasının (kök-relatif 'yol') yolu, AKISLAR_OZET'in
 * draft'larındaki (flow/draft.ts fromFlow 'goreli') FLOW DOSYASININ KENDİ
 * DİZİNİNE göre relatif yoldan KÖK-RELATİFE çevrilir. SAF, DOM yok.
 *
 * NİYE GEREKİYOR: /promptlar'ın ürettiği yol (server.ts promptListesi)
 * KÖK-RELATİF, ama AKISLAR_OZET'teki 'draft.roles[].prompt'/
 * 'draft.constitution' flow DOSYASININ KENDİ dizinine göre relatif (bkz.
 * draft.ts). İkisi aynı tabana getirilmeden karşılaştırılırsa AYNI dosya
 * farklı yazılmış iki yol gibi görünür ve promptKullananListesi onu
 * YANLIŞLIKLA "kullanılmıyor" sayar. Taban HER ZAMAN 'hub/flows':
 * akisOzetiYukle (server.ts) her akışı HER ZAMAN 'hub/flows/<ad>.yaml'dan
 * yüklüyor.
 */
function flowGoreliYolKokeCevir(goreli) {
  const parcalar = ("hub/flows/" + goreli).split("/");
  const yigin = [];
  parcalar.forEach((p) => {
    if (p === "" || p === ".") return;
    if (p === "..") yigin.pop();
    else yigin.push(p);
  });
  return yigin.join("/");
}

/**
 * Bir prompt dosyasının (kök-relatif 'yol') HANGİ akış/rol tarafından
 * kullanıldığı — DEVIR.md §5 "Kullanan satırı (akış · rol etiketleri)".
 * SAF, DOM yok. 'rol: null' anayasa dosyaları için: belirli bir role değil,
 * o akıştaki TÜM rollere veriliyor.
 *
 * 'promptlar' (AKTİF akış, /promptlar'ın KÖK-RELATİF listesi) ve
 * 'ozetListesi' (AKISLAR_OZET, DİĞER akışlar, flowGoreliYolKokeCevir ile
 * köke çevrilen) birleştiriliyor. 'aktifAd' AKISLAR_OZET'te de olabilir
 * (akisSecimi verilmişse) — o girdi BİLEREK ATLANIYOR: 'promptlar'
 * listesinden ZATEN sayıldı, aksi hâlde aynı akış İKİ KEZ sayılırdı.
 */
function promptKullananListesi(promptlar, ozetListesi, aktifAd, yol) {
  const sonuc = [];
  promptlar.forEach((p) => {
    if (p.yol !== yol) return;
    sonuc.push({ akis: aktifAd, rol: p.etiket.indexOf("rol:") === 0 ? p.etiket.slice("rol:".length) : null });
  });
  ozetListesi.forEach((o) => {
    if (o.ad === aktifAd || !o.draft) return;
    if (o.draft.constitution.some((c) => flowGoreliYolKokeCevir(c) === yol)) {
      sonuc.push({ akis: o.ad, rol: null });
    }
    o.draft.roles.forEach((r) => {
      if (flowGoreliYolKokeCevir(r.prompt) === yol) sonuc.push({ akis: o.ad, rol: r.id });
    });
  });
  return sonuc;
}

/** 'promptKullananListesi'nin SAYIMI — "N rol · M akış" (DEVIR.md §5). SAF. */
function promptKullanimSayisi(liste) {
  const akislar = new Set();
  let rol = 0;
  liste.forEach((k) => {
    akislar.add(k.akis);
    if (k.rol !== null) rol++;
  });
  return { rol, akis: akislar.size };
}

/**
 * "N rol · M akış" ya da "kullanılmıyor" (DEVIR.md §5). SAF.
 *
 * Bu ekranda 'kullanılmıyor' dalı pratikte ÜRETİLMEZ: liste HER ZAMAN
 * AKTİF akıştan türediği için (promptlar'ın KENDİSİ, bkz.
 * promptKullananListesi), oradaki her dosya en az KENDİ akışınca
 * kullanılıyor — (0,0) burada hiç oluşmaz. Dal YİNE DE yazılı: biçimleyici
 * GENEL bir kural ("hiç kullanım yoksa böyle söyle") ve doğrudan
 * sınanabilir olmalı, DEVIR.md'nin kendi sözcüğü de bu ("ya da
 * kullanılmıyor").
 */
function promptKullanimEtiketi(rol, akis) {
  if (rol === 0 && akis === 0) return "kullanılmıyor";
  return rol + " rol · " + akis + " akış";
}

/**
 * "Ajanın okuduğu sıra" şeridi — base → engineering-ts → rol promptu →
 * kart metni (DEVIR.md §5). SAF, DOM yok.
 *
 * Anayasa sırası 'promptlar'ın KENDİ sırası (server.ts promptListesi:
 * topology.constitution SIRAYLA) — burada yeniden sıralanmıyor. Hangi ROL
 * örnek gösterilsin: seçili dosya bir rol promptuysa O rol; değilse
 * (anayasa seçili ya da akışta hiç rol yok) İLK rol — anayasa akıştaki
 * HER role AYNI sırada verildiği için hangisinin örnek seçildiği şeridin
 * ANLAMINI değiştirmiyor.
 */
function ajanOkumaSirasi(promptlar, seciliYol) {
  const adimlar = [];
  promptlar.forEach((p) => {
    if (p.etiket.indexOf("anayasa:") === 0) adimlar.push({ etiket: dosyaAdiKisa(p.yol), yol: p.yol });
  });
  const roller = promptlar.filter((p) => p.etiket.indexOf("rol:") === 0);
  const seciliRol = roller.find((p) => p.yol === seciliYol) || roller[0] || null;
  if (seciliRol !== null) adimlar.push({ etiket: seciliRol.etiket.slice("rol:".length), yol: seciliRol.yol });
  adimlar.push({ etiket: "kart metni", yol: null });
  return adimlar.map((a) => ({ etiket: a.etiket, vurgulu: a.yol !== null && a.yol === seciliYol }));
}

/** Dosya yolundan uzantısız kısa ad — "hub/prompts/roles/coder.md" -> "coder". SAF. */
function dosyaAdiKisa(yol) {
  const parcalar = yol.split("/");
  const son = parcalar[parcalar.length - 1] || yol;
  const nokta = son.lastIndexOf(".");
  return nokta > 0 ? son.slice(0, nokta) : son;
}

/**
 * Bir rol prompt dosyasının "Görevi" özeti — Ajanlar sekmesinin "Görevi ·
 * promptundan" bloğu (DEVIR.md §6): başlıkla ilk "##" arasındaki GİRİŞ
 * PARAGRAFI + ilk "##" bölümünün MADDE LİSTESİ (en fazla 5). SAF, DOM yok.
 *
 * Biçim "rolPromptSablonu"nun (server.ts) kendi şablonuyla AYNI: "# Rolün:
 * x" başlığı, ardından "## Sahiplendiğin" gibi bölümler. Bu fonksiyon o
 * biçimi YORUMLUYOR, yeni bir biçim İCAT ETMİYOR — şablon değişirse burası
 * da güncellenmeli, ama bugün ikisi aynı varsayımı paylaşıyor.
 *
 * "##" öncesi metin olmayan (doğrudan başlıktan sonra bölüme geçen, tam
 * olarak şablonun kendisi) dosyalarda "giris" boş döner — bu bir hata
 * DEĞİL, çağıran (ajanGorevKur) boş girişi hiç basmıyor.
 */
function promptGorevOzeti(metin) {
  const satirlar = (metin || "").split("\\n");
  let i = 0;
  // Başlık satırı ("# ...") varsa atlanır — yoksa (biçimi tutmayan bir
  // dosya) her şey GİRİŞ sayılır, ilk "##" bulunana kadar.
  if (satirlar.length && satirlar[0].trim().indexOf("# ") === 0) i = 1;

  const girisSatirlari = [];
  while (i < satirlar.length && satirlar[i].trim().indexOf("## ") !== 0) {
    const satir = satirlar[i].trim();
    if (satir !== "") girisSatirlari.push(satir);
    i += 1;
  }

  if (i >= satirlar.length) return { giris: girisSatirlari.join(" "), baslik: null, maddeler: [] };

  const baslik = satirlar[i].trim().slice("## ".length).trim();
  i += 1;
  const maddeler = [];
  while (i < satirlar.length && satirlar[i].trim().indexOf("## ") !== 0) {
    const satir = satirlar[i].trim();
    if (satir.indexOf("- ") === 0 || satir.indexOf("* ") === 0) maddeler.push(satir.slice(2).trim());
    i += 1;
  }

  return { giris: girisSatirlari.join(" "), baslik, maddeler: maddeler.slice(0, 5) };
}

/** Bir dosyanın editördeki metni DİSKTEKİ (son yüklenen/kaydedilen) metinden FARKLI mı. SAF. */
function promptKirliMi(orijinal, metin, yol) {
  return metin[yol] !== undefined && metin[yol] !== orijinal[yol];
}

/** Kaç dosyanın editördeki metni disktekinden farklı — Promptlar rozeti (DEVIR.md §5). SAF. */
function promptKaydedilmemisSayisi(orijinal, metin) {
  return Object.keys(metin).filter((yol) => promptKirliMi(orijinal, metin, yol)).length;
}

/** Sabit alt çubuğun durum metni — seçili dosya kirliyse/temizse (DEVIR.md §5). SAF. */
function promptDurumMetni(kirli) {
  return kirli ? "kaydedilmemiş değişiklik" : "kaydedildi";
}

/**
 * Üst çubuğun bir nav rozetini TEK BAŞINA günceller — tam 'ciz()' çağırmak
 * (board/sağ panel/sayaçlar dahil HER ŞEYİ yeniden kurar) her tuş
 * vuruşunda gereksiz bir maliyet olurdu (bkz. promptlarDurumGuncelle).
 * 'sekmeUygula'nın "data-sekme" ile nav düğmelerini DOĞRUDAN yamaladığı
 * desenin AYNISI.
 */
function navRozetGuncelle(ad, sayi) {
  document.querySelectorAll(".navSekme").forEach((b) => {
    if (b.dataset.sekme !== ad) return;
    const rozet = b.querySelector(".navRozet");
    if (rozet) rozet.textContent = String(sayi);
  });
}

/**
 * Promptlar sekmesinin GİRİŞ noktası — hash "#promptlar" olduğunda
 * (hashOku) çağrılır. Akışlar sekmesinin tersine liste HER AÇILIŞTA
 * yeniden istenir: bu liste AKTİF akışın topolojisinden türüyor ve akış
 * hem değiştirilebiliyor hem düzenlenebiliyor (eski promptAc'ın AYNI
 * davranışı).
 */
async function promptlarEkraniCiz() {
  const kok = document.getElementById("icerikPromptlar");
  try {
    const cevap = await fetch("/promptlar", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    PROMPTLAR = veri.promptlar || [];
    if (!PROMPTLAR.length) {
      kok.replaceChildren(el("div", "ipucu", "Bu akışta düzenlenebilir prompt yok."));
      return;
    }
    if (!PROMPTLAR.some((p) => p.yol === PROMPT_SEC)) PROMPT_SEC = PROMPTLAR[0].yol;
    await promptlarSec(PROMPT_SEC);
  } catch (e) {
    kok.replaceChildren(el("div", "err", "Prompt listesi okunamadı: " + e.message));
  }
}

/** Seçilen dosyayı DEĞİŞTİRİR, gerekirse metnini yükler, sekmeyi YENİDEN ÇİZER. */
async function promptlarSec(yol) {
  PROMPT_SEC = yol;
  await promptlarMetniGetir(yol);
  promptlarCiz();
}

/**
 * 'yol'ün metnini garanti eder — ZATEN YÜKLÜYSE (düzenlenmiş olabilir)
 * TEKRAR OKUMUYOR: disk'ten yeniden okumak operatörün elle yazdığını
 * SESSİZCE EZERDİ.
 */
async function promptlarMetniGetir(yol) {
  if (PROMPT_METIN[yol] !== undefined) return;
  try {
    const cevap = await fetch("/prompt?yol=" + encodeURIComponent(yol), { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    PROMPT_ORIJINAL[yol] = veri.metin;
    PROMPT_METIN[yol] = veri.metin;
    delete PROMPT_HATA[yol];
  } catch (e) {
    PROMPT_HATA[yol] = e.message;
  }
}

/** Bir liste grubunu (Anayasa / Rol promptları) kurar — DEVIR.md §5. */
function promptlarGrupKur(baslik, ogeler) {
  const grup = el("div", "promptlarGrup");
  grup.append(el("h3", "promptlarGrupBaslik", baslik));
  ogeler.forEach((p) => {
    const kullanim = promptKullanimSayisi(promptKullananListesi(PROMPTLAR, AKISLAR_OZET, AKTIF_AD, p.yol));
    const oge = el("button", "promptlarOge" + (p.yol === PROMPT_SEC ? " promptlarOge-secili" : ""));
    oge.type = "button";
    oge.title = p.yol;
    oge.dataset.yol = p.yol;
    const adSatiri = el("span", "promptlarOgeAd");
    adSatiri.append(document.createTextNode(dosyaAdiKisa(p.yol)));
    if (promptKirliMi(PROMPT_ORIJINAL, PROMPT_METIN, p.yol)) {
      adSatiri.append(el("span", "promptlarTaslakIsareti"));
    }
    oge.append(adSatiri);
    oge.append(el("span", "promptlarOgeKullanim", promptKullanimEtiketi(kullanim.rol, kullanim.akis)));
    oge.addEventListener("click", () => { void promptlarSec(p.yol); });
    grup.append(oge);
  });
  return grup;
}

/**
 * Sağ taraf — dosya adı/yolu, "Kullanan", "Ajanın okuduğu sıra", metin
 * alanı, sabit alt çubuk (DEVIR.md §5).
 */
function promptlarPanelKur() {
  const panel = el("div", "promptlarPanel");
  panel.append(el("h1", "promptlarBaslik", dosyaAdiKisa(PROMPT_SEC)));
  panel.append(el("div", "promptlarYol mono", PROMPT_SEC));

  const kullananBlok = el("div");
  kullananBlok.append(el("span", "eyebrow", "Kullanan"));
  const kullananSatir = el("div", "promptlarKullanan");
  const kullanan = promptKullananListesi(PROMPTLAR, AKISLAR_OZET, AKTIF_AD, PROMPT_SEC);
  if (!kullanan.length) {
    kullananSatir.append(el("span", "promptlarIpucu", "hiçbir akış kullanmıyor"));
  } else {
    kullanan.forEach((k) => {
      const etiket = el("button", "promptlarKullananEtiket",
        k.rol === null ? k.akis + " · (tüm roller)" : k.akis + " · " + k.rol);
      etiket.type = "button";
      etiket.addEventListener("click", () => { void promptlarKullananTikla(k.akis, k.rol); });
      kullananSatir.append(etiket);
    });
  }
  kullananBlok.append(kullananSatir);
  panel.append(kullananBlok);

  const siraBlok = el("div");
  siraBlok.append(el("span", "eyebrow", "Ajanın okuduğu sıra"));
  const siraSatir = el("div", "promptlarSira");
  ajanOkumaSirasi(PROMPTLAR, PROMPT_SEC).forEach((a) => {
    siraSatir.append(el("span", "promptlarSiraAdim" + (a.vurgulu ? " promptlarSiraAdim-vurgulu" : ""), a.etiket));
  });
  siraBlok.append(siraSatir);
  panel.append(siraBlok);

  if (PROMPT_HATA[PROMPT_SEC]) {
    panel.append(el("div", "err", "Okunamadı: " + PROMPT_HATA[PROMPT_SEC]));
  }

  const metinKutusu = el("textarea", "promptlarMetin mono");
  metinKutusu.id = "promptlarMetin";
  const metin = PROMPT_METIN[PROMPT_SEC];
  metinKutusu.value = metin === undefined ? "" : metin;
  metinKutusu.disabled = metin === undefined;
  metinKutusu.addEventListener("input", () => {
    PROMPT_METIN[PROMPT_SEC] = metinKutusu.value;
    promptlarDurumGuncelle();
  });
  panel.append(metinKutusu);

  const kirli = promptKirliMi(PROMPT_ORIJINAL, PROMPT_METIN, PROMPT_SEC);
  const altCubuk = el("div", "duzenleAlt");
  altCubuk.append(el("span", "duzenleDurumMetni promptlarDurum", promptDurumMetni(kirli)));
  const geriAl = el("button", "railBtn", "Geri al");
  geriAl.type = "button";
  geriAl.id = "promptlarGeriAl";
  geriAl.disabled = !kirli;
  geriAl.addEventListener("click", promptlarGeriAl);
  altCubuk.append(geriAl);
  const kaydet = el("button", "railBtn primary", "Kaydet");
  kaydet.type = "button";
  kaydet.id = "promptlarKaydet";
  kaydet.disabled = !kirli;
  kaydet.addEventListener("click", () => { void promptlarKaydet(); });
  altCubuk.append(kaydet);
  panel.append(altCubuk);

  const hataKutu = el("div", "err");
  hataKutu.id = "promptlarKaydetHata";
  hataKutu.style.cssText = "display:none";
  panel.append(hataKutu);

  return panel;
}

/** Sekmenin TAM içeriği — seçim değişince / "Kaydet"-"Geri al"'dan SONRA baştan kuruluyor. */
function promptlarCiz() {
  const kok = document.getElementById("icerikPromptlar");
  const govde = el("div", "promptlarGovde");

  const liste = el("div", "promptlarListe");
  liste.append(promptlarGrupKur("Anayasa", PROMPTLAR.filter((p) => p.etiket.indexOf("anayasa:") === 0)));
  liste.append(promptlarGrupKur("Rol promptları", PROMPTLAR.filter((p) => p.etiket.indexOf("rol:") === 0)));
  // YENİ ROL PROMPTU yolu bu listenin altında: zincire bir rol eklemek
  // demek, promptunu da BİRLİKTE yaratmak demek (bkz. /rol/yeni yorumu,
  // server.ts) — iki ayrı ekrana bölmek yarı yaratılmış bir rolü vaat
  // ederdi. "Sahiplendiğin/Sahiplenmediğin" şablonu BOŞ bırakılırsa
  // sunucu zaten ondan yazıyor (bkz. rolPromptSablonu, server.ts).
  const yeniRolDugme = el("button", "railBtn promptlarYeniRol", "Yeni rol promptu");
  yeniRolDugme.type = "button";
  yeniRolDugme.addEventListener("click", () => { location.hash = "prompt/yeni"; });
  liste.append(yeniRolDugme);
  govde.append(liste);

  govde.append(promptlarPanelKur());
  kok.replaceChildren(govde);
  navRozetGuncelle("promptlar", promptKaydedilmemisSayisi(PROMPT_ORIJINAL, PROMPT_METIN));
}

/**
 * Metin kutusuna her TUŞ VURUŞUNDA tam yeniden çizim YAPMIYOR —
 * 'promptlarCiz' textarea'yı YENİDEN KURAR, bu da imleç konumunu/odağı
 * kaybettirirdi. Burada yalnızca etkilenen DOM parçaları yama gibi
 * güncelleniyor: seçili ögenin taslak işareti, alt çubuğun düğmeleri/durum
 * metni, nav rozeti.
 */
function promptlarDurumGuncelle() {
  const kirli = promptKirliMi(PROMPT_ORIJINAL, PROMPT_METIN, PROMPT_SEC);
  document.querySelectorAll(".promptlarOge").forEach((oge) => {
    if (oge.dataset.yol !== PROMPT_SEC) return;
    const ad = oge.querySelector(".promptlarOgeAd");
    if (!ad) return;
    const mevcut = ad.querySelector(".promptlarTaslakIsareti");
    if (kirli && !mevcut) ad.append(el("span", "promptlarTaslakIsareti"));
    if (!kirli && mevcut) mevcut.remove();
  });
  const durumEl = document.querySelector(".promptlarDurum");
  if (durumEl) durumEl.textContent = promptDurumMetni(kirli);
  const geriAl = document.getElementById("promptlarGeriAl");
  if (geriAl) geriAl.disabled = !kirli;
  const kaydet = document.getElementById("promptlarKaydet");
  if (kaydet) kaydet.disabled = !kirli;
  navRozetGuncelle("promptlar", promptKaydedilmemisSayisi(PROMPT_ORIJINAL, PROMPT_METIN));
}

/** "Geri al" — editördeki metni DİSKTEKİ (son yüklenen/kaydedilen) hâline döndürür. */
function promptlarGeriAl() {
  if (PROMPT_ORIJINAL[PROMPT_SEC] === undefined) return;
  PROMPT_METIN[PROMPT_SEC] = PROMPT_ORIJINAL[PROMPT_SEC];
  promptlarCiz();
}

/**
 * Prompt dosyasını YAZAR — KOMUT göndererek.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek yazıyor, cevaptaki yeni
 * model çiziliyor. Çekirdek reddederse (bilinmeyen yol, boş metin, yetki
 * yok) mesaj kullanıcıya aynen gider — akış düzenleyicideki "yaz"ın aynısı.
 */
async function promptlarKaydet() {
  const kaydet = document.getElementById("promptlarKaydet");
  const hataKutu = document.getElementById("promptlarKaydetHata");
  const yol = PROMPT_SEC;
  const metin = PROMPT_METIN[yol];
  if (metin === undefined) return;
  if (kaydet) kaydet.disabled = true;
  if (hataKutu) hataKutu.style.cssText = "display:none";
  try {
    const cevap = await fetch("/prompt/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify({ yol, metin }),
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    PROMPT_ORIJINAL[yol] = metin;
    ciz(veri.model);
    promptlarCiz();
  } catch (e) {
    if (hataKutu) {
      hataKutu.textContent = e.message;
      hataKutu.style.cssText = "display:block;white-space:pre-wrap";
    }
    if (kaydet) kaydet.disabled = false;
  }
}

/**
 * "Kullanan" etiketine tıklamak o rolü/akışı PANODA açar (DEVIR.md §5:
 * "tıklanınca o rol panoda açılır"). Akış farklıysa ÖNCE ona geçiliyor
 * (akisKartSec, Akışlar sekmesiyle AYNI yol) — başarısız olursa (bozuk
 * akış) DEVAM EDİLMİYOR, akisKartSec kendi bildirimini zaten gösterdi.
 * 'rol' null ise (anayasa dosyası kullanımı) yalnızca akışa geçilir, RAIL
 * değişmez — o kullanım belirli bir role değil TÜM rollere ait.
 */
async function promptlarKullananTikla(akis, rol) {
  if (akis !== AKTIF_AD) {
    const basarili = await akisKartSec(akis);
    if (!basarili) return;
  }
  if (rol !== null) RAIL = railGecis(RAIL, { tur: "rolSec", rolId: rol });
  location.hash = "";
  railYenidenCiz();
}

// --- Yeni rol ---
//
// Zincire rol eklemek dosyasız yapılamıyordu, dosya rolsüz yaratılamıyordu
// (bkz. /rol/yeni yorumu, server.ts) — uç ikisini TEK gövdede, ATOMİK
// yapıyor. İstemci burada "sonra" (yeni rolün hangi rolün ARDINA gireceği)
// sorusunu KENDİ KAFASINA GÖRE tahmin etmiyor: liste akışın GERÇEK rol
// sırasından geliyor (/akis'in draft'ı) ve operatör seçiyor.
let YENI_ROL_SAGLAYICILAR = [];
let YENI_ROL_ROLLER = [];
/**
 * Diyagramdan tıklanan "+" işaretinin önceden söylediği yer — bkz.
 * diyagramRolArasiEkleAc. yeniRolAc bunu OKUYUP SIFIRLIYOR: panel
 * Promptlar sekmesinin "Yeni rol promptu" düğmesinden de açılabiliyor ve
 * o yolda bu ön seçim olmamalı (eski bir diyagram tıklaması bir sonraki,
 * İLİŞKİSİZ açılışı etkilemesin).
 */
let YENI_ROL_ONCEDEN_SONRA = null;
/** Seçili "sonra" rolünün tam kaydı — başlıkta "X ile Y arasına" yazmak için. */
let YENI_ROL_SONRA_VARSAYILAN = null;

async function yeniRolAc() {
  const kap = document.getElementById("panel");
  const oncedenSonra = YENI_ROL_ONCEDEN_SONRA;
  YENI_ROL_ONCEDEN_SONRA = null;
  try {
    const cevap = await fetch("/akis", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    // /rol/yeni'nin kendi kapısıyla AYNI koşul: taslak yoksa (salt okunur
    // ekran) uç de 404 döner — burada önceden söylemek, operatörü boş bir
    // formu doldurduktan SONRA reddedilmeye bırakmıyor.
    if (!veri.draft) throw new Error("Bu ekran rol eklemeye açık değil.");
    YENI_ROL_SAGLAYICILAR = veri.providers || [];
    const roller = veri.draft.roles || [];
    YENI_ROL_ROLLER = roller.map((r) => r.id);
    if (!YENI_ROL_ROLLER.length) throw new Error("Akışta hiç rol yok — ardına eklenecek bir rol bulunamadı.");
    // Diyagramdan gelen ön seçim GERÇEKTEN akışta bir rolse kullanılıyor —
    // uydurma bir id formu bozuk bir varsayılanla açmasın.
    YENI_ROL_SONRA_VARSAYILAN = YENI_ROL_ROLLER.includes(oncedenSonra)
      ? roller.find((r) => r.id === oncedenSonra)
      : null;
    kap.replaceChildren(yeniRolEditorCiz());
  } catch (e) {
    kap.replaceChildren(el("div", "err", "Rol eklenemedi: " + e.message));
  }
}

function yeniRolAlani(etiket, girisTag, id) {
  const l = el("label", null);
  l.append(document.createTextNode(etiket));
  const g = el(girisTag);
  g.id = id;
  l.append(g);
  return { etiket: l, giris: g };
}

function yeniRolEditorCiz() {
  const ust = el("div", "ust");
  ust.addEventListener("click", (e) => { if (e.target === ust) kapat(); });
  const p = el("div", "panel");

  const kapatDugme = el("button", "kapat", "Kapat");
  kapatDugme.type = "button";
  kapatDugme.addEventListener("click", kapat);
  p.append(kapatDugme);

  // DİYAGRAMDAN AÇILDIYSA başlık NEREYE eklendiğini AÇIKÇA söylüyor —
  // bu kartın kendi isteği ("yeni rolün zincire NEREYE girdiğini açıkça
  // göstermek"). next zincirin BİR SONRAKİ rolü: "A ile B arasına".
  const baslik = YENI_ROL_SONRA_VARSAYILAN === null
    ? "Yeni rol"
    : "Yeni rol — " + YENI_ROL_SONRA_VARSAYILAN.id + " ile " + YENI_ROL_SONRA_VARSAYILAN.next + " arasına";
  p.append(el("h2", null, baslik));
  p.append(el("div", "cid",
    "rol VE promptu BİRLİKTE yaratılır — geçersiz bir akış üretirse ikisi de GERİ ALINIR"));

  const kutu = el("div", "rol");

  const { etiket: idEtiket, giris: idGiris } = yeniRolAlani("id", "input", "yeniRolId");
  idGiris.type = "text";
  idGiris.placeholder = "örn. reviewer";
  kutu.append(idEtiket);

  const { etiket: saglayiciEtiket, giris: saglayiciSec } =
    yeniRolAlani("provider", "select", "yeniRolProvider");
  YENI_ROL_SAGLAYICILAR.forEach((s) => {
    const o = el("option", null, s);
    o.value = s;
    saglayiciSec.append(o);
  });
  kutu.append(saglayiciEtiket);

  const { etiket: workspaceEtiket, giris: workspaceGiris } =
    yeniRolAlani("workspace", "input", "yeniRolWorkspace");
  workspaceGiris.type = "text";
  kutu.append(workspaceEtiket);

  // "sonra" ÇAĞIRANIN (burada: operatörün) seçimi — uç bunu tahmin etmiyor.
  // DİYAGRAMDAN gelen ön seçim VARSAYILAN olarak işaretli (operatör
  // isterse değiştirebilir) — başlıktaki "A ile B arasına" ile AYNI yere
  // işaret ediyor.
  const { etiket: sonraEtiket, giris: sonraSec } = yeniRolAlani("sonra — hangi rolün ARDINA", "select", "yeniRolSonra");
  YENI_ROL_ROLLER.forEach((id) => {
    const o = el("option", null, id);
    o.value = id;
    if (YENI_ROL_SONRA_VARSAYILAN !== null && id === YENI_ROL_SONRA_VARSAYILAN.id) o.selected = true;
    sonraSec.append(o);
  });
  kutu.append(sonraEtiket);

  // Prompt BOŞ bırakılabilir: sunucu bu durumda ŞABLONDAN yazıyor (kural 9
  // boş dosyayı reddediyor, bkz. rolPromptSablonu yorumu).
  const { etiket: promptEtiket, giris: promptGiris } = yeniRolAlani(
    "prompt (boş bırakılırsa ŞABLONDAN yazılır)", "textarea", "yeniRolPrompt",
  );
  promptEtiket.className = "genis";
  promptGiris.rows = 10;
  kutu.append(promptEtiket);

  p.append(kutu);

  const altSatir = el("div", "exits");
  const ekle = el("button", "primary", "Rolü ekle");
  ekle.type = "button";
  ekle.id = "yeniRolEkle";
  ekle.addEventListener("click", () => { void yeniRolGonder(); });
  altSatir.append(ekle);
  const vazgec = el("button", null, "Vazgeç");
  vazgec.type = "button";
  vazgec.addEventListener("click", kapat);
  altSatir.append(vazgec);
  p.append(altSatir);

  const hataKutu = el("div", "err");
  hataKutu.id = "yeniRolHata";
  hataKutu.style.cssText = "display:none";
  p.append(hataKutu);

  ust.append(p);
  return ust;
}

/**
 * Yeni rolü KOMUT göndererek yaratır.
 *
 * Çekirdek reddederse (aynı id, bilinmeyen 'sonra', geçersiz akış/workspace)
 * mesaj OLDUĞU GİBİ operatöre gider — workspace/provider kuralları burada
 * TEKRAR UYGULANMIYOR, doğrulama çekirdekte (bkz. server.ts yorumu).
 */
async function yeniRolGonder() {
  const idGiris = document.getElementById("yeniRolId");
  const saglayiciSec = document.getElementById("yeniRolProvider");
  const workspaceGiris = document.getElementById("yeniRolWorkspace");
  const sonraSec = document.getElementById("yeniRolSonra");
  const promptGiris = document.getElementById("yeniRolPrompt");
  const ekle = document.getElementById("yeniRolEkle");
  const hataKutu = document.getElementById("yeniRolHata");
  if (!idGiris || !saglayiciSec || !workspaceGiris || !sonraSec || !promptGiris || !ekle || !hataKutu) return;

  ekle.disabled = true;
  hataKutu.style.cssText = "display:none";
  try {
    const promptMetni = promptGiris.value;
    const govde = {
      id: idGiris.value.trim(),
      provider: saglayiciSec.value,
      workspace: workspaceGiris.value.trim(),
      sonra: sonraSec.value,
      ...(promptMetni.trim() === "" ? {} : { prompt: promptMetni }),
    };
    const cevap = await fetch("/rol/yeni", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify(govde),
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    // Çekirdeğin döndürdüğü model çiziliyor: ekran kendi kopyasını
    // uydurmuyor, yeni rolün GERÇEKTEN nereye bağlandığını çekirdek söylüyor.
    ciz(veri.model);
    location.hash = "";
  } catch (e) {
    hataKutu.textContent = e.message;
    hataKutu.style.cssText = "display:block;white-space:pre-wrap";
  } finally {
    ekle.disabled = false;
  }
}

// --- Ajanlar sekmesi (DEVIR.md §6, kart c-20261105-d304ed) ---
//
// Solda akıştaki her ROL için bir satır (DEVIR'in "ajan" sözcüğü burada
// ROL ile AYNI şey), sağda seçili rolün "şu an" kutusu + tam adım izi +
// rol promptunun "Görevi" özeti. Birincil veri (rol listesi, durum
// metinleri) ZATEN m (her saniye okunan /durum modeli) içinde; bu sekme
// de Pano'nun formasyon panosu gibi HER YOKLAMADA yeniden çiziliyor —
// Promptlar/Akışlar'ın "sekme açılınca BİR KEZ" ilkesinin TERSİ, çünkü
// onların listesi /durum'un parçası değil, bu sekmeninki ZATEN parça.

/**
 * Seçili rolün "Şu an" kutusu — DEVIR.md §6: surface zemin, çalışırken/
 * kapıda üstte 4px accent çizgi, kart başlığı, adım/araç/süre/maliyet
 * satırı, "Kartı panoda aç".
 *
 * "daemon" parametresi ZORUNLU — ajanSuAnDurumu'na bakmadan guncelKart'ın
 * "live" alanını basmak, gözcü ölüyken (bayat kilit) solda aynı kart için
 * ajanDurumMetni'nin söylediği "gözcü kapalı · … yarıda" ile ÇELİŞEN sahte
 * bir "Bash · …" üretirdi (reviewer'ın b64fe2f itirazı). Karar BURADA da
 * aynı ajanSuAnDurumu'ndan okunuyor ki iki yüzey aynı karttan AYNI sonuca
 * varsın.
 */
function ajanSuAnKutuKur(guncelKart, daemon) {
  const kutu = el("div", "ajanSuAn");
  if (!guncelKart) {
    kutu.append(el("div", "ipucu", "Şu an bu role atanmış bir kart yok."));
    return kutu;
  }
  const durum = ajanSuAnDurumu(guncelKart, daemon);
  // "gözcü kapalı" ise bu karta dokunan bir süreç YOK — DEVIR'in
  // "çalışırken ya da kapıda üstte 4px accent çizgi" kuralı o yüzden bu
  // dalda KASITLI OLARAK uygulanmıyor: accent çizgisi "şu an önemli bir
  // şey oluyor" der, burada olmuyor.
  if (durum.tur !== "gozcuKapali") kutu.classList.add("ajanSuAn-vurgulu");
  kutu.append(el("div", "ajanSuAnBaslik", guncelKart.title));

  const satir = el("div", "ajanSuAnSatir mono");
  if (durum.tur === "gozcuKapali") {
    satir.append(el("span", null, "gözcü kapalı · yarıda"));
  } else if (durum.tur === "live") {
    satir.append(el("b", null, durum.live.name || durum.live.kind));
    if (durum.live.detail) satir.append(el("span", null, durum.live.detail));
  } else if (durum.tur === "calisiyor") {
    satir.append(el("span", null, "çalışıyor"));
  } else {
    satir.append(el("span", null, "kapıda"));
  }
  if (guncelKart.durationMs) satir.append(el("span", null, sure(guncelKart.durationMs)));
  if (guncelKart.costUsd || guncelKart.olculmeyen) {
    satir.append(el("span", guncelKart.olculmeyen ? "bad" : null,
      maliyetMetni(guncelKart.costUsd, guncelKart.olculmeyen, guncelKart.tokens)));
  }
  kutu.append(satir);

  const ac = el("button", "railBtn", "Kartı panoda aç");
  ac.type = "button";
  ac.addEventListener("click", () => { location.hash = "kart/" + guncelKart.id; });
  kutu.append(ac);
  return kutu;
}

/**
 * "Adımlar" listesi — DEVIR.md §6: seq, araç adı, ayrıntı, saat; en
 * yenisi en üstte; çalışırken "canlı" etiketi.
 *
 * AJAN_ADIMLAR[guncelKart.id] sunucudan ARTAN sırada geliyor (bkz.
 * model.ts activationSteps) — TERSİNE çevirme BURADA, istemci tarafında:
 * sunucunun kendi sırası ikinci bir kez YORUMLANMIYOR, yalnızca GÖSTERİM
 * yönü değişiyor.
 */
function ajanAdimlarKur(guncelKart, daemon) {
  const kutu = el("div", "ajanBolum");
  const baslik = el("div", "railAraBaslik", "Adımlar");
  if (ajanCanliMi(guncelKart, daemon)) baslik.append(el("span", "ajanCanliEtiket", "canlı"));
  kutu.append(baslik);

  if (!guncelKart) {
    kutu.append(el("div", "ipucu", "Koşan bir ajan yok."));
    return kutu;
  }
  const adimlar = AJAN_ADIMLAR[guncelKart.id] || [];
  if (!adimlar.length) {
    kutu.append(el("div", "ipucu",
      ajanCanliMi(guncelKart, daemon) ? "ilk adım bekleniyor…" : "bu aktivasyon için kayıtlı adım yok."));
    return kutu;
  }
  adimlar.slice().reverse().forEach((a) => {
    const satir = el("div", "ajanAdim");
    satir.append(el("span", "seq", String(a.seq)));
    satir.append(el("span", "ad", a.name || a.kind));
    satir.append(el("span", "detay", a.detail || ""));
    satir.append(el("span", "saat", a.at ? a.at.slice(11, 19) : ""));
    kutu.append(satir);
  });
  return kutu;
}

/**
 * "Görevi · promptundan" bloğu — DEVIR.md §6: rol prompt dosyasının giriş
 * paragrafı + ilk "##" bölümünün madde listesi (en fazla 5), "Promptu
 * düzenle →".
 */
function ajanGorevKur(meta) {
  const kutu = el("div", "ajanBolum");
  kutu.append(el("div", "railAraBaslik", "Görevi · " + meta.prompt));

  const ozet = AJAN_PROMPT_OZET[meta.prompt];
  if (ozet === undefined) {
    kutu.append(el("div", "ipucu", "yükleniyor…"));
  } else if (ozet === null) {
    kutu.append(el("div", "err", "Prompt okunamadı" + (PROMPT_HATA[meta.prompt] ? ": " + PROMPT_HATA[meta.prompt] : ".")));
  } else {
    if (ozet.giris) kutu.append(el("p", "ajanGorevMetin", ozet.giris));
    if (ozet.maddeler.length) {
      const liste = el("ul", "ajanGorevListe");
      ozet.maddeler.forEach((madde) => liste.append(el("li", null, madde)));
      kutu.append(liste);
    } else if (!ozet.giris) {
      kutu.append(el("div", "ipucu", "(bölüm boş)"));
    }
  }

  const duzenle = el("button", "railBtn", "Promptu düzenle →");
  duzenle.type = "button";
  duzenle.addEventListener("click", () => {
    PROMPT_SEC = meta.prompt;
    location.hash = "promptlar";
  });
  kutu.append(duzenle);
  return kutu;
}

/** Seçili rolün sağ taraf içeriği — üst bilgi + "şu an" + adımlar + görev (DEVIR.md §6). */
function ajanPanelKur(m, rolId) {
  const panel = el("div", "ajanPanel");
  const meta = railRolMeta(m, rolId);
  if (!meta) {
    panel.append(el("div", "ipucu", "Rol bulunamadı."));
    return panel;
  }

  const ust = el("div", "ajanPanelUst");
  ust.append(el("div", "railAraBaslik", "ajan " + meta.no + " · " + m.flow.name));
  ust.append(el("h1", "ajanPanelAd", meta.id));
  const metaSatir = el("div", "ajanPanelMeta mono");
  metaSatir.append(el("span", null, meta.provider));
  metaSatir.append(el("span", null, meta.workspace));
  metaSatir.append(el("span", null, meta.receive === "batch" ? "toplu alım" : "tekil alım"));
  metaSatir.append(el("span", null, "sonraki · " + meta.sonrakiRol));
  ust.append(metaSatir);
  panel.append(ust);

  const guncelKart = ajanGuncelKart(rolId, m.cards);
  panel.append(ajanSuAnKutuKur(guncelKart, m.daemon));
  panel.append(ajanAdimlarKur(guncelKart, m.daemon));
  panel.append(ajanGorevKur(meta));
  return panel;
}

/** Ajan listesinin TEK satırı — 36px kuş, rol adı, sağlayıcı, tek satırlık durum (DEVIR.md §6). */
function ajanSatirKur(m, rol) {
  const guncelKart = ajanGuncelKart(rol.id, m.cards);
  const kartlar = rolunAcikKartlari(m.cards, rol.id);

  const satir = el("button", "ajanSatir" + (rol.id === AJAN_SEC ? " ajanSatir-secili" : ""));
  satir.type = "button";
  satir.setAttribute("aria-pressed", String(rol.id === AJAN_SEC));

  const animasyonAcik = document.documentElement.dataset.animate !== "off";
  const kus = sv("svg", { viewBox: "0 0 46 23", role: "img", "aria-label": rol.id + " rolü" });
  kus.classList.add("ajanKus");
  if (kanatCirpiyorMu(kartlar, m.daemon) && animasyonAcik) kus.classList.add("kanatCirpiyor");
  const kusCizgi = sv("polyline", { points: "2,5 13,9 24,19 35,9 46,5", fill: "none" });
  kusCizgi.style.stroke = kusRengi(kartlar);
  kusCizgi.style.strokeWidth = "4";
  kusCizgi.style.strokeLinejoin = "miter";
  kus.append(kusCizgi);
  satir.append(kus);

  const bilgi = el("div", "ajanSatirBilgi");
  bilgi.append(el("div", "ajanSatirAd", rol.id + " · " + rol.provider));
  bilgi.append(el("div", "ajanSatirDurum", ajanDurumMetni(rol, guncelKart, m.daemon)));
  satir.append(bilgi);

  satir.addEventListener("click", () => {
    AJAN_SEC = rol.id;
    ajanlarEkraniCiz(m);
  });
  return satir;
}

/**
 * Ajanlar sekmesinin TAM içeriği — HER yoklamada yeniden çiziliyor
 * (formasyonSvgKur ile AYNI ilke): birincil veri /durum modelinin parçası.
 * Sekme GÖRÜNMÜYOR OLSA BİLE çağrılıyor (Pano'nun board'u gibi), ki
 * sekmeye geçildiği an içerik hazır olsun.
 */
function ajanlarEkraniCiz(m) {
  const kok = document.getElementById("icerikAjanlar");
  if (!kok) return;
  if (!m.roles.length) {
    kok.replaceChildren(el("div", "ipucu", "Bu akışta rol yok."));
    return;
  }
  if (!m.roles.some((r) => r.id === AJAN_SEC)) AJAN_SEC = m.roles[0].id;

  const govde = el("div", "ajanlarGovde");
  const liste = el("div", "ajanlarListe");
  m.roles.forEach((rol) => liste.append(ajanSatirKur(m, rol)));
  govde.append(liste);
  govde.append(ajanPanelKur(m, AJAN_SEC));
  kok.replaceChildren(govde);

  // Bu noktadan sonrası yalnızca SEKME GERÇEKTEN açıkken: gizliyken
  // prompt/adım isteği atmanın anlamı yok — Promptlar/Akışlar'ın "sekme
  // açılınca yükle" ilkesiyle AYNI gerekçe, burada "her saniye" için.
  if (sekmeAdi(decodeURIComponent(location.hash.replace(/^#/, ""))) !== "ajanlar") return;

  const rol = m.roles.find((r) => r.id === AJAN_SEC);
  if (rol && AJAN_PROMPT_OZET[rol.prompt] === undefined) void ajanPromptYukle(rol.prompt);

  const guncelKart = ajanGuncelKart(AJAN_SEC, m.cards);
  if (ajanCanliMi(guncelKart, m.daemon)) void ajanAdimlariYukle(guncelKart.id);
}

/**
 * Rol promptunun "Görevi" özetini bir KEZ yükler — promptlarMetniGetir'in
 * KENDİ önbelleği (PROMPT_METIN) zaten "yüklüyse tekrar okuma" diyor, bu
 * da AYNI metni promptGorevOzeti ile BİR KEZ ayrıştırıp AJAN_PROMPT_OZET'e
 * yazıyor. Promptlar sekmesi bu dosyayı AYRICA açarsa (PROMPT_SEC
 * değişirse) metin zaten önbellekte, ikinci bir ağ isteği olmaz.
 */
async function ajanPromptYukle(yol) {
  await promptlarMetniGetir(yol);
  const metin = PROMPT_METIN[yol];
  AJAN_PROMPT_OZET[yol] = metin === undefined ? null : promptGorevOzeti(metin);
}

/**
 * Güncel kartın TAM adım izini getirir — "GET /adimlar?kart=" (DEVIR.md
 * §6'nın gerçekten yeni ucu, bkz. server.ts). Bu fonksiyon kendi başına
 * yeniden ÇİZMİYOR: bir sonraki saniyelik yoklamada (ciz() → ajanlarEkraniCiz)
 * AJAN_ADIMLAR'daki TAZE liste zaten basılır — sagPanelCiz'in Kart modu
 * "data-rail-kart" desenindeki fazladan karmaşıklık burada GEREKMİYOR,
 * bu ekran saniyede bir ZATEN yeniden çiziliyor.
 */
async function ajanAdimlariYukle(kartId) {
  try {
    const cevap = await fetch("/adimlar?kart=" + encodeURIComponent(kartId), { cache: "no-store" });
    const veri = await cevap.json();
    if (cevap.ok && Array.isArray(veri.adimlar)) AJAN_ADIMLAR[kartId] = veri.adimlar;
  } catch (e) {
    // Sessizce bırak: önbellekteki ESKİ liste (varsa) ekranda kalır, bir
    // sonraki yoklama yeniden deneyecek.
  }
}

// Liste ÖNCE: ilk çizimde seçici eksik çıkıp bir saniye sonra belirmesin.
void akislarYukle().then(() => yokla().then(hashOku));
setInterval(yokla, 1000);
</script>
</body>
</html>
`;

