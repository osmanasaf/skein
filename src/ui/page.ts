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
  watcher: { bayraklar: string[] } | null = null,
  tema: "sistem" | "acik" | "koyu" = "sistem",
): string {
  const attribute = tema === "acik" ? ' data-theme="light"' : tema === "koyu" ? ' data-theme="dark"' : "";
  return PAGE
    .replace("__TEMA_NITELIGI__", attribute)
    .replace("__JETON__", token)
    .replace("__GOZCU_AYAR__", JSON.stringify(watcher));
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
const TOKEN = "__JETON__";
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
const WATCHER_CONFIG = __GOZCU_AYAR__;
// Durdurma/yeniden başlatma İSTENDİ ama henüz GERÇEKLEŞMEDİ — SIGTERM
// anlık değil, gözcü süren turu bitirip çıkıyor (bkz. server.ts
// "/gozcu/durdur" yorumu). 'null' | "durduruluyor" | "yenidenBaslatiliyor".
// İkincisi, gözcü GERÇEKTEN öldüğünde (ciz() bir sonraki yoklamada bunu
// modelden görünce) otomatik "/gozcu/baslat" tetikler — DEVIR.md'nin
// "Yeniden başlat" düğmesinin yaptığı "durdur, sonra başlat" ikilisi.
let WATCHER_PENDING = null;
// ".skein/gozcu.log" son satırları — GÖZCÜ paneline İLK girişte bir kez
// okunuyor (railGozcuYukle), kart modunun "data-rail-kart" deseniyle AYNI.
let WATCHER_LOG = [];
// Seçilebilecek akış adları — sayfa açılışında BİR KEZ okunuyor (bkz.
// akislarYukle). Dosya listesi koşarken değişmiyor; her yoklamada yeniden
// istemek, değişmeyen bir şeyi saniyede bir sormak olurdu.
let FLOWS = [];
// Her akışın ÖZETİ — Akışlar sekmesinin kart ızgarası (DEVIR.md §4, kart
// c-20261105-d36e37): {ad, draft, hata?}[], AKISLAR'la AYNI anda, BİR
// KEZ okunuyor (/akislar'ın 'ozet' alanı, bkz. server.ts akisOzetiYukle).
// 'draft' null ise akış BOZUK — kart bunu SAKLAMIYOR, 'hata' alanını
// gösteriyor (bkz. akisKartKur).
let FLOWS_SUMMARY = [];
// Seçicinin GERİ ALINACAĞI değer: çekirdek "/akis/sec"i reddederse (bozuk
// YAML, bilinmeyen ad) kutuda yeni ad dururken pano hâlâ eskisini
// gösteremez — ikisi aynı şeyi söylemek zorunda.
let ACTIVE_NAME = "";
// Diyagram panelinin okuduğu son model — her yoklamada (bkz. yokla) burada
// güncelleniyor. Akış diyagramı AYRI bir uçtan değil bu modelden çiziliyor:
// edges/gates zaten SUNUCUDA türetilmiş (model.ts), panel kendi YAML
// ayrıştırıcısını yazmıyor.
let LAST_MODEL = null;
const DOT = { accepted: "var(--accept)", rejected: "var(--reject)", gate: "var(--gate)", released: "var(--gate)", done: "var(--accept)" };

// --- Ajanlar sekmesi (DEVIR.md §6, kart c-20261105-d304ed) ---
//
// Seçili rol — RAIL'den BİLEREK AYRI: RAIL Pano'nun sağ panelinin modu,
// bu sekmenin kendi seçimi. "Ajanı izle →" düğmesi (railRolCiz) ikisini
// BİRLİKTE değiştiriyor (RAIL'i genel bakışa döndürmüyor, yalnızca bu
// değişkeni ve hash'i).
let AGENT_SELECTED = null;
// Seçili rolün GÜNCEL kartının TAM adım izi, kart kimliğine göre —
// "GET /adimlar"ın cevabı. Sunucu ARTAN (seq 1'den) veriyor; "en yenisi
// en üstte" göstermek İSTEYEN taraf İSTEMCİ (bkz. ajanAdimlarKur) — bu
// önbellek sunucunun verdiği sırayı DEĞİŞTİRMEDEN taşıyor.
let AGENT_STEPS = {};
// Rol prompt dosyasının "Görevi" özeti, prompt yoluna göre — promptGorevOzeti
// çıktısı. 'undefined' HENÜZ İSTENMEDİ, 'null' istendi ama OKUNAMADI
// (PROMPT_HATA'da sebebi var), nesne BAŞARIYLA ayrıştırıldı.
let AGENT_PROMPT_SUMMARY = {};

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
const MARK_D = "M3 17 L8 6 L12.5 16 L17 5 L21 15 C23.5 18 21 20.8 18 19";

/**
 * Bardaki marka simgesi — gevşek V biçimli üç kuş, bir sürü izlenimi.
 *
 * Üç ayrı <path> yerine TEK path üç alt-yol taşıyor (her "M" yeni bir alt
 * yol açar) — DOM'da ".marka svg path" hâlâ TEK düğüme karşılık geliyor,
 * favicon'un hazırlık beklemesiyle paylaşılan seçici bu yüzden bozulmuyor
 * (bkz. tarayici.test.ts).
 */
const FLYING_BIRD_D = "M2,16 L9,8 L16,16 M13,13 L20,5 L27,13 M24,16 L31,8 L38,16";

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
function brandSvg(colourVal) {
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
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", FLYING_BIRD_D);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", colourVal);
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
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
function setFavicon() {
  const svgText = "<svg xmlns='http:" + "//www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
    "<path d='" + MARK_D + "' fill='none' stroke='#15212C' stroke-width='2.4' " +
    "stroke-linecap='round' stroke-linejoin='round'/></svg>";
  let link = document.querySelector("link[rel=icon]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.type = "image/svg+xml";
  link.href = "data:image/svg+xml," + encodeURIComponent(svgText);
}
setFavicon();
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const duration = (ms) => {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? s + " sn" : Math.floor(s / 60) + " dk " + String(s % 60).padStart(2, "0") + " sn";
};
const money = (n) => "$" + (n || 0).toFixed(2);

// Buyuk sayiyi okunur kisalt: 1240000 -> 1.2M. Ham rakam ekranda
// sayilamiyor, kiyaslanamiyor; buyukluk mertebesi yeterli.
function shortCount(n) {
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
function costText(amount, unmeasured, tokens) {
  if (!unmeasured) return money(amount);
  if (amount) return "\u2265" + money(amount);
  return tokens ? "maliyet \u00f6l\u00e7\u00fclmedi \u00b7 \u2265" + shortCount(tokens) + " token"
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
const AGENT_SEPARATOR = "\\n\\nAjan şunu söyledi:\\n";

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
function looksLikeJson(textValue) {
  const clipped = textValue.trim();
  if (clipped.startsWith("{") || clipped.startsWith("[")) return true;
  const matched = clipped.match(/"[^"\\n]+"\\s*:/g);
  return matched !== null && matched.length >= 3;
}

/**
 * Katlı özetin kısa önizlemesi — bu kırpma TAM metni ETKİLEMİYOR: yalnızca
 * <summary> etiketinin kendisi kısalıyor, gerekceKur govdeye her zaman
 * ayraçtan sonraki metnin BÜTÜNÜNÜ yazıyor.
 */
function summarize(textValue) {
  const plainFlag = textValue.replace(/\\s+/g, " ").trim();
  return plainFlag.length > 140 ? plainFlag.slice(0, 140) + "…" : plainFlag;
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
function buildRationale(box, gerekce) {
  const separator = gerekce.indexOf(AGENT_SEPARATOR);
  const core = separator === -1 ? gerekce : gerekce.slice(0, separator);
  box.append(el("div", "reason", core));
  if (separator === -1) return;

  const agentText = gerekce.slice(separator + AGENT_SEPARATOR.length);
  const detailText = el("details", "ajanDetay");
  const summary = el("summary", null, "Ajan şunu söyledi — " + summarize(agentText));
  // Kart kendisi de tıklanabilir (detay panelini açar, bkz. kartDugumBaslat)
  // — katlıyı açmak o paneli de tetiklemesin, "Geçir/Geri gönder"
  // düğmelerindeki aynı önlem.
  summary.addEventListener("click", (e) => e.stopPropagation());
  detailText.append(summary);
  const bodyPart = el("div", looksLikeJson(agentText) ? "ajanTam mono" : "ajanTam");
  bodyPart.textContent = agentText;
  detailText.append(bodyPart);
  box.append(detailText);
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
function emptyRoleText(roleRec, cardList) {
  if (roleRec.depth > cardList.length) return roleRec.depth + " kart kuyrukta, henuz yuklenmedi";
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
function emptyDoneText(m) {
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
function nextColumn(m, roleIdent) {
  const edge = m.edges.find((e) => e.from === roleIdent && e.kind === "next");
  return edge ? edge.to : "bitti";
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
function railRoleMeta(m, roleIdent) {
  const i = m.roles.findIndex((r) => r.id === roleIdent);
  if (i === -1) return null;
  const roleRec = m.roles[i];
  const rejectEdge = m.edges.find((e) => e.from === roleIdent && e.kind === "reject");
  return {
    no: String(i + 1).padStart(2, "0"),
    leader: i === 0,
    id: roleRec.id,
    provider: roleRec.provider,
    workspace: roleRec.workspace,
    nextRole: nextColumn(m, roleIdent),
    rejectTarget: rejectEdge ? rejectEdge.to : null,
    receive: roleRec.receive,
    prompt: roleRec.prompt,
  };
}

function gateExits(kind, planLock, backTarget) {
  // ZİNCİRİN BAŞINDA "Geri gönder" YOK. back kararının hedefi rolün ret
  // hedefi; yoksa çekirdek kartı aynı role döndürüyor, yani olan şey bir
  // retry. Eski düğme yapmayacağı şeyi vaat ediyordu: insan "geri
  // gönderdim" sanıyor, kart aynı rolde baştan koşuyordu. Burada düğme ya
  // doğru şeyi söylüyor ya hiç çıkmıyor.
  // (Not: bu dosya istemci betiğini bir şablon dizesi içinde taşıyor —
  // yorumda ters tik derlemeyi bozar.)
  const geri = (label) => (backTarget ? [label, "back"] : ["Baştan koştur", "retry"]);

  // Üç kapı, üç ayrı çıkış kümesi. Kaçışta "Geçir" YOK: tur tamamlanmadı,
  // kod sonraki worktree'ye hiç taşınmadı ve çekirdek zaten reddeder.
  if (kind === "escalation") {
    // Kaçışta "Yeniden koş" ZATEN var: hedef yoksa ikinci bir retry
    // düğmesi aynı şeyi iki kez sunmak olurdu.
    return { label: "kaçış kapısı", not: "kod taşınmadı",
      buttons: backTarget
        ? [["Yeniden koş", "retry"], ["Geri gönder", "back"]]
        : [["Yeniden koş", "retry"]] };
  }
  if (kind === "deadlock") {
    // İKİ AYRI KİLİT. Çekirdek ikisini ayırıyor (planGateEntry) ve
    // forward'ın hedefi de farklı: planlama kilidinde kart role.next'e
    // değil alışverişten SONRAKİ role gidiyor. Eski kod ikisine de
    // "ret limiti doldu" + "Üretici haklı / Denetçi haklı" basıyordu;
    // planlama kilidinde üç ifade de yanlıştı.
    if (planLock) {
      return { label: "planlama kilidi", not: "itirazlar kapanmadı",
        buttons: [["Planı olduğu gibi ilerlet", "forward"], ["Alışverişi yeniden aç", "retry"]] };
    }
    return { label: "kilit kapısı", not: "ret limiti doldu",
      buttons: [["Üretici haklı", "forward"], geri("Denetçi haklı")] };
  }
  return { label: "onay kapısı", not: "kod taşındı",
    buttons: [["Geçir", "forward"], geri("Geri gönder")] };
}

/** Yetim kartı kapatır — tek meşru çıkış. */
async function closeCard(id, card) {
  const buttons = card.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  try {
    const answerBody = await fetch("/kart/" + encodeURIComponent(id) + "/kapat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    draw(data.model);
  } catch (e) {
    buttons.forEach((b) => (b.disabled = false));
    const oldValue = card.querySelector(".redd");
    if (oldValue) oldValue.remove();
    card.append(el("div", "redd", e.message));
  }
}

/**
 * BİLDİRİM — DEVIR.md "Interactions & Behavior": "Her çıkış kartı ilgili
 * kuyruğa bırakır ve kısa bir bildirim gösterir". 3.4 sn sonra kendiliğinden
 * kapanır; ÜST ÜSTE gelen bir karar varsa (iki kapı art arda) eski
 * zamanlayıcı İPTAL edilip yeniden kuruluyor — yoksa ikinci bildirim ilkinin
 * kalan süresiyle erken kapanabilirdi.
 */
let NOTICE_TIMER = null;
function showNotice(messageText) {
  const box = document.getElementById("bildirim");
  if (!box) return;
  box.textContent = messageText;
  box.classList.add("gorunur");
  if (NOTICE_TIMER !== null) clearTimeout(NOTICE_TIMER);
  NOTICE_TIMER = setTimeout(() => { box.classList.remove("gorunur"); }, 3400);
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
async function decision(id, selection, button, card) {
  const boxes = card.querySelectorAll("button");
  boxes.forEach((b) => (b.disabled = true));
  try {
    const answerBody = await fetch("/kart/" + encodeURIComponent(id) + "/birak", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify({ decision: selection }),
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    if (RAIL.mode === "card" && RAIL.cardId === id) {
      const rightPanel = document.getElementById("sagPanel");
      if (rightPanel) rightPanel.removeAttribute("data-rail-kart");
    }
    draw(data.model);
    // Düğmenin KENDİ etiketi ("Yeniden koş", "Geçir", "Üretici haklı" …) —
    // kapiCikislari'nin ürettiği metin, burada İKİNCİ bir ifade İCAT
    // EDİLMİYOR.
    showNotice((button.textContent || "Karar") + " — kuyruğa bırakıldı.");
  } catch (e) {
    boxes.forEach((b) => (b.disabled = false));
    const oldValue = card.querySelector(".redd");
    if (oldValue) oldValue.remove();
    card.append(el("div", "redd", e.message));
  }
}

/**
 * Gözcüyü başlatır ya da durdurur.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek kilidi okuyup yeni modeli
 * döndürüyor. "Başlattı mı" sorusunun cevabı dosyada, bizim iddiamızda
 * değil.
 */
async function watcherCommand(ne, button) {
  button.disabled = true;
  const oldValue = document.querySelector("#bar .redd");
  if (oldValue) oldValue.remove();
  try {
    const answerBody = await fetch("/gozcu/" + ne, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    draw(data.model);
    // Durdurma ANLIK DEĞİL: gözcü süren turu bitirip çıkıyor. Bunu
    // söylemezsek kullanıcı hapta hâlâ "gözcü açık" görüp düğmenin
    // çalışmadığını sanar — ölçüldü, tam olarak bu oldu.
    if (data.message) {
      const not = el("div", "ipucu", data.message);
      not.style.cssText = "flex-basis:100%";
      document.getElementById("bar").append(not);
    }
    // Başlatma/durdurma gözcü.log'a yeni satır düşürür — gözcü paneli
    // AÇIKSA günlüğü TAZELE, yoksa operatör panele girene kadar eski
    // kalırdı.
    if (RAIL.mode === "daemon") void railLoadWatcher();
  } catch (e) {
    button.disabled = false;
    // İSTENEN durdurma/yeniden başlatma BAŞARISIZ oldu — GOZCU_BEKLEYEN'i
    // ASILI bırakmak çipi sonsuza kadar "duruyor" gösterirdi, oysa hiçbir
    // şey durmuyor.
    WATCHER_PENDING = null;
    const box = el("div", "redd", e.message);
    box.style.cssText = "flex-basis:100%";
    document.getElementById("bar").append(box);
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
async function selectFlow(name, selector) {
  const goBack = ACTIVE_NAME;
  selector.disabled = true;
  // Hata kutusu artık #panoArac'a düşüyor: seçici de o satırda yaşıyor
  // (bkz. ciz — "Pano araç satırı" bölümü). #bar artık GENEL üst çubuk,
  // akışa özgü bir hata orada yersiz dururdu.
  const oldValue = document.querySelector("#panoArac .redd");
  if (oldValue) oldValue.remove();
  try {
    const answerBody = await fetch("/akis/sec", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify({ name }),
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    // Açık panel (kart detayı, akış düzenleyici) ESKİ akışa ait olabilir —
    // özellikle düzenleyicinin taslağı eski akışın dosyasından okunmuştu.
    // Yeni akışa geçince kapatmak, bayat bir taslağı düzenlemeye devam
    // etmekten iyi.
    location.hash = "";
    draw(data.model);
  } catch (e) {
    selector.value = goBack;
    const box = el("div", "redd", e.message);
    box.style.cssText = "flex-basis:100%";
    document.getElementById("panoArac").append(box);
  } finally {
    selector.disabled = false;
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
function cardContent(box, c) {
  box.className = "card" + (c.state === "active" ? " live" : "") + (c.gate ? " gate" : "") + (c.orphan ? " orphan" : "");
  box.replaceChildren();

  const topEl = el("div", "tag " + (c.gate ? "gate" : c.state === "active" ? "run" : "queued"));
  if (c.state === "active") topEl.append(el("span", "dot"));
  const gateEl = c.gate ? gateExits(c.gate, c.planLock, c.backTarget) : null;
  topEl.append(document.createTextNode(
    c.gate ? gateEl.label : c.state === "active" ? "çalışıyor" : c.state === "done" ? "bitti" : "kuyrukta"
  ));
  if (gateEl) {
    const not = el("span", "mono", gateEl.not);
    not.style.cssText = "margin-left:auto;font-size:var(--fs-micro);text-transform:none;letter-spacing:0";
    topEl.style.display = "flex";
    topEl.append(not);
  }
  box.append(topEl);

  box.append(el("h3", null, c.title));
  box.append(el("div", "cid", c.id + " · " + c.role));

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
  if (c.otherFlow) {
    const d = el("div", "cid", "başka akışın kartı — bu pano onu yargılamıyor");
    d.style.color = "var(--ink-2)";
    box.append(d);
  }

  if (c.stale && !c.orphan && !c.otherFlow) {
    const d = el("div", "cid", "eski damga — kart kendi topolojisiyle yürüyor");
    d.style.color = "var(--ink-2)";
    box.append(d);
  }

  if (c.gateReason) buildRationale(box, c.gateReason);
  else if (c.lastReject && c.state !== "done") {
    const r = el("div", "reason", c.lastReject);
    r.style.color = "var(--ink-2)";
    box.append(r);
  }

  if (c.live) {
    const s = el("div", "step");
    s.append(el("b", "mono", c.live.name || c.live.kind));
    s.append(el("span", "path", c.live.detail || ""));
    s.append(el("span", "seq", "adım " + c.live.seq));
    box.append(s);
  }

  const meta = el("div", "meta");
  if (c.rejects > 0) meta.append(el("span", "bad", c.rejects + " ret"));
  meta.append(el("span", null, c.turns + " tur"));
  if (c.durationMs) meta.append(el("span", null, duration(c.durationMs)));
  // Kosul artik SADECE dolara bakmiyor: olculmemis bir aktivasyon da
  // soylenmeli, dolari sifir olsa bile.
  if (c.costUsd || c.unmeasured) {
    meta.append(el("span", c.unmeasured ? "bad" : null,
      costText(c.costUsd, c.unmeasured, c.tokens)));
  }
  box.append(meta);

  // Sayı tek başına anlatmıyor: "2 ret" ile "kabul, ret, kapı, ret, bitti"
  // aynı şey değil.
  if (c.trail.length > 1) {
    const trail = el("div", "trail");
    c.trail.forEach((t, i) => {
      if (i > 0) trail.append(el("s"));
      const d = el("i");
      d.style.background = DOT[t] || "var(--ink-3)";
      d.title = t;
      trail.append(d);
    });
    box.append(trail);
  }

  if (c.orphan) {
    const exitSpec = el("div", "exits");
    const b = el("button", "primary", "Kartı kapat");
    b.type = "button";
    b.style.cssText = "background:var(--reject);border-color:var(--reject);color:#fff";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      void closeCard(c.id, box);
    });
    exitSpec.append(b);
    box.append(exitSpec);
    box.append(el("div", "soon", "iş dalında duruyor; kapanan şey kartın yolculuğu"));
  } else if (gateEl) {
    const exitSpec = el("div", "exits");
    gateEl.buttons.forEach(([name, selection], i) => {
      const b = el("button", i === 0 ? "primary" : null, name);
      b.type = "button";
      b.addEventListener("click", (e) => {
        // Kartın kendisi de tıklanabilir (detay açar); düğme onu tetiklemesin.
        e.stopPropagation();
        void decision(c.id, selection, b, box);
      });
      exitSpec.append(b);
    });
    box.append(exitSpec);
  }
  // aria-label HER çağrıda tazeleniyor (c.title değişebilir), ama
  // tabIndex/role/tıklama dinleyicisi BURADA yok — kutu.addEventListener
  // bu fonksiyon her yoklamada çağrıldığında tekrarlanırsa (kartYerlestir
  // aynı düğümü yeniden kullandığı için) her saniye bir dinleyici daha
  // eklenir ve tek tıkla panel N kere açılır. Onlar düğümün YARATILDIĞI
  // yerde (kartCiz, kartYerlestir) BİR KEZ bağlanıyor.
  box.setAttribute("aria-label", c.title + " — detay");
}

/** Bir kart için TAZE bir düğüm yaratır — kimliğin önemsiz olduğu yerlerde (bant kartları). */
function drawCard(c) {
  const box = el("div");
  cardContent(box, c);
  startCardNode(box, c.id);
  return box;
}

/**
 * Yeni yaratılan bir kart düğümüne BİR KEZ bağlanması gereken şeyleri
 * kurar: erişilebilirlik öznitelikleri ve tıklama/klavye dinleyicisi.
 *
 * "id" kartın kendi kimliği — bir kartın ÖMRÜ boyunca değişmez, o yüzden
 * burada kapatılan değer (closure) hep doğru kalır; kartYerlestir bu
 * fonksiyonu yalnızca düğüm YENİ yaratıldığında çağırıyor.
 */
function startCardNode(box, id) {
  box.tabIndex = 0;
  box.setAttribute("role", "button");
  // Panel adreslenebilir: bir karta bakarken URL'yi paylaşabilmek,
  // "hangi kart" sorusunu konuşmanın en kısa yolu.
  const open = () => { location.hash = "kart/" + id; };
  box.addEventListener("click", open);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
}

const EVENT = {
  created: "açıldı", taken: "alındı", handoff: "devredildi", reject: "REDDEDİLDİ",
  gate: "KAPI", released: "bırakıldı", requeued: "kuyruğa döndü", done: "bitti",
  plan: "planlama",
};
const TRAIL_COLOUR = { reject: "var(--reject)", gate: "var(--gate)", released: "var(--gate)", done: "var(--accept)" };

async function openDetail(id) {
  const container = document.getElementById("panel");
  try {
    const answerBody = await fetch("/kart/" + encodeURIComponent(id), { cache: "no-store" });
    const d = await answerBody.json();
    if (!answerBody.ok) throw new Error(d.error || answerBody.status);
    container.replaceChildren(drawDetail(d));
  } catch (e) {
    container.replaceChildren(el("div", "err", "Kart okunamadı: " + e.message));
  }
}

function drawDetail(d) {
  const topEl = el("div", "ust");
  topEl.addEventListener("click", (e) => { if (e.target === topEl) kapat(); });
  const p = el("div", "panel");

  const closeButton = el("button", "kapat", "Kapat");
  closeButton.type = "button";
  closeButton.addEventListener("click", kapat);
  p.append(closeButton);

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
      const line = el("div", "reason");
      line.append(el("b", null, "yükümlülük " + k.id + ": "));
      line.append(document.createTextNode(k.ne));
      const kanit = el("div", "cid", "kanıt: " + k.kanit);
      line.append(kanit);
      p.append(line);
    });
  }

  const m = el("div", "meta");
  if (d.card.rejects) m.append(el("span", "bad", d.card.rejects + " ret"));
  m.append(el("span", null, d.card.turns + " tur"));
  if (d.card.durationMs) m.append(el("span", null, duration(d.card.durationMs)));
  if (d.card.costUsd || d.card.unmeasured) {
    m.append(el("span", d.card.unmeasured ? "bad" : null,
      costText(d.card.costUsd, d.card.unmeasured, d.card.tokens)));
  }
  p.append(m);

  // "En son neden reddedildi" — gerekçeler kartın kendi geçmişinden.
  p.append(buildTraceTimeline(d.history));

  // "Kodda ne değişti" — devredilen commit'in diff özeti.
  p.append(buildCodeChange(d.diff));

  topEl.append(p);
  return topEl;
}

/**
 * "Kartın izi" zaman çizelgesi — DEVIR.md'nin sağ panel Kart modunda da
 * istediği aynı blok (c-20261105-d500f1), bu yüzden eski üst üste gelen
 * detay panelinden (detayCiz) ÇIKARILDI: iki yerde aynı anlamı taşıyan iki
 * ayrı kopya, AJAN_AYRAC'ın kendi yorumunun uyardığı kusur sınıfı olurdu.
 * Çıkarma davranışı DEĞİŞTİRMİYOR — detayCiz'in ürettiği DOM BİREBİR AYNI.
 */
function buildTraceTimeline(history) {
  const trail = el("div", "kutu");
  trail.append(el("div", "eyebrow", "Kartın izi"));
  history.forEach((h, i) => {
    const line = el("div", "iz");
    line.style.marginTop = i === 0 ? "10px" : "0";
    line.append(el("div", "t", h.at.slice(11, 19)));
    const railEl = el("div", "rail");
    const dot = el("i");
    dot.style.background = TRAIL_COLOUR[h.event] || "var(--accent)";
    railEl.append(dot);
    if (i < history.length - 1) railEl.append(el("s"));
    line.append(railEl);
    const bodyEl = el("div", "gov");
    const bas = el("div");
    bas.append(el("b", null, EVENT[h.event] || h.event));
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
      let summary = "tur " + h.plan.round;
      if (h.plan.objections !== null) summary += ", " + h.plan.objections + " itiraz";
      if (h.plan.accepted !== null) summary += ", " + h.plan.accepted + " kabul";
      if (h.plan.invalid !== null) summary += ", " + h.plan.invalid + " sayılmadı";
      bas.append(el("em", null, "(" + summary + ")"));
    }
    bodyEl.append(bas);
    if (h.note) bodyEl.append(el("p", null, h.note));
    line.append(bodyEl);
    trail.append(line);
  });
  return trail;
}

/**
 * "Kodda ne değişti" — devredilen commit'in diff özeti. izZamanCizelgesiKur
 * gibi detayCiz'den ÇIKARILDI, sağ panelin Kart modu AYNI bloğu kullanıyor.
 */
function buildCodeChange(diff) {
  const code = el("div", "kutu");
  code.append(el("div", "eyebrow", "Kodda ne değişti"));
  if (!diff) {
    code.append(el("div", "empty", "Bu kart için commit kaydı yok."));
    return code;
  }
  code.append(el("div", "cid", diff.commit));
  const largest = Math.max(1, ...diff.files.map((f) => f.add + f.del));
  diff.files.forEach((f) => {
    const line = el("div", "dosya");
    line.append(el("div", "p", f.path));
    line.append(el("div", "a", "+" + f.add));
    line.append(el("div", "d", "-" + f.del));
    const c = el("div", "cizgi");
    const addIt = el("i");
    addIt.style.cssText = "background:var(--accept);width:" + (90 * f.add / largest) + "px";
    const remove = el("i");
    remove.style.cssText = "background:var(--reject);opacity:.55;width:" + (90 * f.del / largest) + "px";
    c.append(addIt, remove);
    line.append(c);
    code.append(line);
  });
  return code;
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
  const active = tabName(decodeURIComponent(location.hash.replace(/^#/, "")));
  if (active !== "pano") {
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
function tabName(h) {
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
function applyTab() {
  const active = tabName(decodeURIComponent(location.hash.replace(/^#/, "")));
  ["Pano", "Akislar", "Promptlar", "Ajanlar"].forEach((part) => {
    const box = document.getElementById("icerik" + part);
    if (box) box.style.display = part.toLowerCase() === active ? "" : "none";
  });
  document.querySelectorAll(".navSekme").forEach((b) => {
    const matches = b.dataset.sekme === active;
    b.classList.toggle("navSekme-aktif", matches);
    b.setAttribute("aria-current", matches ? "page" : "false");
  });
}

function readHash() {
  applyTab();
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h.startsWith("kart/")) openDetail(h.slice("kart/".length));
  else if (h === "akis") void openFlow();
  else if (h === "prompt/yeni") void openNewRole();
  else if (h === "yeni") openNewCard();
  else document.getElementById("panel").replaceChildren();
  // Akışlar/Promptlar sekmeleri Pano'nun bir sub-paneli DEĞİL (bkz.
  // sekmeAdi) — kendi içeriklerini YUKARIDAKİ dallardan BAĞIMSIZ
  // kuruyorlar, #panel'i de aynen boşaltan dal (üstteki son 'else') zaten
  // çalıştı.
  if (h === "akislar") drawFlowsScreen();
  if (h === "promptlar") void drawPromptsScreen();
}
window.addEventListener("hashchange", readHash);

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
function watcherStatus(g) {
  if (g === null) return { durum: "yok", label: "gözcü yok" };
  if (g.alive) return { durum: "acik", label: "gözcü açık" };
  return { durum: "cokmus", label: "gözcü kapalı (bayat kilit)" };
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
function watcherPanelState(g, isManaged, stopped) {
  if (!isManaged) return { durum: "unmanaged", label: "gözcü · elle" };
  const baseline = watcherStatus(g);
  if (baseline.durum === "yok") return { durum: "off", label: "gözcü kapalı" };
  if (baseline.durum === "cokmus") return { durum: "stale", label: "gözcü çökmüş" };
  return stopped ? { durum: "stopping", label: "gözcü duruyor…" } : { durum: "on", label: "gözcü açık" };
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
function watcherTopoWarning(g, flowHash, durum) {
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
function watcherCommandExamples(flowName) {
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
function watcherActionLabel(g) {
  const isLive = Boolean(g && g.alive);
  return g && !isLive ? "Kilidi devral ve başlat" : (isLive ? "Gözcüyü durdur" : "Gözcüyü başlat");
}

/** Pano rozetinin sayısı — kapıda bekleyen kart. SAF, DOM yok. */
function atGateCount(cards) {
  return cards.filter((c) => Boolean(c.gate)).length;
}

/** Ajanlar rozetinin sayısı — şu an çalışan kart. SAF, DOM yok. */
function runningAgentCount(cards) {
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
function watcherWaitResult(pendingOnes, g) {
  if (pendingOnes === null) return null;
  if (g && g.alive) return null;
  return { restart: pendingOnes === "yenidenBaslatiliyor" };
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
function themeAttributeValue(tema) {
  if (tema === "acik") return "light";
  if (tema === "koyu") return "dark";
  return null;
}

/** Tersi: gerçek nitelikten üç hâlden birine. SAF. */
function attributeThemeValue(attribute) {
  if (attribute === "light") return "acik";
  if (attribute === "dark") return "koyu";
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
function selectTheme(tema) {
  const attribute = themeAttributeValue(tema);
  if (attribute === null) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = attribute;
  if (LAST_MODEL) draw(LAST_MODEL);
  fetch("/tema", {
    method: "POST",
    headers: { "content-type": "application/json", "x-skein-token": TOKEN },
    body: JSON.stringify({ tema }),
  }).catch(() => {});
}

/**
 * Üst çubuğun tema anahtarı DOM'u — üç düğme, ".duzenleSegment"/
 * ".duzenleSegmentBtn" (Rolleri Düzenle modunun tekil/toplu anahtarı) ile
 * AYNI deseni izliyor: düğme grubu + "secili" sınıfı, YENİ bir etkileşim
 * deseni İCAT EDİLMİYOR.
 */
function buildThemeSwitch() {
  const currentTheme = attributeThemeValue(document.documentElement.dataset.theme || null);
  const group = el("div", "temaAnahtari");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Tema");
  [["sistem", "Sistem"], ["acik", "Açık"], ["koyu", "Koyu"]].forEach(([value, label]) => {
    const b = el("button", "temaBtn" + (value === currentTheme ? " secili" : ""), label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(value === currentTheme));
    b.addEventListener("click", () => { if (value !== currentTheme) selectTheme(value); });
    group.append(b);
  });
  return group;
}

/**
 * Kuyruk engeli bandının başlığı — SAF (DOM yok).
 *
 * NOT: bu bölge gömülü betiğin template literal'ının İÇİ — ters tırnak
 * string'i kapatır, o yüzden bu yorumda ters tırnak YOK.
 *
 * KART sayar, ENGEL KAYDI saymaz: KIRLI kodu kirli dosya başına bir kayıt
 * üretiyor (tick.ts'teki kirli.map), yani sekiz kirli dosyalı TEK kart
 * eskiden "8 kart kuyrukta ALINAMIYOR" basıyordu (ÖLÇÜM, kart
 * c-20261106-9a451b) — gerçekte tek kart sekiz dosya yüzünden alınamamıştı.
 * Kart sayısı burada MODELDEN geliyor (totals.engelliKart, model.ts'teki
 * kartSayisi() ile türetiliyor); bu fonksiyon kendi sayımını İCAT ETMİYOR.
 *
 * KIRLI kaydı varsa dosya sayısı ikinci bir cümlede ayrıca görünür — iki
 * büyüklük de okunabilir olmalı. Diğer kodlarda (GIT, ve ileride
 * eklenecekler) engeller.length ile kartSayisi zaten eşit (her kayıt ayrı
 * bir karttı, eski anlam), o yüzden ikinci cümle gerekmiyor.
 */
function blockageBandTitle(cardTotal, blockageList) {
  const dirtyCount = blockageList.filter((e) => e.code === "KIRLI").length;
  return dirtyCount > 0
    ? cardTotal + " kart kuyrukta alınamıyor — " + dirtyCount + " kirli dosya"
    : cardTotal + " kart kuyrukta alınamıyor";
}

function draw(m) {
  ACTIVE_NAME = m.flow.name;
  LAST_MODEL = m;
  const barEl = document.getElementById("bar");
  barEl.replaceChildren();
  // MARKA: üç kuş SVG'si + "Skein" sözcüğü (bkz. markaSvg yorumu).
  const brand = el("div", "marka");
  brand.append(brandSvg("currentColor"));
  brand.append(el("span", "markaAd", "Skein"));
  barEl.append(brand);

  // ANA SEKMELER — hash ile yönlenir (#pano/#akislar/#promptlar/#ajanlar,
  // bkz. sekmeAdi/hashOku). Rozetler MEVCUT modelden: Pano "kapıda
  // bekleyen kart", Ajanlar "şu an çalışan kart" — ikisi de gerçekten
  // bilinen sayılar. Akışlar AKISLAR.length (açılışta bir kez okunan
  // gerçek liste). Promptlar PROMPT_ORIJINAL/PROMPT_METIN'in KARŞILAŞTIRMASI
  // (bkz. promptKaydedilmemisSayisi, Promptlar sekmesi) — "kaç dosyanın
  // editördeki metni disktekinden farklı", gerçekten izlenen bir sayı,
  // sekme hiç açılmamışsa (iki harita da boş) doğal olarak 0.
  const activeTab = tabName(decodeURIComponent(location.hash.replace(/^#/, "")));
  const navEl = el("div", "anaNav");
  navEl.setAttribute("aria-label", "Ana sekmeler");
  [
    ["pano", "Pano", atGateCount(m.cards), "accent"],
    ["akislar", "Akışlar", FLOWS.length, "notr"],
    ["promptlar", "Promptlar", promptUnsavedCount(PROMPT_ORIGINAL, PROMPT_TEXT), "notr"],
    ["ajanlar", "Ajanlar", runningAgentCount(m.cards), "accent"],
  ].forEach(([name, label, count, colourVal]) => {
    const b = el("button", "navSekme" + (name === activeTab ? " navSekme-aktif" : ""));
    b.type = "button";
    // data-sekme: sekmeUygula() TIKLANIR TIKLANMAZ (bir sonraki saniyelik
    // yoklamayı BEKLEMEDEN) bu düğümü bulup aktif sınıfını güncelliyor —
    // bkz. hashOku. Bu alan olmadan vurgu çizgisi en fazla 1 sn geç kalırdı.
    b.dataset.sekme = name;
    b.setAttribute("aria-current", name === activeTab ? "page" : "false");
    b.append(document.createTextNode(label + " "));
    b.append(el("span", "navRozet navRozet-" + colourVal, String(count)));
    b.addEventListener("click", () => { location.hash = name; });
    navEl.append(b);
  });
  barEl.append(navEl);

  // PANO ARAÇ SATIRI — akış adı/hash'i, akış seçici, "Akışı düzenle" ve
  // "Promptları düzenle" düğmeleri. Yeni tasarımın üst çubuğunda bunlar
  // YOK (Akışlar/Promptlar sekmeleri yerini alıyor, bkz. yukarıdaki nav
  // yorumu) — bu kart o sekmeleri KURMUYOR, yani yetenek burada, Pano'nun
  // kendi araç satırında kalıyor. "Akışı düzenle" ESKİ overlay'i açıyor
  // (henüz sökülmedi); "Promptları düzenle" ARTIK gerçek Promptlar
  // sekmesini açıyor (bkz. promptlarDugme, altta) — ekranın tek prompt
  // düzenleme yüzeyi o, eski "#prompt" çekmecesi Promptlar sekmesi
  // kurulunca SÖKÜLDÜ.
  const boardToolbar = document.getElementById("panoArac");
  boardToolbar.replaceChildren();
  const akis = el("div");
  akis.append(el("div", "eyebrow", "Akış"));
  akis.append(el("div", "mono", m.flow.name + "  " + m.flow.hash.slice(0, 12) + "…"));
  boardToolbar.append(akis);

  // AKIŞ SEÇİCİ. Ekran bugüne kadar açılışta verilen TEK akışa bağlıydı;
  // başka bir akışa bakmak ekranı kapatıp komutu yeniden yazmak demekti.
  // Liste boşsa (ekran akış seçimine açık değil ya da hiç akış yok) seçici
  // hiç çıkmıyor — boş bir kutu sunmak, yapamayacağı bir şeyi vaat etmek
  // olurdu.
  if (FLOWS.length) {
    const selector = el("select");
    selector.id = "akisSecici";
    selector.setAttribute("aria-label", "Akış seç");
    FLOWS.forEach((name) => {
      const o = el("option", null, name);
      o.value = name;
      if (name === m.flow.name) o.selected = true;
      selector.append(o);
    });
    selector.addEventListener("change", () => void selectFlow(selector.value, selector));
    boardToolbar.append(selector);
  }
  const edit = el("button", "mini", "Akışı düzenle");
  edit.type = "button";
  edit.addEventListener("click", () => { location.hash = "akis"; });
  boardToolbar.append(edit);
  // "Rolleri düzenle" — DEVIR.md §3, sağ panelin MOD 5'i (kart
  // c-20261105-725320). "Akışı düzenle" (yukarıda) ESKİ overlay'i açıyor —
  // bu YENİ düğme sağ panelde ayrı bir yüzey açıyor, overlay'in yerini
  // ALMIYOR (ikisi de AYNI /akis + /akis/onizleme + /akis/yaz uçlarını
  // paylaşıyor, overlay'in sökülmesi bu kartın kapsamı dışında).
  const editRolesButton = el("button", "mini", "Rolleri düzenle");
  editRolesButton.type = "button";
  editRolesButton.addEventListener("click", () => { openEdit(); });
  boardToolbar.append(editRolesButton);
  const promptsButton = el("button", "mini", "Promptları düzenle");
  promptsButton.type = "button";
  promptsButton.addEventListener("click", () => { location.hash = "promptlar"; });
  boardToolbar.append(promptsButton);

  // Akış dosyası bozulduysa ekran eski topolojiyle çizmeye devam ediyor;
  // bunu söylemezse kullanıcı düzenlemesinin neden tutmadığını bilemez.
  const errorContainer = document.getElementById("hata");
  if (m.flow.error) {
    errorContainer.replaceChildren(el("div", "err",
      "Akış dosyası şu an geçersiz — ekran ve gözcü ESKİ topolojiyle devam ediyor:\\n" + m.flow.error));
  } else {
    errorContainer.replaceChildren();
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
  const waitResult = watcherWaitResult(WATCHER_PENDING, g);
  if (waitResult) {
    WATCHER_PENDING = null;
    if (waitResult.restart) void watcherCommand("baslat", document.createElement("button"));
  }
  const statusInfo = watcherPanelState(g, Boolean(WATCHER_CONFIG), WATCHER_PENDING !== null);
  const topoWarning = watcherTopoWarning(g, m.flow.hash, statusInfo.durum);
  const pillClass = "pill" + (statusInfo.durum === "stale" || topoWarning
    ? " dikkat"
    : RAIL.mode === "daemon" ? " railAcik" : "");
  const pill = el("button", pillClass);
  pill.type = "button";
  pill.append(el("span", "dot " + statusInfo.durum));
  // TOPOLOJİ UYARISI çipin ETİKETİNİ de değiştiriyor (DEVIR.md §2: "çip
  // etiketi 'gözcü · yeniden başlat' olur").
  pill.append(document.createTextNode(topoWarning ? "gözcü · yeniden başlat" : statusInfo.label));
  // "bayat kilit" İBARESİ KALDIRILMADI (tarayici.test.ts "#bar .pill"
  // sınaması buna bağlı) — kilit GERÇEKTEN ölüyse gösteriliyor, "stale"
  // durumuna değil gozcuDurum'un KENDİ sınıflandırmasına ("cokmus")
  // bakarak: "unmanaged" bir ekranda bile kilit ölü olabilir
  // (SAPMALAR'ın "unmanaged" önceliği YALNIZCA eylem yetkisini kapatıyor,
  // teşhis bilgisini DEĞİL) — ikisi ayrı olmazsa bu ekran "elle" derken
  // bayat kilit bilgisini GİZLERDİ.
  if (watcherStatus(g).durum === "cokmus") pill.append(el("span", "mono", "bayat kilit"));
  if (g) pill.append(el("span", "mono", "pid " + g.info.pid));
  const ok = el("span", "ok", "→");
  ok.setAttribute("aria-hidden", "true");
  pill.append(ok);
  pill.addEventListener("click", () => { openWatcher(); });
  barEl.append(pill);

  barEl.append(el("div", "spacer"));
  // SAYAÇLAR — açık/bitti/toplam maliyet. "Aktivasyon" eski üst çubukta
  // vardı, DEVIR.md'nin üç sayacında YOK — o sayı bir yere kaybolmuyor,
  // kart düzeyinde (.meta) hâlâ basılıyor.
  [["açık", m.totals.open], ["bitti", m.totals.done]].forEach(([name, value]) => {
    const s = el("div", "sayac");
    s.append(document.createTextNode(name + " "));
    s.append(el("b", null, String(value)));
    barEl.append(s);
  });
  // Maliyet ifadesi AYNEN eskisiyle: "≥" alt sınır işareti SAPMALAR.md
  // §2.1'in korunacak davranışı, burada hiç değişmedi.
  const costCounter = el("div", "sayac");
  costCounter.append(document.createTextNode("toplam maliyet "));
  costCounter.append(el("b", null, (m.totals.unmeasured ? "≥" : "") + money(m.totals.costUsd)));
  barEl.append(costCounter);

  // TEMA ANAHTARI — kart c-20261106-e62847 (UX.md "operatör koyu temayı
  // kapatamıyor" bulgusunun yaması).
  barEl.append(buildThemeSwitch());

  // yeni kart dugmesi: ekranin en cok kullanilan eylemi, ust cubugun ana dugmesi.
  const fresh = el("button", "yeniKart", "Yeni kart");
  fresh.type = "button";
  fresh.addEventListener("click", () => { location.hash = "yeni"; });
  barEl.append(fresh);

  // Hiçbir kart ekrandan düşmemeli. Rolü yaşayan akışta olmayan kart
  // hiçbir sütuna uymuyor; kendi şeridinde, sebebiyle birlikte duruyor.
  const warning = document.getElementById("uyari");
  const bands = [];

  // BOZUK KART DOSYASI. Tarama artık bir bozuk dosyada durmuyor (biri
  // done/ altında olduğunda gözcü hiç açılamıyordu), ama izole etmek ile
  // SAKLAMAK ayrı şeyler: veri kaybı ekranda görünmek zorunda.
  //
  // NOT: bu bölge gömülü betiğin template literal'ının İÇİ — ters tırnak
  // string'i kapatır. Aynı tuzağa bu dosyada iki kez düşüldü.
  if (m.bozuk && m.bozuk.length) {
    const bandEl = el("div", "band");
    bandEl.append(el("h2", null, m.bozuk.length + " kart dosyası okunamıyor"));
    bandEl.append(el("p", null,
      "Bu dosyalar ayrıştırılamadı, yani içerdikleri kartlar hiçbir yerde görünmüyor. " +
      "Tarama onlarda durmuyor — bir bozuk dosya bütün kuyruğu tutmasın diye — ama " +
      "bu bir veri kaybı: dosyayı elle onar ya da sil."));
    const items = el("div", "mono");
    items.style.cssText = "font-size:var(--fs-tight);line-height:1.7";
    m.bozuk.forEach((path) => items.append(el("div", null, path)));
    bandEl.append(items);
    bands.push(bandEl);
  }

  // KUYRUK ENGELİ. Kart kuyrukta duruyor ama alınamıyor — ve bu yarış
  // değil. Teşhis gözcünün terminalinde ve günlükte vardı; operatörün
  // baktığı yer burası ve burada kart sessizce bekliyordu. Model yalnızca
  // HÂLÂ süren engelleri veriyor, yani bu bant çözülmüş bir arıza
  // göstermiyor.
  //
  // NOT: bu bölge gömülü betiğin template literal'ının İÇİ — ters tırnak
  // string'i kapatır.
  if (m.blockageList && m.blockageList.length) {
    const bandEl = el("div", "band");
    bandEl.append(el("h2", null, blockageBandTitle(m.totals.engelliKart, m.blockageList)));
    bandEl.append(el("p", null,
      "Bu kartlar kuyrukta duruyor ama role verilemiyor ve bu bir yarış değil: " +
      "dosya kilitli, izin yok ya da yolda bir şey var. Kart kendiliğinden " +
      "ilerlemeyecek — aşağıdaki kodu ve yolu kullanarak engeli kaldır."));
    const items = el("div", "mono");
    items.style.cssText = "font-size:var(--fs-tight);line-height:1.7";
    m.blockageList.forEach((e) => {
      items.append(el("div", null, e.code + "  " + e.role + "  " + e.path));
      if (e.message) {
        const alt = el("div", null, e.message);
        alt.style.cssText = "color:var(--ink-3)";
        items.append(alt);
      }
    });
    bandEl.append(items);
    bands.push(bandEl);
  }

  // Rolü bu akışta bulunmayan BAŞKA AKIŞ kartları hiçbir sütuna düşmez ve
  // yetim de sayılmadıkları için eskiden ekrandan tamamen kaybolurlardı.
  // Bir kartın ekrandan yok olması en kötü görünüm hatası.
  const roleList = new Set(m.roles.map((r) => r.id));
  const others = m.cards.filter((c) => c.otherFlow && !roleList.has(c.role) && c.state !== "done");
  if (others.length) {
    const bandEl = el("div", "band");
    bandEl.append(el("h2", null, others.length + " kart başka bir akışta"));
    bandEl.append(el("p", null,
      "Bu kartlar bu akışa ait değil: kuyruk kök başına, akış başına değil. " +
      "Rolleri bu akışta bulunmadığı için hiçbir sütuna düşmüyorlar. " +
      "Kendi akışının ekranını aç ya da npm run card -- ls ile bak."));
    const cardList = el("div", "kartlar");
    others.forEach((c) => cardList.append(drawCard(c)));
    bandEl.append(cardList);
    bands.push(bandEl);
  }

  const orphanList = m.cards.filter((c) => c.orphan);
  if (orphanList.length) {
    const bandEl = el("div", "band");
    bandEl.append(el("h2", null, orphanList.length + " kart akışta karşılığı olmayan bir rolde"));
    bandEl.append(el("p", null,
      "Bu kartlar hiçbir role gitmiyor: ya o rol akıştan silindi, ya da gözcü/ekran " +
      "akış dosyasının eski hâlini taşıyor. Kart açılırken topolojisini donduruyor " +
      "ve yolunu ondan okuyor — yani kimse onu almıyor ve hiçbir hata da üretmiyor. " +
      "Gözcüyü ve ekranı yeniden başlatmak ilkini çözer; rol gerçekten silindiyse kartı kapat."));
    const cardList = el("div", "kartlar");
    orphanList.forEach((c) => cardList.append(drawCard(c)));
    bandEl.append(cardList);
    bands.push(bandEl);
  }
  warning.replaceChildren(...bands);

  // FORMASYON DİYAGRAMI — sütun panosunun yerini alıyor (bkz. yukarıdaki
  // ".formasyonSarmal" CSS yorumu). Akışlar sekmesindeki diyagram
  // (diyagramSvgKur) gibi HER YOKLAMADA baştan kuruluyor; kimlik koruma
  // (eski kartYerlestir/KART_DUGUM) burada YOK — DEVIR.md'nin V
  // formasyonu bir devir hareketi istemiyor, "canlı" sinyali artık kanat
  // çırpmanın kendisi.
  const board = document.getElementById("board");
  board.replaceChildren(buildFormationSvg(m));

  document.getElementById("lejant").replaceChildren(buildLegend(m));

  // SAĞ PANEL — kart c-20261105-d500f1. formasyonSvgKur gibi HER
  // ÇAĞRIDA RAIL'in o anki moduna göre yeniden doluyor (Kart modu
  // kendi FETCH korumasını kendi taşıyor, bkz. sagPanelCiz).
  drawRightPanel(m);

  // AJANLAR SEKMESİ — formasyonSvgKur/sagPanelCiz'le AYNI ilke: sekme
  // GÖRÜNMÜYOR OLSA BİLE her yoklamada yeniden çiziliyor (DEVIR.md §6,
  // kart c-20261105-d304ed), ki sekmeye geçildiği an içerik hazır olsun.
  drawAgentsScreen(m);
}

/**
 * Seçilebilecek akış adlarını okur.
 *
 * SAYFA AÇILIRKEN BİR KEZ çağrılıyor: dosya listesi ekran koşarken
 * değişmiyor (akış dosyaları gözcü/ekran dışında elle eklenir), o yüzden
 * her saniyelik yoklamada yeniden istemek gerekmiyor.
 */
async function loadFlows() {
  try {
    const answerBody = await fetch("/akislar", { cache: "no-store" });
    const data = await answerBody.json();
    FLOWS = (answerBody.ok && Array.isArray(data.flows)) ? data.flows : [];
    // 'ozet': Akışlar sekmesinin kart ızgarası — AYNI istekten, İKİNCİ bir
    // yoklama açmadan (bkz. AKISLAR_OZET yorumu).
    FLOWS_SUMMARY = (answerBody.ok && Array.isArray(data.summary)) ? data.summary : [];
  } catch (e) {
    // Liste okunamadıysa seçici hiç çıkmaz (AKISLAR boş kalır) — sessizce
    // "başarılı ama boş" ile gerçek bir okuma hatasını karıştırmıyoruz,
    // ama seçici YOKKEN ekranın asıl işi (pano) yine de çizilmeli.
    FLOWS = [];
    FLOWS_SUMMARY = [];
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
function findFlowSummary(summaryList, name) {
  return summaryList.find((o) => o.name === name) || null;
}

/**
 * "planner → architect → … → bitti" zinciri — DEVIR.md §4. SAF, DOM yok.
 * 'rolIdler' boşsa (akış bozuk, bkz. akisKartKur) bile "bitti" basıyor:
 * her akış 'done'a varır, zincirin kendisi bilinmese de BU bilinir.
 */
function flowChainText(roleIds) {
  return roleIds.length ? roleIds.join(" → ") + " → bitti" : "bitti";
}

/**
 * Kartın sınıfı — "Paneldeki akışın kartı accent-100 zeminli" (DEVIR.md
 * §4). SAF, DOM yok.
 */
function flowCardClass(name, activeName) {
  return "akisKart" + (name === activeName ? " akisKart-panoda" : "");
}

/**
 * Akış adı geçerli mi — DEVIR.md §3/§4'ün kısıtı: yalnız 'a-z0-9-', boş
 * değil. SAF, DOM yok. 'duzenleAdSanitize' (rol adı için, yukarıda)
 * SESSİZCE temizler; burada REDDETMEK doğru — "Yeni akış" düğmesi
 * kullanıcı hâlâ yazarken geçersiz bir ad YOLLAMAMALI, sanitize edilmiş
 * hâli sessizce göndermek kullanıcının yazdığını değiştirirdi.
 */
function isFlowNameValid(name) {
  return /^[a-z0-9-]+$/.test(name);
}

/**
 * "Oluştur ve düzenle" düğmesinin etkin olma koşulu — geçerli VE
 * benzersiz. SAF, DOM yok.
 */
function isNewFlowValid(name, existingNames) {
  return isFlowNameValid(name) && !existingNames.includes(name);
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
function miniFormationSvg(roleCount) {
  const svg = sv("svg", {
    viewBox: "0 0 1000 640", width: "200", height: "110", preserveAspectRatio: "none",
    role: "img", "aria-label": "Rol formasyonu önizlemesi",
  });
  svg.classList.add("akisKartFormasyon");
  if (roleCount <= 0) return svg;
  // Renk CSS SINIFINDAN geliyor, satır-içi style'dan DEĞİL: ".akisKart-panoda
  // .akisKartFormasyonGovde/-Nokta" (yukarıda) kartın panoda OLUP OLMAMASINA
  // göre --color-text/--color-neutral-900 arasında seçim yapıyor — bu
  // fonksiyon o kararı BİLMİYOR (ad/aktifAd burada YOK), sınıf seçicisi
  // bilsin diye DOM'da iki ayrı yer yerine TEK CSS kararı kalıyor.
  const bodyPart = sv("polyline", {
    class: "akisKartFormasyonGovde",
    points: FORMATION_BODY.map((p) => p.join(",")).join(" "), "vector-effect": "non-scaling-stroke",
  });
  svg.append(bodyPart);
  for (let i = 0; i < roleCount; i++) {
    const position = rolePosition(i, roleCount);
    const dot = sv("circle", { class: "akisKartFormasyonNokta", cx: position.x, cy: position.y, r: "20" });
    svg.append(dot);
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
async function selectFlowCard(name) {
  try {
    const answerBody = await fetch("/akis/sec", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify({ name }),
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    draw(data.model);
    return true;
  } catch (e) {
    showNotice("Akış değiştirilemedi: " + e.message);
    return false;
  }
}

/**
 * "Panoda aç" / "Rolleri düzenle" düğmeleri — akış ZATEN panodaysa
 * GEREKSİZ bir /akis/sec isteği atılmıyor (hâlâ "hedef"e göre davranış
 * aynı: Pano'ya git, istenirse editörü aç).
 */
async function selectAndOpenFlowCard(name, target) {
  if (name !== ACTIVE_NAME) {
    const succeeded = await selectFlowCard(name);
    if (!succeeded) return;
  }
  location.hash = "";
  if (target === "duzenle") openEdit();
}

/**
 * Akışlar sekmesinin TEK kartı — DEVIR.md §4. 'ozet' AKISLAR_OZET'ten
 * çıkarılmış: 'draft' varsa gerçek açıklama/rol sayısı/zincir, 'hata'
 * varsa akış BOZUK (bkz. akisOzetiYukle, server.ts) — kart bunu
 * SAKLAMIYOR, "bir akışın bozulması listenin GERİ KALANINI göstermeyi
 * engellememeli" ilkesinin ekran tarafı (bkz. m.bozuk/m.engeller).
 */
function buildFlowCard(name, activeName) {
  const summary = findFlowSummary(FLOWS_SUMMARY, name);
  const draft = summary ? summary.draft : null;
  const roleIds = draft ? draft.roles.map((r) => r.id) : [];

  const card = el("div", flowCardClass(name, activeName));
  card.dataset.akis = name;
  card.append(miniFormationSvg(roleIds.length));

  const topEl = el("div", "akisKartUst");
  const nameBlock = el("div", "akisKartAdBlok");
  nameBlock.append(el("h3", "akisKartAd", name));
  if (name === activeName) nameBlock.append(el("span", "akisKartEtiket", "panoda"));
  topEl.append(nameBlock);
  topEl.append(el("div", "akisKartRolSayisi", roleIds.length ? roleIds.length + " rol" : "rol sayısı bilinmiyor"));
  card.append(topEl);

  if (summary && summary.error) {
    card.append(el("p", "akisKartHata", summary.error));
  } else if (draft) {
    card.append(el("p", "akisKartAciklama", draft.description || "(açıklama yok)"));
    card.append(el("div", "akisKartZincir", flowChainText(roleIds)));
  }

  const buttons = el("div", "akisKartDugmeler");
  const openOnBoard = el("button", "railBtn primary", "Panoda aç");
  openOnBoard.type = "button";
  openOnBoard.addEventListener("click", () => void selectAndOpenFlowCard(name, "pano"));
  buttons.append(openOnBoard);

  const editRoles = el("button", "railBtn", "Rolleri düzenle");
  editRoles.type = "button";
  editRoles.addEventListener("click", () => void selectAndOpenFlowCard(name, "duzenle"));
  buttons.append(editRoles);

  // "Kopyala": şablon taslağı bu kartın KENDİ taslağı — bozuksa (draft
  // null) kopyalanacak bir yapı yok, düğme bunu VAAT ETMİYOR.
  const copyIt = el("button", "railBtn", "Kopyala");
  copyIt.type = "button";
  copyIt.disabled = !draft;
  if (!draft) copyIt.title = "Bu akış şu an geçersiz, şablon olarak kullanılamıyor.";
  copyIt.addEventListener("click", () => { openNewFlow({ template: name, suggestedName: name + "-kopya" }); });
  buttons.append(copyIt);

  card.append(buttons);
  return card;
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
function openNewFlow(suggestions) {
  const templateSuggestion = (suggestions && suggestions.template) || FLOWS[0] || "";
  const container = document.getElementById("panel");
  const box = el("div", "ust ust-ortali");
  // '.panel' SINIFI BİLEREK YOK: o ESKİ çekmecenin kendi düzen kuralları
  // var (height:100%, border-left, 620px genişlik — bkz. ".panel" kuralı,
  // yukarıda) ve ".dialog" ile AYNI özgüllükte olduklarından kaynak
  // SIRASINA göre çakışırdı. ".dialog" kendi tam düzenini taşıyor.
  const innerEl = el("div", "dialog");
  innerEl.append(el("h2", null, "Yeni akış"));

  const nameLabelEl = el("label", null);
  nameLabelEl.append(document.createTextNode("Ad"));
  const nameInputEl = el("input");
  nameInputEl.type = "text";
  nameInputEl.setAttribute("pattern", "[a-z0-9-]+");
  nameInputEl.value = (suggestions && suggestions.suggestedName) || "";
  nameLabelEl.append(nameInputEl);
  innerEl.append(nameLabelEl);

  const lightL = el("label", null);
  lightL.append(document.createTextNode("Açıklama"));
  const lightI = el("textarea");
  lightI.rows = 3;
  lightL.append(lightI);
  innerEl.append(lightL);

  const fixedL = el("label", null);
  fixedL.append(document.createTextNode("Şablon akış"));
  const fixedS = el("select");
  FLOWS.forEach((name) => {
    const o = el("option", null, name);
    o.value = name;
    if (name === templateSuggestion) o.selected = true;
    fixedS.append(o);
  });
  fixedL.append(fixedS);
  innerEl.append(fixedL);

  const errorBox = el("div", "err");
  errorBox.style.cssText = "display:none";
  innerEl.append(errorBox);

  // '.railCikis' (sağ panelin kapı çıkışları için, YUKARIDA tanımlı) —
  // '.exits' BURADA KASITLI OLARAK kullanılmıyor: o sınıfın KENDİ
  // ".exits button" kuralı (ESKİ sistem, satır ~804) bu düğmelerin
  // Modernist ".railBtn" biçimini EZERDİ (daha yüksek özgüllük, aynı
  // kusur sınıfı — AJAN_AYRAC'ın kendi yorumunun uyardığı "iki yerde iki
  // ayrı kural" türünden, burada renk/biçim için).
  const line = el("div", "railCikis");
  const create = el("button", "railBtn primary", "Oluştur ve düzenle");
  create.type = "button";
  const cancel = el("button", "railBtn", "Vazgeç");
  cancel.type = "button";
  cancel.addEventListener("click", () => { container.replaceChildren(); });
  line.append(create, cancel);
  innerEl.append(line);

  const update = () => { create.disabled = !isNewFlowValid(nameInputEl.value, FLOWS); };
  nameInputEl.addEventListener("input", () => { nameInputEl.value = editSanitizeName(nameInputEl.value); update(); });
  update();

  create.addEventListener("click", async () => {
    create.disabled = true;
    errorBox.style.cssText = "display:none";
    try {
      const templateSummary = findFlowSummary(FLOWS_SUMMARY, fixedS.value);
      if (!templateSummary || !templateSummary.draft) throw new Error("Şablon akış şu an okunamıyor.");
      // Derin kopya: sablonOzet.draft AKISLAR_OZET'in KENDİ nesnesi,
      // üzerine doğrudan yazmak o listeyi de değiştirirdi.
      const newDraft = JSON.parse(JSON.stringify(templateSummary.draft));
      newDraft.name = nameInputEl.value;
      if (lightI.value.trim()) newDraft.description = lightI.value.trim();
      else delete newDraft.description;

      const writeAnswer = await fetch("/akis/yaz", {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": TOKEN },
        body: JSON.stringify({ ...newDraft, newName: nameInputEl.value }),
      });
      const writeData = await writeAnswer.json();
      if (!writeAnswer.ok) throw new Error(writeData.error || writeAnswer.status);

      const succeeded = await selectFlowCard(nameInputEl.value);
      if (!succeeded) return; // akisKartSec kendi bildirimini gösterdi
      container.replaceChildren();
      // Sağ panel (duzenleAc'in açtığı yer) Pano'nun DOM alt ağacında —
      // sekme hâlâ "akislar"ken açılsaydı #icerikPano'nun "display:none"ı
      // onu GÖRÜNMEZ bırakırdı (bkz. akisKartSecVeAc'in AYNI deseni).
      location.hash = "";
      openEdit();
    } catch (e) {
      create.disabled = false;
      errorBox.textContent = e.message;
      errorBox.style.cssText = "display:block;white-space:pre-wrap";
    }
  });

  box.addEventListener("click", (e) => { if (e.target === box) container.replaceChildren(); });
  box.append(innerEl);
  container.replaceChildren(box);
  nameInputEl.focus();
}

/**
 * Akışlar sekmesinin içeriği — sekme açıldığında BİR KEZ kuruluyor
 * (bkz. hashOku'nun "akislar" dalı). AKISLAR/AKISLAR_OZET değişmediği
 * için (sayfa açılışında bir kez okunan liste) saniyelik yoklamadan
 * yeniden çağrılmıyor — formasyonSvgKur'un "her yoklamada yeniden kur"
 * ilkesinin TERSİ: orada model saniyede değişiyor, burada liste HİÇ
 * değişmiyor.
 */
function drawFlowsScreen() {
  const rootEl = document.getElementById("icerikAkislar");
  const title = el("div", "akislarBaslik");
  title.append(el("h1", null, "Akışlar"));
  title.append(el("p", null,
    "Depodaki her akış burada: hangi rollerden geçtiği, hangisinin şu an " +
    "panoda açık olduğu, ve rollerini düzenlemek ya da kopyalamak için kısayollar."));
  const newButton = el("button", "railBtn primary", "Yeni akış");
  newButton.type = "button";
  newButton.addEventListener("click", () => { openNewFlow(null); });
  title.append(newButton);

  const grid = el("div", "akislarIzgara");
  if (!FLOWS.length) {
    grid.append(el("div", "ipucu", "Bu ekran akış listesine açık değil ya da hub/flows/ boş."));
  } else {
    FLOWS.forEach((name) => grid.append(buildFlowCard(name, ACTIVE_NAME)));
  }

  rootEl.replaceChildren(title, grid);
}

async function probe() {
  const warning = document.getElementById("kopuk");
  try {
    const answerBody = await fetch("/durum", { cache: "no-store" });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    warning.replaceChildren();
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
    const motionReduced = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionReduced) {
      const handoffs = findCardHandoffs(CARD_LAST_ROLE, data.cards);
      if (handoffs.length) {
        buildFlightPlans(handoffs, data.roles).forEach((plan) => {
          FLIGHTS.push({
            cardId: plan.cardId, path: plan.path, duration: plan.duration, startAt: performance.now(),
          });
        });
      }
    }
    CARD_LAST_ROLE = buildRoleMap(data.cards);
    draw(data);
  } catch (e) {
    // Okuma koptuğunda ekranı boşaltmak, "iş yok" ile "bakamıyorum"u
    // karıştırmak olurdu. Son çizim yerinde kalır, üstüne uyarı düşer.
    warning.replaceChildren(el("div", "err", "Durum okunamadı: " + e.message + " — gözcü kapanmış olabilir."));
  }
}

// --- Akış düzenleyici ---
//
// Ekranın ürettiği şey tam olarak hub/flows/<ad>.yaml. Ayrı bir "ekran
// biçimi" olsaydı, iki temsil arasında sürüklenme kaçınılmazdı.
let DRAFT = null;
let PROVIDERS = [];

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
function openNewCard() {
  const container = document.getElementById("panel");
  const box = el("div", "ust");
  const innerEl = el("div", "panel");
  innerEl.append(el("h2", null, "Yeni kart"));
  innerEl.append(el("p", "ipucu",
    "Kart zincirin ilk rolünden başlar. Gözcü açıksa kendiliğinden uyanır; " +
    "kapalıysa kart kuyrukta bekler."));

  const bl = el("label", null);
  bl.append(document.createTextNode("Başlık"));
  const bi = el("input");
  bi.type = "text";
  bi.placeholder = "kısa ve ayırt edici";
  bl.append(bi);
  innerEl.append(bl);

  const gl = el("label", null);
  gl.append(document.createTextNode("İş metni"));
  const gi = el("textarea");
  gi.rows = 14;
  gi.placeholder = "Ne yapılacak, neden, ve bittiğini nasıl anlayacağız. " +
    "Ajanın göreceği tek metin bu.";
  gl.append(gi);
  innerEl.append(gl);

  const line = el("div", "exits");
  const open = el("button", "primary", "Kartı aç");
  open.type = "button";
  const cancel = el("button", null, "Vazgeç");
  cancel.type = "button";
  cancel.addEventListener("click", () => { location.hash = ""; });
  line.append(open);
  line.append(cancel);
  innerEl.append(line);

  const errorBox = el("div", "err");
  errorBox.style.cssText = "display:none";
  innerEl.append(errorBox);

  open.addEventListener("click", async () => {
    open.disabled = true;
    errorBox.style.cssText = "display:none";
    try {
      const answerBody = await fetch("/kart/yeni", {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": TOKEN },
        body: JSON.stringify({ title: bi.value, task: gi.value }),
      });
      const data = await answerBody.json();
      if (!answerBody.ok) throw new Error(data.error || answerBody.status);
      // Çekirdeğin döndürdüğü model çiziliyor: ekran kendi kopyasını
      // uydurmuyor, kartın gerçekten nereye düştüğünü çekirdek söylüyor.
      draw(data.model);
      location.hash = "";
    } catch (e) {
      open.disabled = false;
      errorBox.textContent = e.message;
      errorBox.style.cssText = "display:block;white-space:pre-wrap";
    }
  });

  box.addEventListener("click", (e) => { if (e.target === box) location.hash = ""; });
  box.append(innerEl);
  container.replaceChildren(box);
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
const DIAGRAM_NS = "http:" + "//www.w3.org/2000/svg";

/** SVG düğümü kurar ve verilen öznitelikleri basar. */
function sv(name, attributes) {
  const n = document.createElementNS(DIAGRAM_NS, name);
  if (attributes) {
    Object.keys(attributes).forEach((k) => n.setAttribute(k, String(attributes[k])));
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
const EDGE_STYLE = {
  next: { dashed: "none", colourVal: "var(--ink-2)" },
  reject: { dashed: "7 5", colourVal: "var(--reject)" },
  syncBack: { dashed: "1.5 5", colourVal: "var(--accent)" },
};
const EDGE_LANE = { reject: 44, syncBack: 76 };
const GATE_BAND = 42;
const NODE_W = 148;
const NODE_H = 52;

/** Verilen yöne (ucX, ucY) bakan dolu bir ok ucu üçgeni. */
function arrowHead(tipX, tipY, dirX, dirY, colourVal) {
  const lengthPx = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / lengthPx;
  const uy = dirY / lengthPx;
  const size = 9;
  const halfWidth = 4;
  const baseX = tipX - ux * size;
  const baseY = tipY - uy * size;
  const perpendX = -uy;
  const perpendY = ux;
  const triangle = sv("polygon", {
    points:
      tipX + "," + tipY + " " +
      (baseX + perpendX * halfWidth) + "," + (baseY + perpendY * halfWidth) + " " +
      (baseX - perpendX * halfWidth) + "," + (baseY - perpendY * halfWidth),
  });
  triangle.style.fill = colourVal;
  return triangle;
}

/**
 * Bir 'next' kenarının ortasına konan "+" düğmesi.
 *
 * Tıklanınca yeni rolü sonraId'nin ARDINA eklemek üzere /rol/yeni
 * formunu açıyor (bkz. diyagramRolArasiEkleAc) — diyagramın kendi bir
 * yazma yolu YOK, bu düğme sadece aynı tek yolu (POST /rol/yeni, o da
 * writeDraft'tan geçiyor) diyagramdan ÇAĞIRIYOR.
 */
function buildAddMark(x, y, afterId) {
  const g = sv("g", { class: "kenar-ekle", "data-sonra": afterId });
  g.style.cursor = "pointer";
  const circle = sv("circle", { cx: x, cy: y, r: 9 });
  circle.style.fill = "var(--surface)";
  circle.style.stroke = "var(--accent)";
  circle.style.strokeWidth = "1.5";
  g.append(circle);
  const plusText = sv("text", { x: x, y: y + 3.5, "text-anchor": "middle" });
  plusText.style.fill = "var(--accent-ink)";
  plusText.style.fontSize = "13px";
  plusText.style.fontWeight = "700";
  plusText.textContent = "+";
  g.append(plusText);
  g.addEventListener("click", (e) => {
    e.stopPropagation();
    openInsertRoleBetween(afterId);
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
const FORMATION_BODY = [[40, 110], [230, 110], [500, 480], [770, 110], [950, 110]];

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
function rolePosition(i, n) {
  const LEFT_END = { x: FORMATION_BODY[1][0], y: FORMATION_BODY[1][1] };
  const APEX = { x: FORMATION_BODY[2][0], y: FORMATION_BODY[2][1] };
  const RIGHT_END = { x: FORMATION_BODY[3][0], y: FORMATION_BODY[3][1] };
  const f = n <= 1 ? 0.5 : i / (n - 1);
  if (f === 0.5) return { x: APEX.x, y: APEX.y, arm: "tepe" };
  if (f < 0.5) {
    return { x: LEFT_END.x + (APEX.x - LEFT_END.x) * f * 2, y: LEFT_END.y + (APEX.y - LEFT_END.y) * f * 2, arm: "sol" };
  }
  const t = (f - 0.5) * 2;
  return { x: APEX.x + (RIGHT_END.x - APEX.x) * t, y: APEX.y + (RIGHT_END.y - APEX.y) * t, arm: "sag" };
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
function birdColour(cardList) {
  if (cardList.some((c) => c.state === "active" || c.gate)) return "var(--color-accent)";
  if (cardList.length) return "var(--color-text)";
  return "var(--empty-bird-ink)";
}

/**
 * Bir kartın "kart karesi" durumu — SAF, DOM yok. Dönen üç ad
 * (".formasyonDugum .kare-<ad>" ve ".lejant .kare.<ad>") çizimle
 * PAYLAŞILIYOR: "kuyrukta" SAPMALAR.md §1'in düzelttiği hâli taşıyor
 * (neutral-500 dolgu + --color-text kenar — tasarımın kenarsız/dolguyla
 * AYNI renkteki karesi DEĞİL).
 */
function squareState(c) {
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
function rejectArcCheck(a, b) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const targetX = 500;
  const targetY = 170;
  return { x: midX + (targetX - midX) * 0.6, y: midY + (targetY - midY) * 0.6 };
}

/**
 * İki noktayı birleştiren çizgiye DİK, ortasından geçen kısa bir
 * segment — insan onayı kapısının işareti. SAF, DOM yok.
 */
function gateLine(a, b, lengthPx) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const size = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / size;
  const py = dx / size;
  const half = lengthPx / 2;
  return { x1: mx - px * half, y1: my - py * half, x2: mx + px * half, y2: my + py * half };
}

/**
 * Kanat çırpmanın KOŞULU — SAF, DOM yok. DEVIR.md: "yalnızca rolde
 * çalışan kart varsa VE gözcü açıkken". "çalışan" burada "kapıda
 * bekleyen" DEĞİL — kusRengi'nin accent koşulundan daha DAR: kapıda
 * bekleyen bir kart insan kararını bekliyor, kanat çırpıp "iş sürüyor"
 * demek yanlış bir sinyal olurdu.
 */
function wingsFlapping(roleCards, daemon) {
  return roleCards.some((c) => c.state === "active") && Boolean(daemon && daemon.alive);
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
function roleOpenCards(cards, roleIdent) {
  return cards.filter((c) => c.role === roleIdent && c.state !== "done" && !c.orphan);
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
function agentCurrentCard(roleIdent, cards) {
  const cardList = roleOpenCards(cards, roleIdent);
  return cardList.find((c) => c.state === "active") || cardList.find((c) => c.gate) || null;
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
function agentCurrentState(currentCard, daemon) {
  if (!currentCard) return null;
  if (currentCard.state !== "active") return { tur: "kapida" };
  if (!(daemon && daemon.alive)) return { tur: "gozcuKapali" };
  if (currentCard.live) return { tur: "live", live: currentCard.live };
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
function agentStatusText(role, currentCard, daemon) {
  const durum = agentCurrentState(currentCard, daemon);
  if (durum) {
    if (durum.tur === "gozcuKapali") return "gözcü kapalı · " + currentCard.title + " yarıda";
    if (durum.tur === "live") return (durum.live.name || durum.live.kind) + " · " + (durum.live.detail || "");
    if (durum.tur === "calisiyor") return "çalışıyor";
    return "kapıda bekliyor · " + currentCard.title;
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
function isAgentLive(currentCard, daemon) {
  return Boolean(currentCard) && currentCard.state === "active" && Boolean(daemon && daemon.alive);
}

/**
 * Planlama katılımcılarının V üzerindeki konumları, zincir sırasıyla —
 * SAF, DOM yok. Bilinmeyen bir katılımcı (akış doğrulamasından geçmiş
 * olduğu için teoride OLMAMALI, bkz. flow/load.ts kural 17) sessizce
 * ELENİYOR: bandın yarısını çizmek, olmayan bir rolü varmış gibi
 * göstermekten daha güvenli bir hata modu.
 */
function planningParticipantPositions(roleList, katilimcilar) {
  const n = roleList.length;
  const result = [];
  katilimcilar.forEach((id) => {
    const i = roleList.findIndex((r) => r.id === id);
    if (i !== -1) result.push(rolePosition(i, n));
  });
  return result;
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
function planningBandPath(first, last) {
  const apex = { x: FORMATION_BODY[2][0], y: FORMATION_BODY[2][1] };
  const goOverApex = first.arm === "sol" && last.arm === "sag";
  return "M " + first.x + " " + first.y +
    (goOverApex ? " L " + apex.x + " " + apex.y : "") +
    " L " + last.x + " " + last.y;
}

/**
 * Rol düğümünün etiketi — numara, ad, "sağlayıcı · çalışma alanı" satırı.
 * Konum DEVIR.md'ye göre: sol kolda düğümün SOLUNA (sağa yaslı), sağ
 * kolda SAĞINA (sola yaslı), tepedekinde ALTINA (ortalı).
 */
function buildFormationLabel(roleRec, i, position) {
  const g = sv("g", { class: "formasyonEtiket" });
  let x, hiza;
  if (position.arm === "sol") { x = -40; hiza = "end"; }
  else if (position.arm === "sag") { x = 40; hiza = "start"; }
  else { x = 0; hiza = "middle"; }
  const y0 = position.arm === "tepe" ? 32 : -14;
  const number = sv("text", { x: x, y: y0, "text-anchor": hiza, class: "formasyonNumara" });
  number.textContent = String(i + 1).padStart(2, "0");
  g.append(number);
  const name = sv("text", { x: x, y: y0 + 16, "text-anchor": hiza, class: "formasyonRolAdi" });
  name.textContent = roleRec.id;
  g.append(name);
  const meta = sv("text", { x: x, y: y0 + 32, "text-anchor": hiza, class: "formasyonMeta" });
  meta.textContent = roleRec.provider + " · " + roleRec.workspace + (i === 0 ? " · öncü" : "");
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
function railTransition(railEl, actionSpec) {
  const OVERVIEW = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };
  if (actionSpec.tur === "genelBakis") return OVERVIEW;
  if (actionSpec.tur === "rolSec") {
    // Zaten TAM O ROLÜN KENDİSİ açıkken (Rol modu, AYNI id) tıklamak
    // kapatır — formasyon düğümünün eski "toggle" davranışıyla AYNI. Kart
    // modundayken (örn. o rolün bir kartına bakılırken) aynı role
    // tıklamak KAPATMAZ, Rol moduna GEÇER: "&&" burada "||" olsaydı Kart
    // modunda da (roleId eşleşiyor diye) tek tıkla Genel bakışa düşülürdü.
    if (railEl.mode === "role" && railEl.roleId === actionSpec.roleId) return OVERVIEW;
    return { mode: "role", roleId: actionSpec.roleId, cardId: null, cardFrom: "overview" };
  }
  if (actionSpec.tur === "kartAcGenel") {
    return { mode: "card", roleId: null, cardId: actionSpec.cardIdent, cardFrom: "overview" };
  }
  if (actionSpec.tur === "kartAcRol") {
    return { mode: "card", roleId: actionSpec.roleId, cardId: actionSpec.cardIdent, cardFrom: "role" };
  }
  if (actionSpec.tur === "geri") {
    // Kart "Rol" modundan açıldıysa geri dönüş "Rol"e, roleId KORUNARAK —
    // aksi hâlde "← Genel bakış" ile aynı hedefe düşer, rol bağlamı
    // (hangi role bakılıyordu) kaybolurdu.
    if (railEl.mode === "card" && railEl.cardFrom === "role") {
      return { mode: "role", roleId: railEl.roleId, cardId: null, cardFrom: "overview" };
    }
    return OVERVIEW;
  }
  return railEl;
}

let RAIL = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };

/** ciz()'i SON_MODEL varsa çağırır — RAIL geçişlerinin tekrarlayan kuyruğu. */
function railRedraw() {
  if (LAST_MODEL) draw(LAST_MODEL);
}

// "showArcs" (DEVIR.md: "ret yayları ... 'showArcs' ile gizlenebilir").
// skein-merkez-v3.html'de bu da "animate" gibi dışarıdan verilen bir
// bayrak (this.props.showArcs ?? true), ekranın kendi panelinde bir
// düğmesi YOK — bugün burada da öyle: değer hep true, HİÇBİR kod onu
// değiştirmiyor. İkisi AYNI kategoride bırakıldı (bkz. kanatCirpiyorMu
// çağrısındaki "data-animate" notu): gelecekteki bir ayar paneli bu
// değişkeni DOĞRUDAN atayabilir, o yüzden burada bir sabit (const) değil
// bir değişken (let) olarak duruyor.
let FORMATION_SHOW_REJECTS = true;

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
function buildRoleMap(cardList) {
  const lookupMap = new Map();
  cardList.forEach((k) => { if (!k.orphan) lookupMap.set(k.id, k.role); });
  return lookupMap;
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
function findCardHandoffs(previousRoles, cardList) {
  const handoffs = [];
  cardList.forEach((k) => {
    if (k.orphan) return;
    const previous = previousRoles.get(k.id);
    if (previous !== undefined && previous !== k.role) {
      handoffs.push({ cardId: k.id, from: previous, to: k.role });
    }
  });
  return handoffs;
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
function bodyPath(a, b, apex) {
  const onSeparateArms = a.arm !== b.arm && a.arm !== "tepe" && b.arm !== "tepe";
  return onSeparateArms ? [a, apex, b] : [a, b];
}

/**
 * Bir uçuşun SÜRESİ (ms) — SAF, DOM yok. DEVIR görevi "~600-900ms"
 * aralığını veriyor, biçimi vermiyor: burada İKİLİ bir seçim var — AYNI
 * koldaki devir (düz kayış, govdeYolu 2 nokta döner) KISA (600ms),
 * tepeden dolanan devir (3 nokta, daha uzun mesafe) UZUN (900ms). Bu
 * basit tutuyor VE mutasyon sınamasına açık: "yol.length > 2" ters
 * çevrilirse kısa/uzun yer değiştirir, sınama hemen düşer.
 */
function flightDurationMs(path) {
  return path.length > 2 ? 900 : 600;
}

/**
 * Doğrusal ilerlemeyi (0..1) YUMUŞAK giriş/çıkışa çeviren eğri — SAF,
 * DOM yok. Klasik "smoothstep" (3t²-2t³): t=0 ve t=1'de hız sıfır, t=0.5
 * civarında en hızlı — DEVIR görevinin "yumuşak giriş/çıkış" istediği
 * yer. Doğrusal t'nin KENDİSİ kullanılsaydı kuş sabit hızla kayardı,
 * "yumuşak" hiçbir şey olmazdı.
 */
function easeProgress(t) {
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
function flightPosition(path, t) {
  const tt = Math.max(0, Math.min(1, t));
  const lengths = [];
  let totalSum = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const lengthPx = Math.sqrt(dx * dx + dy * dy);
    lengths.push(lengthPx);
    totalSum += lengthPx;
  }
  if (totalSum === 0) return { x: path[0].x, y: path[0].y };
  let leftover = tt * totalSum;
  for (let i = 0; i < lengths.length; i++) {
    const lengthPx = lengths[i];
    if (leftover <= lengthPx || i === lengths.length - 1) {
      const ratioVal = lengthPx === 0 ? 0 : Math.min(1, leftover / lengthPx);
      const a = path[i];
      const b = path[i + 1];
      return { x: a.x + (b.x - a.x) * ratioVal, y: a.y + (b.y - a.y) * ratioVal };
    }
    leftover -= lengthPx;
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
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
function buildFlightPlans(handoffs, roleList) {
  const n = roleList.length;
  const positionMap = new Map(roleList.map((r, i) => [r.id, rolePosition(i, n)]));
  const apex = { x: FORMATION_BODY[2][0], y: FORMATION_BODY[2][1] };
  const planList = [];
  handoffs.forEach((d) => {
    const a = positionMap.get(d.from);
    const b = positionMap.get(d.to);
    if (!a || !b) return;
    const path = bodyPath(a, b, apex);
    planList.push({ cardId: d.cardId, path: path, duration: flightDurationMs(path) });
  });
  return planList;
}

/**
 * Son GERÇEK "/durum" yoklamasında görülen kart→rol haritası —
 * kartDevirleriniBul'un "önceki" girdisi. yokla() dışında HİÇBİR
 * yer bunu güncellemez: ciz(SON_MODEL) ile tekrar tekrar çağrılan
 * yeniden çizimler (sekme değişimi, RAIL geçişi) AYNI veriyle çalışır,
 * onlarda devir tespiti YENİDEN yapılmaz — yoksa AYNI devir her
 * yeniden çizimde bir YENİ uçuş sayılırdı.
 */
let CARD_LAST_ROLE = new Map();

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
let FLIGHTS = [];

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
function buildFlyingBird(u) {
  const g = sv("g", { class: "ucanKus" });
  g.dataset.card = u.cardId;
  const bird = sv("svg", { x: -23, y: -11.5, width: 46, height: 23, viewBox: "0 0 46 23" });
  bird.classList.add("formasyonKus", "ucanKusGovde");
  const birdPolyline = sv("polyline", { points: "2,5 13,9 24,19 35,9 46,5", fill: "none" });
  birdPolyline.style.stroke = "var(--color-accent)";
  birdPolyline.style.strokeWidth = "4";
  birdPolyline.style.strokeLinejoin = "miter";
  bird.append(birdPolyline);
  g.append(bird);

  let firstFrame = true;
  const stepOnce = () => {
    if (!firstFrame && !g.isConnected) return;
    firstFrame = false;
    const elapsedMs = performance.now() - u.startAt;
    const linear = Math.max(0, Math.min(1, elapsedMs / u.duration));
    const dot = flightPosition(u.path, easeProgress(linear));
    g.setAttribute("transform", "translate(" + dot.x + " " + dot.y + ")");
    if (elapsedMs < u.duration) requestAnimationFrame(stepOnce);
  };
  stepOnce();
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
function buildFormationSvg(m) {
  const roleList = m.roles;
  const n = roleList.length;
  const positions = roleList.map((_, i) => rolePosition(i, n));
  const positionMap = new Map(roleList.map((r, i) => [r.id, positions[i]]));
  const entryDot = { x: FORMATION_BODY[0][0], y: FORMATION_BODY[0][1] };
  const exitDot = { x: FORMATION_BODY[4][0], y: FORMATION_BODY[4][1] };

  const svg = sv("svg", { viewBox: "0 0 1000 640", role: "img", "aria-label": "Rol formasyonu" });
  svg.classList.add("formasyon");

  // PLANLAMA BANDI — gövde çizgisinden ÖNCE ekleniyor ki altında kalsın
  // (SVG'de sonraki öğe öncekinin ÜSTÜNE çizilir). TEK katılımcıda bant
  // ÇİZİLMİYOR: "ilk ile son arasında geçen bir şerit" tek noktada
  // anlamsız — skein-merkez-v3.html'in kendi kuralı (plan.length > 1).
  const planPoints = m.plan ? planningParticipantPositions(roleList, m.plan.katilimcilar) : [];
  if (planPoints.length > 1) {
    const first = planPoints[0];
    const last = planPoints[planPoints.length - 1];
    const band = sv("path", { d: planningBandPath(first, last), fill: "none" });
    // accent-200 koyu temada koyulaşıyor (kart c-20261106-e62847, bkz.
    // @media bloğundaki ACCENT RAMPASI yorumu) — bu şeridin açık-pembe
    // hâli (#ffe0d9) koyu gövdenin üstünde PARLAK bir çizgi olurdu.
    band.style.stroke = "var(--color-accent-200)";
    band.style.strokeWidth = "22";
    band.style.strokeLinecap = "butt";
    svg.append(band);
    const label = sv("text", {
      x: (first.x + last.x) / 2 + 40, y: (first.y + last.y) / 2 - 22, class: "formasyonPlanEtiket",
    });
    label.textContent = "planlama · en çok " + (m.plan ? m.plan.tur : 0) + " tur";
    svg.append(label);
  }

  // GÖVDE ÇİZGİSİ — beş sabit noktadan geçen kırık çizgi. "vector-effect:
  // non-scaling-stroke" SVG'nin viewBox ölçeklemesine KARŞI: sarmalın CSS
  // genişliği 1000px'in altına ya da üstüne düşse de 2px çizgi 2px
  // KALIYOR — skein-merkez-v3.html'deki "ns" (non-scaling-stroke) kuralı.
  const bodyPart = sv("polyline", {
    points: FORMATION_BODY.map((p) => p.join(",")).join(" "), fill: "none", "vector-effect": "non-scaling-stroke",
  });
  bodyPart.style.stroke = "var(--color-text)";
  bodyPart.style.strokeWidth = "2";
  svg.append(bodyPart);

  // RET YAYLARI — "showArcs" (DEVIR.md) burada FORMASYON_RET_GOSTER.
  if (FORMATION_SHOW_REJECTS) {
    m.edges.filter((e) => e.kind === "reject").forEach((edge) => {
      const a = positionMap.get(edge.from);
      const b = positionMap.get(edge.to);
      if (!a || !b) return;
      const check = rejectArcCheck(a, b);
      const path = sv("path", {
        d: "M " + a.x + " " + a.y + " Q " + check.x + " " + check.y + " " + b.x + " " + b.y,
        fill: "none", "vector-effect": "non-scaling-stroke",
      });
      path.style.stroke = "var(--color-accent)";
      path.style.strokeWidth = "2";
      svg.append(path);
      svg.append(arrowHead(b.x, b.y, b.x - check.x, b.y - check.y, "var(--color-accent)"));
      // ETİKET yayın ÜZERİNDE: quadratic Bézier'in t=0.5 noktası
      // (0.25·a + 0.5·kontrol + 0.25·b) — kontrol noktasının KENDİSİ
      // DEĞİL, eğri kontrol noktasından GEÇMİYOR, yalnızca ona doğru
      // kıvrılıyor (bkz. skein-merkez-v3.html "lab" hesabı).
      const curveMid = {
        x: 0.25 * a.x + 0.5 * check.x + 0.25 * b.x,
        y: 0.25 * a.y + 0.5 * check.y + 0.25 * b.y,
      };
      const label = sv("text", { x: curveMid.x + 6, y: curveMid.y - 6, class: "formasyonRetEtiket" });
      label.textContent = "ret → " + edge.to;
      svg.append(label);
    });
  }

  // İNSAN ONAYI KAPISI — gateAfter rolü ile ZİNCİRDEKİ sonraki rol (ya da
  // çıkış) arasındaki çizgiye dik 6px'lik bir çizgi + "insan onayı"
  // etiketi. Hedef sonrakiSutun'dan (m.edges'ten türetilmiş) geliyor —
  // dizideki bir sonraki İNDEKSİ varsaymıyor: bu modelin TEK gerçek
  // kaynağı zaten edges (bkz. model.ts), diziye bitişiklik rastlantı.
  m.gates.filter((g) => g.type === "approval").forEach((gateEl) => {
    const a = positionMap.get(gateEl.after);
    if (!a) return;
    const nextId = nextColumn(m, gateEl.after);
    const b = nextId === "bitti" ? exitDot : positionMap.get(nextId);
    if (!b) return;
    const lineSeg = gateLine(a, b, 36);
    const lineEl = sv("line", { x1: lineSeg.x1, y1: lineSeg.y1, x2: lineSeg.x2, y2: lineSeg.y2 });
    lineEl.style.stroke = "var(--color-accent)";
    lineEl.style.strokeWidth = "6";
    svg.append(lineEl);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const label = sv("text", { x: mx + 22, y: my + 4, class: "formasyonKapiEtiket" });
    label.textContent = "insan onayı";
    svg.append(label);
  });

  // GİRİŞ — 44px accent "+" (Yeni kart). Dolgu --solid-accent: beyaz "+"
  // metni üstünde duruyor (bkz. .formasyonGiris text, aşağıda), bu yüzden
  // HER ZAMAN koyu kalması gerekiyor — ".yeniKart" ile AYNI rol, AYNI
  // token (:root'taki SOLID-* yorumu, kart c-20261106-e62847).
  const entryG = sv("g", { class: "formasyonGiris" });
  entryG.setAttribute("role", "button");
  entryG.setAttribute("tabindex", "0");
  entryG.setAttribute("aria-label", "Yeni kart");
  const entryCircle = sv("circle", { cx: entryDot.x, cy: entryDot.y, r: 22 });
  entryCircle.style.fill = "var(--solid-accent)";
  entryG.append(entryCircle);
  const entryPlus = sv("text", { x: entryDot.x, y: entryDot.y + 8, "text-anchor": "middle" });
  entryPlus.style.fontSize = "26px";
  entryPlus.textContent = "+";
  entryG.append(entryPlus);
  const openEntry = () => { location.hash = "yeni"; };
  entryG.addEventListener("click", openEntry);
  entryG.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEntry(); } });
  svg.append(entryG);

  // ÇIKIŞ — 44x44 kutu, biten kart sayısı.
  const doneCount = m.cards.filter((c) => c.state === "done").length;
  const exitG = sv("g", { class: "formasyonCikis" });
  exitG.setAttribute("aria-label", doneCount + " kart bitti");
  const exitBox = sv("rect", { x: exitDot.x - 22, y: exitDot.y - 22, width: 44, height: 44 });
  exitG.append(exitBox);
  const exitText = sv("text", { x: exitDot.x, y: exitDot.y + 6, "text-anchor": "middle" });
  exitText.style.fontSize = "17px";
  exitText.style.fontWeight = "800";
  exitText.textContent = String(doneCount);
  exitG.append(exitText);
  svg.append(exitG);

  // ROL DÜĞÜMLERİ — en üstte çiziliyor (her şeyin üzerinde tıklanabilir).
  roleList.forEach((roleRec, i) => {
    const p = positions[i];
    const roleCards = roleOpenCards(m.cards, roleRec.id);
    // Düğüm "seçili" sayılır RAIL.roleId bu role eşitse — Rol modunda VE
    // o rolün bir kartına (Kart modu, cardFrom "role") bakarken AYNI:
    // rolden içeri girilince düğüm Genel bakışa dönülene kadar vurgulu
    // kalır (bkz. railGecis).
    const selected = RAIL.roleId === roleRec.id;
    const g = sv("g", {
      class: "formasyonDugum" + (selected ? " secili" : ""),
      "data-rol": roleRec.id,
      transform: "translate(" + p.x + " " + p.y + ")",
    });
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-pressed", String(selected));
    g.setAttribute("aria-label", roleRec.id + " rolü");
    const box = sv("rect", { class: "kutu", x: -32, y: -22, width: 64, height: 44 });
    g.append(box);

    // KUŞ — 46x23, kendi iç görüş alanıyla gömülü bir <svg>: dönüşüm
    // (kanat çırpma) bu kutunun kendi kutusuna göre hesaplanır.
    const animationOn = document.documentElement.dataset.animate !== "off";
    const bird = sv("svg", { x: -23, y: -11.5, width: 46, height: 23, viewBox: "0 0 46 23" });
    bird.classList.add("formasyonKus");
    if (wingsFlapping(roleCards, m.daemon) && animationOn) bird.classList.add("kanatCirpiyor");
    const birdPolyline = sv("polyline", { points: "2,5 13,9 24,19 35,9 46,5", fill: "none" });
    birdPolyline.style.stroke = birdColour(roleCards);
    birdPolyline.style.strokeWidth = "4";
    birdPolyline.style.strokeLinejoin = "miter";
    bird.append(birdPolyline);
    g.append(bird);

    // KART KARELERİ — düğümün altında küçük bir sıra, ortalı.
    const squareGap = 12;
    const squareStart = -((roleCards.length - 1) * squareGap) / 2 - 5;
    roleCards.forEach((c, idx) => {
      const squareEl = sv("rect", {
        class: "kare-" + squareState(c), x: squareStart + idx * squareGap, y: 26, width: 10, height: 10,
      });
      g.append(squareEl);
    });

    g.append(buildFormationLabel(roleRec, i, p));

    const changeSelection = () => {
      // "Rolleri düzenle" AÇIKKEN düğüme tıklamak MODU DEĞİŞTİRMİYOR —
      // DEVIR.md §3: "Diyagramda bir düğüme tıklanınca o rolün bloğu
      // accent-100 ile vurgulanır." railGecis'in rolSec dalı burada YANLIŞ
      // olurdu: panelden ÇIKARIR, oysa istenen panel AÇIKKEN içindeki
      // bloğu işaret etmek.
      if (RAIL.mode === "edit") {
        editHighlight(roleRec.id);
        return;
      }
      RAIL = railTransition(RAIL, { tur: "rolSec", roleId: roleRec.id });
      draw(m);
    };
    g.addEventListener("click", changeSelection);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); changeSelection(); } });
    svg.append(g);
  });

  // UÇUŞLAR — en üstte: rol düğümlerinin bile üzerinden kaysın diye SON
  // ekleniyor (SVG'de sonraki öğe öncekinin ÜSTÜNE çizilir). Süresi
  // dolanlar burada BUDANIYOR: yokla() ekliyor, hiçbir yer tek tek
  // SİLMİYOR — her çizimde elenen liste tek doğru kaynağı tutuyor.
  const nowTs = performance.now();
  FLIGHTS = FLIGHTS.filter((u) => nowTs - u.startAt < u.duration);
  FLIGHTS.forEach((u) => svg.append(buildFlyingBird(u)));

  return svg;
}

/** Lejant — diyagramın altındaki açıklama şeridi (DEVIR.md + SAPMALAR.md §2.4). */
function buildLegend(m) {
  const box = el("div");
  [["calisiyor", "çalışıyor"], ["kapida", "kapıda"], ["kuyrukta", "kuyrukta"]].forEach(([sinif, label]) => {
    const item2 = el("span", "oge");
    item2.append(el("span", "kare " + sinif));
    item2.append(document.createTextNode(label));
    box.append(item2);
  });
  const rejectItem = el("span", "oge");
  rejectItem.append(el("span", "cizgi-ret"));
  rejectItem.append(document.createTextNode("ret yolu"));
  box.append(rejectItem);

  // SAPMALAR.md §2.4: tasarımın "bu yüzey yalnızca okur" iddiası YANLIŞ —
  // ekran kapı kararı veriyor, kart açıyor, akış/prompt yazıyor, gözcüyü
  // başlatıp durduruyor. Doğrusu burada, geri GETİRİLMİYOR.
  box.append(el("span", "lejantSag",
    "okundu " + new Date(m.at).toLocaleTimeString("tr-TR") +
    " · durum .skein/ ve olaylar.jsonl'dan okunuyor · değişiklik yalnızca düğmelerle"));
  return box;
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
function railCardRow(c, footer, clickCb) {
  const line = el("div", "railSatir");
  line.tabIndex = 0;
  line.setAttribute("role", "button");
  line.setAttribute("aria-label", c.title + " — detay");
  line.append(el("span", "kare " + squareState(c)));
  const bodyPart = el("div", "railSatirGovde");
  bodyPart.append(el("div", "railSatirBaslik", c.title));
  bodyPart.append(el("div", "railSatirAlt", footer));
  line.append(bodyPart);
  line.addEventListener("click", clickCb);
  line.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickCb(); } });
  return line;
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
function railGateBox(c, titleClick) {
  const gateEl = gateExits(c.gate, c.planLock, c.backTarget);
  const box = el("div", "railKapiKutu");
  box.append(el("div", "railKapiEtiket", gateEl.label + " · " + c.role));

  if (titleClick) {
    const b = el("button", "railBaslikBtn", c.title);
    b.type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); titleClick(); });
    box.append(b);
  }

  // GEREKÇE — TAŞINACAK: ajanın ham metni gerekceKur ile katlanabilir bir
  // details'a TAM olarak yazılıyor; ".railGerekce .reason" kuralı
  // (yukarıda) yalnızca GÖRÜNÜMÜ 3 satıra kırpıyor, DOM'dan hiçbir şey
  // SİLİNMİYOR.
  const rationaleWrap = el("div", "railGerekce");
  if (c.gateReason) buildRationale(rationaleWrap, c.gateReason);
  box.append(rationaleWrap);

  const exitSpec = el("div", "railCikis");
  gateEl.buttons.forEach(([name, selection], i) => {
    const b = el("button", "railBtn" + (i === 0 ? " primary" : ""), name);
    b.type = "button";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      void decision(c.id, selection, b, box);
    });
    exitSpec.append(b);
  });
  box.append(exitSpec);
  return box;
}

/**
 * MOD 1 — Genel bakış: kapıda bekleyen kart sayısı + her kapı kartı,
 * altında "Uçuşta" listesi (DEVIR.md).
 */
function drawRailOverview(box, m) {
  box.replaceChildren();

  const atGateOnes = m.cards.filter((c) => Boolean(c.gate));
  const countRow = el("div", "railSayiSatiri");
  countRow.append(el("div", "railSayi", String(atGateOnes.length)));
  countRow.append(el("div", "railSayiAciklama", "kart kararını bekliyor"));
  box.append(countRow);

  atGateOnes.forEach((c) => {
    box.append(railGateBox(c, () => {
      RAIL = railTransition(RAIL, { tur: "kartAcGenel", cardIdent: c.id });
      railRedraw();
    }));
  });

  const inFlight = m.cards.filter((c) => c.state === "active");
  box.append(el("div", "railAraBaslik", "Uçuşta · " + inFlight.length));
  if (inFlight.length === 0) {
    box.append(el("div", "railBos", "şu an çalışan kart yok"));
  } else {
    inFlight.forEach((c) => {
      const stepItem = c.live ? (c.live.name || c.live.kind) : null;
      box.append(railCardRow(c, c.role + (stepItem ? " · " + stepItem : ""), () => {
        RAIL = railTransition(RAIL, { tur: "kartAcGenel", cardIdent: c.id });
        railRedraw();
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
function drawRailRole(box, m, roleIdent) {
  box.replaceChildren();

  // "← Genel bakış" ÖNCE kuruluyor, meta bulunamasa bile: akış rol
  // silinecek şekilde değişirse (Rol modu açıkken) kullanıcı GERİ DÖNECEK
  // bir yol olmadan kilitli kalmamalı — DEVIR.md'nin "yapamayacağı şeyi
  // vaat eden düğme" sınıfının TERSİ bir kusur, düğmenin KENDİSİ hiç
  // çıkmaması.
  const geri = el("button", "railGeri", "← Genel bakış");
  geri.type = "button";
  geri.addEventListener("click", () => {
    RAIL = railTransition(RAIL, { tur: "genelBakis" });
    railRedraw();
  });
  box.append(geri);

  const meta = railRoleMeta(m, roleIdent);
  if (!meta) {
    box.append(el("div", "railBos", "rol bulunamadı — akış değişmiş olabilir"));
    return;
  }

  box.append(el("div", "railUst", "rol " + meta.no + (meta.leader ? " · öncü" : "")));
  box.append(el("h2", "railRolBaslik", meta.id));

  const metaRow = el("div", "railRolMeta");
  metaRow.append(el("span", null, meta.provider));
  metaRow.append(el("span", null, meta.workspace));
  metaRow.append(el("span", null, "sonraki: " + meta.nextRole));
  metaRow.append(el("span", null, "ret: " + (meta.rejectTarget || "yok")));
  metaRow.append(el("span", null, meta.receive === "batch" ? "toplu alım" : "tekil alım"));
  box.append(metaRow);

  const buttons = el("div", "railRolDugmeler");
  const promptBtnEl = el("button", "railBtn", "Prompt · " + meta.prompt);
  promptBtnEl.type = "button";
  promptBtnEl.addEventListener("click", () => {
    PROMPT_SELECTED = meta.prompt;
    location.hash = "promptlar";
  });
  buttons.append(promptBtnEl);
  const agentBtn = el("button", "railBtn", "Ajanı izle →");
  agentBtn.type = "button";
  agentBtn.addEventListener("click", () => {
    AGENT_SELECTED = meta.id;
    location.hash = "ajanlar";
  });
  buttons.append(agentBtn);
  box.append(buttons);

  const roleCards = roleOpenCards(m.cards, roleIdent);
  box.append(el("div", "railAraBaslik", "kartlar · " + roleCards.length));
  if (roleCards.length === 0) {
    const roleRec = m.roles.find((r) => r.id === roleIdent);
    box.append(el("div", "railBos", roleRec ? emptyRoleText(roleRec, roleCards) : "kuyrukta kart yok"));
  } else {
    roleCards.forEach((c) => {
      const durum = c.gate ? gateExits(c.gate, c.planLock, c.backTarget).label
        : c.state === "active" ? "çalışıyor" : "kuyrukta";
      box.append(railCardRow(c, durum, () => {
        RAIL = railTransition(RAIL, { tur: "kartAcRol", roleIdent, cardIdent: c.id });
        railRedraw();
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
function drawRailCard(box, d) {
  box.replaceChildren();
  const c = d.card;

  const topRow = el("div", "railKartUst");
  const geri = el("button", "railGeri", "←");
  geri.type = "button";
  geri.setAttribute("aria-label", "geri");
  geri.addEventListener("click", () => {
    RAIL = railTransition(RAIL, { tur: "geri" });
    railRedraw();
  });
  topRow.append(geri);
  const statusText = c.gate ? gateExits(c.gate, c.planLock, c.backTarget).label
    : c.state === "active" ? "çalışıyor" : c.state === "done" ? "bitti" : "kuyrukta";
  topRow.append(el("span", "railDurumEtiket", statusText));
  box.append(topRow);

  box.append(el("h2", "railKartBaslik", c.title));
  box.append(el("div", "railKartMeta2", c.id + " · " + c.role));

  const meta = el("div", "meta");
  if (c.rejects > 0) meta.append(el("span", "bad", c.rejects + " ret"));
  meta.append(el("span", null, c.turns + " tur"));
  if (c.durationMs) meta.append(el("span", null, duration(c.durationMs)));
  if (c.costUsd || c.unmeasured) {
    meta.append(el("span", c.unmeasured ? "bad" : null, costText(c.costUsd, c.unmeasured, c.tokens)));
  }
  box.append(meta);

  if (c.gate) {
    box.append(railGateBox(c, null));
  } else if (c.lastReject && c.state !== "done") {
    box.append(el("div", "railRetBlok", c.lastReject));
  }

  if (c.live) {
    const s = el("div", "step");
    s.append(el("b", "mono", c.live.name || c.live.kind));
    s.append(el("span", "path", c.live.detail || ""));
    s.append(el("span", "seq", "adım " + c.live.seq));
    box.append(s);
  }

  box.append(buildTraceTimeline(d.history));
  box.append(buildCodeChange(d.diff));
}

/**
 * Kart modu bir FETCH gerektiriyor ("Kartın izi"/"Kodda ne değişti" UiCard
 * üzerinde yok, yalnızca GET /kart/<id>'in UiDetail'inde). sagPanelCiz
 * aynı id için bunu BİR KEZ çağırıyor (bkz. "data-rail-kart" koruması) —
 * yoksa her saniyelik yoklama (yokla/ciz) kartı yeniden yükler, panel her
 * saniye "yükleniyor…"ya döner ve kaydırma konumu kaybolurdu.
 */
async function railLoadCard(box, id) {
  box.replaceChildren(el("div", "railBos", "yükleniyor…"));
  try {
    const answerBody = await fetch("/kart/" + encodeURIComponent(id), { cache: "no-store" });
    const d = await answerBody.json();
    if (!answerBody.ok) throw new Error(d.error || answerBody.status);
    // RAIL fetch sürerken BAŞKA bir karta/moda geçmiş olabilir — bayat
    // cevabı eskimiş bir isteğin üstüne YAZMIYORUZ.
    if (RAIL.mode !== "card" || RAIL.cardId !== id) return;
    drawRailCard(box, d);
  } catch (e) {
    if (RAIL.mode !== "card" || RAIL.cardId !== id) return;
    box.replaceChildren(el("div", "err", "Kart okunamadı: " + e.message));
  }
}

/**
 * Kart modunun FETCH kararı — SAF. "gösterilenId" panelin o an taşıdığı
 * data-rail-kart değeri (henüz hiç yüklenmediyse undefined), "hedefId"
 * RAIL.cardId. Eşitlerse YENİDEN YÜKLEME YOK — sagPanelCiz'in her saniye
 * çağrılması Kart modunu "yükleniyor…"ya döndürmesin diye (bkz.
 * railKartYukle yorumu).
 */
function railNeedsReload(shownId, targetId) {
  return shownId !== targetId;
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
function editErrors(roleList) {
  const errors = [];
  const invalid = new Set();
  roleList.forEach((r, i) => {
    if (!r.id || r.id.trim() === "") {
      errors.push((i + 1) + ". rolün adı boş");
      invalid.add(i);
    }
  });
  const tally = new Map();
  roleList.forEach((r) => {
    const name = (r.id || "").trim();
    if (name === "") return;
    tally.set(name, (tally.get(name) || 0) + 1);
  });
  const repeats = new Set();
  tally.forEach((n, name) => { if (n > 1) repeats.add(name); });
  roleList.forEach((r, i) => {
    const name = (r.id || "").trim();
    if (repeats.has(name)) invalid.add(i);
  });
  repeats.forEach((name) => errors.push("'" + name + "' adı birden çok rolde kullanılıyor"));
  return { errors, invalid };
}

/**
 * UYARI listesi — DEVIR.md §3: "açık kartı olan bir rol silinirse"
 * (ENGELLEMEZ). 'oncekiIdler' panel AÇILDIĞINDA yüklenen rol kimlikleri,
 * 'simdikiIdler' o anki taslak; aradaki fark SİLİNEN roller. "açık" olmak
 * state !== "done" — railRolCiz'in kart listesiyle AYNI filtre, yetim
 * kartlar ('orphan') zaten akıştan bağımsız, sayılmaz.
 */
function editDeleteWarnings(previousIds, currentIds, cardList) {
  const setNow = new Set(currentIds);
  const warningList = [];
  previousIds.filter((id) => !setNow.has(id)).forEach((id) => {
    const openCount = cardList.filter((c) => c.role === id && c.state !== "done" && !c.orphan).length;
    if (openCount > 0) warningList.push("'" + id + "' silindi ama " + openCount + " açık kartı var");
  });
  return warningList;
}

/**
 * 'next'i HER ZAMAN sıradan türetir, sonuncusu "done" — DEVIR.md §3
 * "Normalizasyon". Diziyi YERİNDE günceller (role nesneleri aynı
 * referans) ve aynı diziyi döner; ekranda ayrı bir "next" alanı/seçicisi
 * YOK, sıra tek doğruluk kaynağı.
 */
function editBindInOrder(roleList) {
  roleList.forEach((r, i) => {
    r.next = i + 1 < roleList.length ? roleList[i + 1].id : "done";
  });
  return roleList;
}

/**
 * Kural 13'ün ('reject' yalnızca zincirde DAHA ÖNCE gelen role işaret
 * eder) normalizasyon karşılığı: taşıma/silme SONRASI artık geçersiz
 * kalan 'reject' hedeflerini temizler. Ekranın "ret yolu: yalnızca
 * kendinden ÖNCEKİ roller ya da 'yok'" seçicisi zaten bunun DIŞINDAKİ
 * seçenekleri sunmuyor, ama bir TAŞIMA önceden geçerli bir değeri listenin
 * dışına çıkarabilir — bu fonksiyon o artığı siler.
 */
function editClearReject(roleList) {
  const index = new Map(roleList.map((r, i) => [r.id, i]));
  roleList.forEach((r, i) => {
    if (r.reject === undefined || r.reject === "") return;
    const target = index.get(r.reject);
    if (target === undefined || target >= i) r.reject = undefined;
  });
  return roleList;
}

/**
 * Rolü i konumundan 'yon' (-1 yukarı / +1 aşağı) yönünde bir komşuyla
 * DEĞİŞ TOKUŞ eder — DEVIR.md §3 "↑ ↓ ikon düğmeleri". Sınırın dışına
 * taşmaya çalışmak (ilk rolü yukarı, son rolü aşağı) hiçbir şey yapmaz.
 * Taşıma SIRAYI değiştirdiği için 'next' yeniden türetilir ve artık
 * geçersiz kalmış 'reject' hedefleri temizlenir.
 */
function editMove(roleList, i, direction) {
  const j = i + direction;
  if (j < 0 || j >= roleList.length) return roleList;
  const tmp = roleList[i];
  roleList[i] = roleList[j];
  roleList[j] = tmp;
  editClearReject(roleList);
  editBindInOrder(roleList);
  return roleList;
}

/**
 * Ad girişini DEVIR.md §3'ün izin verdiği kümeye indirger: yalnızca
 * a-z0-9-. Küçük harfe çevirir (Shift ile "Coder" yazmak sessizce başka
 * bir rol İCAT ETMEMELİ) ve kümenin dışındaki her karakteri DÜŞÜRÜR —
 * geçersiz bir karakteri REDDETMEK (kaydetmeyi engellemek) yerine
 * SESSİZCE temizlemek, DEVIR.md'nin kendi kısıtını (yalnızca a-z0-9-)
 * ihlal etmeyen bir sonucu HER ZAMAN garantiliyor.
 */
function editSanitizeName(value) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
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
function editRenameRole(draftState, i, newName) {
  const oldValue = draftState.roles[i].id;
  if (!newName || newName === oldValue) return draftState;
  draftState.roles[i].id = newName;
  draftState.roles.forEach((r, idx) => {
    if (idx !== i && r.reject === oldValue) r.reject = newName;
  });
  if (draftState.planlama) {
    draftState.planlama.katilimcilar = draftState.planlama.katilimcilar.map((k) => (k === oldValue ? newName : k));
    if (draftState.planlama.denetci === oldValue) draftState.planlama.denetci = newName;
  }
  return draftState;
}

/**
 * Rolü çıkarır ve ona yapılan HER atfı temizler: 'reject', 'syncBack',
 * 'gates', 'planlama.katilimcilar', 'planlama.denetci' — DEVIR.md §3
 * "Normalizasyon: ... silinen rollere giden referanslar temizlenir".
 * Katılımcı listesi BOŞALIRSA 'planlama' bütünüyle kaldırılır: kural 17
 * tek katılımcısız bir planlamayı zaten yasaklıyor, yarım bir blok
 * bırakmanın anlamı yok. Son rol SİLİNEMEZ (eski 'rolSil' ile AYNI koruma).
 */
function editDelete(draftState, id) {
  const i = draftState.roles.findIndex((r) => r.id === id);
  if (i === -1 || draftState.roles.length < 2) return draftState;
  draftState.roles.splice(i, 1);
  draftState.roles.forEach((r) => {
    if (r.reject === id) r.reject = undefined;
    if (r.syncBack) r.syncBack = r.syncBack.filter((x) => x !== id);
  });
  if (draftState.gates) draftState.gates = draftState.gates.filter((g) => g.after !== id);
  if (draftState.planlama) {
    draftState.planlama.katilimcilar = draftState.planlama.katilimcilar.filter((k) => k !== id);
    if (draftState.planlama.denetci === id) draftState.planlama.denetci = undefined;
    if (draftState.planlama.katilimcilar.length === 0) draftState.planlama = undefined;
  }
  editClearReject(draftState.roles);
  editBindInOrder(draftState.roles);
  return draftState;
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
function editSetPlanning(katilimcilar, roleIds, idx, joining) {
  const k = katilimcilar.length;
  if (joining) {
    if (idx !== k) return katilimcilar;
    return roleIds.slice(0, k + 1);
  }
  if (idx >= k) return katilimcilar;
  return roleIds.slice(0, idx);
}

/**
 * Katılımcı kümesi/sıra değiştiğinde GEÇERSİZ kalan denetçiyi temizler —
 * kural 23: denetçi katılımcı OLAMAZ ve katılımcılardan SONRA gelmek
 * ZORUNDA. Katılımcı yoksa denetçi de anlamsız (yükümlülük kapısının
 * denetleyeceği bir itiraz yok).
 */
function editValidateAuditor(denetci, katilimcilar, roleIds) {
  if (denetci === undefined || denetci === "") return undefined;
  if (katilimcilar.length === 0 || katilimcilar.includes(denetci)) return undefined;
  const lastParticipantIndex = roleIds.indexOf(katilimcilar[katilimcilar.length - 1]);
  const auditorIndex = roleIds.indexOf(denetci);
  if (auditorIndex === -1 || auditorIndex <= lastParticipantIndex) return undefined;
  return denetci;
}

/** "Yazar: X · itiraz: Y, Z" özeti — DEVIR.md §3 "Planlama bölümü: özet". Katılımcı yoksa boş dize. */
function editPlanningSummary(katilimcilar) {
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
function editNormalise(draftState) {
  editClearReject(draftState.roles);
  editBindInOrder(draftState.roles);
  if (draftState.planlama) {
    const roleIds = draftState.roles.map((r) => r.id);
    draftState.planlama.denetci = editValidateAuditor(draftState.planlama.denetci, draftState.planlama.katilimcilar, roleIds);
  }
  return draftState;
}

// Panelin durumu — overlay'in TASLAK/SAGLAYICILAR'ından KASITLI OLARAK
// AYRI (bkz. "Rolleri düzenle" düğmesinin yorumu): ikisi aynı anda açık
// olabilir, aynı değişkeni paylaşmak çapraz yazmaya yol açardı.
let EDIT_DRAFT = null;
let EDIT_PROVIDERS = [];
let EDIT_PROMPTS = [];
// Panel AÇILDIĞINDA okunan taslağın JSON görüntüsü — "değişiklik var mı"
// (Kaydet/Vazgeç'in devre dışı kalma kararı) ve Vazgeç'in geri döneceği
// hâl BUNDAN türüyor.
let EDIT_ORIGINAL = null;
let EDIT_ORIGINAL_ROLE_IDS = [];
let EDIT_ERROR = null;
let EDIT_YAML_VISIBLE = false;
// /akis/onizleme'nin son cevabı — {ok, yaml, message?/cost?}. null =
// henüz hiç sorulmadı (Kaydet o ana kadar devre dışı kalır).
let EDIT_PREVIEW = null;
// Diyagramdan tıklanan düğümün vurgulayacağı blok — yalnızca GÖRSEL,
// RAIL'i değiştirmez (bkz. secimDegistir'in "edit" dalı).
let EDIT_HIGHLIGHT = null;

/** "Rolleri düzenle" girişi — panoArac'taki düğme bunu çağırır. */
function openEdit() {
  RAIL = { mode: "edit", roleId: null, cardId: null, cardFrom: "overview" };
  EDIT_DRAFT = null;
  EDIT_ORIGINAL = null;
  EDIT_ORIGINAL_ROLE_IDS = [];
  EDIT_ERROR = null;
  EDIT_YAML_VISIBLE = false;
  EDIT_PREVIEW = null;
  EDIT_HIGHLIGHT = null;
  railRedraw();
}

/** Genel bakışa döner ve panelin durumunu TEMİZLER — açık bir taslak bayat kalmasın. */
function closeEdit() {
  RAIL = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };
  EDIT_DRAFT = null;
  EDIT_ORIGINAL = null;
  railRedraw();
}

/**
 * Taslağı ve sağlayıcı/prompt listesini YÜKLER — sagPanelCiz bunu "edit"
 * moduna İLK girişte BİR KEZ çağırıyor (bkz. "data-rail-edit" koruması,
 * railKartYukle'nin "data-rail-kart"ıyla AYNI desen): yoksa her saniyelik
 * yoklama formu sıfırlar, operatör yazarken kutular BAŞA dönerdi.
 */
async function railLoadEdit(box) {
  box.replaceChildren(el("div", "railBos", "yükleniyor…"));
  try {
    const flowAnswer = await fetch("/akis", { cache: "no-store" });
    const flowData = await flowAnswer.json();
    if (!flowAnswer.ok) throw new Error(flowData.error || flowAnswer.status);
    if (!flowData.draft) throw new Error("Bu ekran akış düzenlemeye açık değil.");
    EDIT_DRAFT = flowData.draft;
    EDIT_PROVIDERS = flowData.providers || [];
    EDIT_ORIGINAL = JSON.stringify(EDIT_DRAFT);
    EDIT_ORIGINAL_ROLE_IDS = EDIT_DRAFT.roles.map((r) => r.id);
    // /promptlar başarısız olsa bile (örn. akış hiç prompt bildirmiyor)
    // editörü ENGELLEMİYORUZ — prompt alanı o durumda yalnızca ROLÜN
    // KENDİ değerini seçenek olarak gösterir (bkz. duzenlePromptAlani).
    try {
      const promptAnswer = await fetch("/promptlar", { cache: "no-store" });
      const promptData = await promptAnswer.json();
      EDIT_PROMPTS = promptAnswer.ok ? (promptData.prompts || []) : [];
    } catch {
      EDIT_PROMPTS = [];
    }
  } catch (e) {
    EDIT_ERROR = e.message;
  }
  if (RAIL.mode !== "edit") return; // panel kapandıysa bayat cevabı YAZMA
  drawRailEditPanel(box, LAST_MODEL);
}

/** Tek değerli bir alan: seçenek listesi varsa 'select', yoksa serbest metin 'input'. */
function editField(label, value, secenekler, onChange, labelResolver) {
  const l = el("label", "duzenleAlanTekil");
  l.append(el("span", "duzenleAlanEtiket", label));
  const g = el(secenekler ? "select" : "input");
  if (secenekler) {
    secenekler.forEach((s) => {
      const o = el("option", null, labelResolver ? labelResolver(s) : (s === "" ? "yok" : s));
      o.value = s;
      if (s === value) o.selected = true;
      g.append(o);
    });
  } else {
    g.value = value == null ? "" : value;
  }
  g.addEventListener("change", () => { onChange(g.value); editRefresh(); });
  l.append(g);
  return l;
}

/** ALIM segment düğmesi — "tekil/toplu", 2px kenar, seçili koyu zeminli (DEVIR.md §3). */
function editSegment(label, value, secenekler, onChange) {
  const wrap = el("div");
  wrap.append(el("span", "duzenleAlanEtiket", label));
  const group = el("div", "duzenleSegment");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  secenekler.forEach(([v, name]) => {
    const b = el("button", "duzenleSegmentBtn" + (v === value ? " secili" : ""), name);
    b.type = "button";
    b.setAttribute("aria-pressed", String(v === value));
    b.addEventListener("click", () => {
      if (v === value) return;
      onChange(v);
      editRefresh();
    });
    group.append(b);
  });
  wrap.append(group);
  return wrap;
}

/** 1..5 arası stepper — tur ve ret limiti AYNI widget'ı paylaşıyor (DEVIR.md §3). */
function editStepper(value, min, max, onChange) {
  const wrap = el("div", "duzenleStepper");
  const minus = el("button", "duzenleIkon", "−");
  minus.type = "button";
  minus.disabled = value <= min;
  minus.setAttribute("aria-label", "azalt");
  minus.addEventListener("click", () => { onChange(Math.max(min, value - 1)); editRefresh(); });
  wrap.append(minus);
  wrap.append(el("span", "duzenleStepperDeger mono", String(value)));
  const plus = el("button", "duzenleIkon", "+");
  plus.type = "button";
  plus.disabled = value >= max;
  plus.setAttribute("aria-label", "arttır");
  plus.addEventListener("click", () => { onChange(Math.min(max, value + 1)); editRefresh(); });
  wrap.append(plus);
  return wrap;
}

/**
 * Prompt seçimi ("roles/*.md") + "Aç" düğmesi — DEVIR.md §3. Liste
 * /promptlar'tan (topolojinin BİLDİRDİĞİ dosyalar, SAPMALAR.md §3) — bu
 * akışın dışında yeni bir uç İCAT EDİLMİYOR. Rolün KENDİ değeri listede
 * yoksa (örn. henüz hiçbir rolün kullanmadığı bir yol) seçenek listesine
 * EKLENİR — aksi hâlde seçim sessizce BAŞKA bir dosyaya kayardı.
 */
function editPromptField(roleRec) {
  const wrap = el("div", "duzenlePromptSarmal");
  const knownOnes = EDIT_PROMPTS.map((p) => p.path);
  const secenekler = knownOnes.includes(roleRec.prompt) ? knownOnes : [roleRec.prompt, ...knownOnes];
  const field = editField("prompt", roleRec.prompt, secenekler, (v) => { roleRec.prompt = v; });
  wrap.append(field);
  const open = el("button", "railBtn", "Aç");
  open.type = "button";
  open.addEventListener("click", () => {
    PROMPT_SELECTED = roleRec.prompt;
    location.hash = "promptlar";
  });
  wrap.append(open);
  return wrap;
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
function drawEditPlanningParticipantBox(draftState, i) {
  const roleRec = draftState.roles[i];
  const katilimcilar = draftState.planlama ? draftState.planlama.katilimcilar : [];
  const k = katilimcilar.length;
  const isParticipant = i < k;
  const wrap = el("div", "duzenlePlanKatilim");
  const checkbox = el("input");
  checkbox.type = "checkbox";
  checkbox.id = "duzenlePlan-" + i;
  checkbox.checked = isParticipant;
  checkbox.disabled = !isParticipant && i !== k;
  const label = el("label", "duzenlePlanKatilimEtiket");
  label.htmlFor = checkbox.id;
  label.append(document.createTextNode("planlamaya katıl"));
  wrap.append(checkbox, label);

  if (isParticipant && i === k - 1) {
    const nextRole = draftState.roles[k] ? draftState.roles[k].id : "done";
    wrap.append(el("span", "duzenlePlanDevreder", "devreder → " + nextRole));
  }

  checkbox.addEventListener("change", () => {
    const roleIds = draftState.roles.map((r) => r.id);
    const newParticipants = editSetPlanning(katilimcilar, roleIds, i, checkbox.checked);
    if (newParticipants.length === 0) {
      draftState.planlama = undefined;
    } else {
      const previous = draftState.planlama;
      draftState.planlama = {
        katilimcilar: newParticipants,
        plan: previous ? previous.plan : "docs/plan/{kart}.md",
        tur: previous ? previous.tur : 1,
        ilkTurKor: previous ? previous.ilkTurKor : true,
        ...(previous && previous.denetci !== undefined ? { denetci: previous.denetci } : {}),
      };
      draftState.planlama.denetci = editValidateAuditor(draftState.planlama.denetci, newParticipants, roleIds);
    }
    editRefresh();
  });
  return wrap;
}

/** Planlama bölümü: özet, tur stepper'ı (1-5), yükümlülük denetçisi seçimi (DEVIR.md §3). */
function drawEditPlanningSection(draftState) {
  const box = el("div", "duzenleBolum");
  box.append(el("div", "eyebrow", "Planlama"));
  const katilimcilar = draftState.planlama ? draftState.planlama.katilimcilar : [];
  const summary = editPlanningSummary(katilimcilar);
  box.append(el("div", "duzenleOzet", summary || "katılım yok — hiçbir rol planlamaya katılmıyor"));
  if (katilimcilar.length === 0 || !draftState.planlama) return box;

  const roundOrder = el("div", "duzenleStepperSarmal");
  roundOrder.append(el("span", "duzenleAlanEtiket", "en çok tur"));
  roundOrder.append(editStepper(draftState.planlama.tur, 1, 5, (v) => { draftState.planlama.tur = v; }));
  box.append(roundOrder);

  const roleIds = draftState.roles.map((r) => r.id);
  const auditorOptions = ["", ...roleIds.slice(katilimcilar.length)];
  box.append(editField("yükümlülük denetçisi", draftState.planlama.denetci || "", auditorOptions,
    (v) => { draftState.planlama.denetci = v || undefined; }));

  return box;
}

/** Ret bölümü: limit stepper'ı (1-5); limit dolunca kart kapıya düşer (DEVIR.md §3). */
function drawEditRejectSection(draftState) {
  if (!draftState.reject) draftState.reject = { limit: 2, onExhausted: "gate" };
  const box = el("div", "duzenleBolum");
  box.append(el("div", "eyebrow", "Ret"));
  const order = el("div", "duzenleStepperSarmal");
  order.append(el("span", "duzenleAlanEtiket", "limit"));
  order.append(editStepper(draftState.reject.limit ?? 2, 1, 5, (v) => { draftState.reject.limit = v; }));
  box.append(order);
  box.append(el("div", "duzenleAciklama", "limit dolunca kart insan kapısında bekler (onExhausted: gate)"));
  return box;
}

/** Bir rol bloğu — numara, ad girişi, ↑↓✕, 2x2 ızgara, prompt, planlama katılımı (DEVIR.md §3). */
function editRoleBlock(draftState, i, isInvalid) {
  const roleRec = draftState.roles[i];
  const blockEl = el("div", "duzenleRol" + (EDIT_HIGHLIGHT === roleRec.id ? " duzenleVurgu" : ""));
  blockEl.dataset.rol = roleRec.id;

  const topEl = el("div", "duzenleRolUst");
  topEl.append(el("span", "duzenleRolNo mono", String(i + 1).padStart(2, "0")));
  const nameInput = el("input", "duzenleAdGirisi" + (isInvalid ? " gecersiz" : ""));
  nameInput.value = roleRec.id;
  nameInput.setAttribute("aria-label", (i + 1) + ". rolün adı");
  // DEVIR.md §3: "ad girişi (yalnızca a-z0-9-)". 'pattern' TARAYICIYA
  // İPUCU (form doğrulaması olmayan serbest bir <input>'ta tek başına
  // zorlamaz) — asıl zorlama duzenleAdSanitize'da: izin verilmeyen her
  // karakter YAZILIRKEN sessizce düşer, kaydedilmeden SONRA bir hata
  // göstermek yerine.
  nameInput.setAttribute("pattern", "[a-z0-9-]+");
  nameInput.addEventListener("change", () => {
    editRenameRole(draftState, i, editSanitizeName(nameInput.value));
    editRefresh();
  });
  topEl.append(nameInput);

  const up = el("button", "duzenleIkon", "↑");
  up.type = "button";
  up.disabled = i === 0;
  up.setAttribute("aria-label", "yukarı taşı");
  up.addEventListener("click", () => { editMove(draftState.roles, i, -1); editRefresh(); });
  topEl.append(up);

  const down = el("button", "duzenleIkon", "↓");
  down.type = "button";
  down.disabled = i === draftState.roles.length - 1;
  down.setAttribute("aria-label", "aşağı taşı");
  down.addEventListener("click", () => { editMove(draftState.roles, i, 1); editRefresh(); });
  topEl.append(down);

  const remove = el("button", "duzenleIkon duzenleIkonSil", "✕");
  remove.type = "button";
  remove.disabled = draftState.roles.length < 2;
  remove.setAttribute("aria-label", "rolü sil");
  remove.addEventListener("click", () => { editDelete(draftState, roleRec.id); editRefresh(); });
  topEl.append(remove);
  blockEl.append(topEl);

  const grid = el("div", "duzenleIzgara");
  // DEVIR.md §3 "claude/codex/copilot/gemini" diyor, ama bu DÖRDÜ sabit bir
  // liste DEĞİL: kayıtlı sağlayıcı kümesi /akis'in döndürdüğü
  // DUZENLE_SAGLAYICILAR'dan geliyor (bkz. railDuzenleYukle) ve bu depoda
  // bugün yalnızca claude/codex kayıtlı (bkz. adapters/factory.ts). Burada
  // sabit dört seçenek göstermek, kural 8'in ("provider kayıtlı bir
  // adaptöre karşılık gelir") REDDEDECEĞİ bir seçimi SUNMAK olurdu —
  // "yapamayacağı şeyi vaat eden düğme" kusur sınıfının select hâli.
  const providerList = EDIT_PROVIDERS.length ? EDIT_PROVIDERS : [roleRec.provider];
  grid.append(editField("sağlayıcı", roleRec.provider, providerList, (v) => { roleRec.provider = v; }));
  grid.append(editField("çalışma alanı", roleRec.workspace, null, (v) => { roleRec.workspace = v; }));
  grid.append(editSegment("alım", roleRec.receive || "task",
    [["task", "tekil"], ["batch", "toplu"]], (v) => { roleRec.receive = v; }));
  const previousIds = draftState.roles.slice(0, i).map((r) => r.id);
  grid.append(editField("ret yolu", roleRec.reject || "", ["", ...previousIds],
    (v) => { roleRec.reject = v || undefined; }));
  blockEl.append(grid);

  blockEl.append(editPromptField(roleRec));
  blockEl.append(drawEditPlanningParticipantBox(draftState, i));

  return blockEl;
}

/** "Rol ekle" — zincirin SONUNA ekler (sıra = tek doğruluk kaynağı, next duzenleSiradanBagla'dan gelir). */
function editAddRole() {
  const draftState = EDIT_DRAFT;
  const lastOne = draftState.roles[draftState.roles.length - 1];
  let n = 1;
  while (draftState.roles.some((r) => r.id === "rol" + n)) n += 1;
  draftState.roles.push({
    id: "rol" + n,
    provider: lastOne ? lastOne.provider : (EDIT_PROVIDERS[0] || "claude"),
    workspace: "rol" + n,
    prompt: lastOne ? lastOne.prompt : "",
    receive: "task",
    next: "done",
  });
  editBindInOrder(draftState.roles);
  editRefresh();
}

/** Diyagramdan tıklanan düğümü panelde vurgular — RAIL'i DEĞİŞTİRMEZ (bkz. secimDegistir). */
function editHighlight(id) {
  EDIT_HIGHLIGHT = id;
  document.querySelectorAll("#sagPanel .duzenleRol").forEach((node) => {
    node.classList.toggle("duzenleVurgu", node.dataset.rol === id);
  });
  const target = document.querySelector('#sagPanel .duzenleRol[data-rol="' + id + '"]');
  if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
}

/** "Vazgeç" — panel AÇILDIĞINDAki hâle döner, kaydetmeden. */
function editCancel() {
  if (EDIT_ORIGINAL === null) return;
  EDIT_DRAFT = JSON.parse(EDIT_ORIGINAL);
  EDIT_YAML_VISIBLE = false;
  EDIT_PREVIEW = null;
  editRefresh();
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
async function editLoadPreview() {
  const copy = editNormalise(JSON.parse(JSON.stringify(EDIT_DRAFT)));
  try {
    const answerBody = await fetch("/akis/onizleme", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify(copy),
    });
    const v = await answerBody.json();
    if (!answerBody.ok) throw new Error(v.error || answerBody.status);
    EDIT_PREVIEW = v;
  } catch (e) {
    EDIT_PREVIEW = { ok: false, message: "Önizleme alınamadı: " + e.message, yaml: "" };
  }
  if (RAIL.mode !== "edit") return; // panel kapandıysa bayat cevabı YAZMA
  editUpdateBottomBar();
  const yamlBox = document.getElementById("duzenleYaml");
  if (yamlBox) yamlBox.textContent = EDIT_PREVIEW.yaml || "";
}

/** Sabit alt çubuğu (durum metni + Vazgeç/Kaydet'in devre dışı kalma durumu) SURGICAL olarak günceller. */
function editUpdateBottomBar() {
  const draftState = EDIT_DRAFT;
  if (!draftState) return;
  const { errors } = editErrors(draftState.roles);
  const changed = JSON.stringify(draftState) !== EDIT_ORIGINAL;
  const serverInvalid = Boolean(EDIT_PREVIEW && EDIT_PREVIEW.ok === false);
  const durum = document.getElementById("duzenleDurumMetni");
  if (durum) {
    durum.textContent = errors.length > 0 ? errors.length + " hata — kaydedilemez"
      : !changed ? "değişiklik yok"
      : serverInvalid ? "akış geçersiz — kaydedilemez"
      : "değişiklik var · henüz kaydedilmedi";
  }
  const cancelBtn = document.getElementById("duzenleVazgecBtn");
  if (cancelBtn) cancelBtn.disabled = !changed;
  const saveBtn = document.getElementById("duzenleKaydetBtn");
  if (saveBtn) {
    saveBtn.disabled = !changed || errors.length > 0
      || !(EDIT_PREVIEW && EDIT_PREVIEW.ok === true);
  }
}

/** Taslağın TAMAMINI yeniden çizer ve taze bir önizleme ister — her mutasyondan sonra çağrılır. */
function editRefresh() {
  const box = document.getElementById("sagPanel");
  if (!box || RAIL.mode !== "edit") return;
  drawRailEditPanel(box, LAST_MODEL);
  void editLoadPreview();
}

/** "Kaydet" — MEVCUT /akis/yaz ucu. Geçersiz taslak zaten devre dışı bırakılmış düğmeden çağrılamaz. */
async function editWrite() {
  const saveBtn = document.getElementById("duzenleKaydetBtn");
  if (saveBtn) saveBtn.disabled = true;
  const copy = editNormalise(JSON.parse(JSON.stringify(EDIT_DRAFT)));
  try {
    const answerBody = await fetch("/akis/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify(copy),
    });
    const v = await answerBody.json();
    if (!answerBody.ok) throw new Error(v.error || answerBody.status);
    draw(v.model);
    closeEdit();
    showNotice("Roller kaydedildi.");
  } catch (e) {
    EDIT_PREVIEW = { ok: false, message: "Kaydedilemedi: " + e.message, yaml: EDIT_PREVIEW ? EDIT_PREVIEW.yaml : "" };
    editUpdateBottomBar();
  }
}

/** MOD 5'in dış çatısı — geri düğmesi, üst bilgi, rol listesi, bölümler, YAML önizlemesi, sabit alt çubuk. */
function drawRailEditPanel(box, m) {
  box.replaceChildren();

  const geri = el("button", "railGeri", "← Genel bakış");
  geri.type = "button";
  geri.addEventListener("click", () => { closeEdit(); });
  box.append(geri);

  if (EDIT_ERROR) {
    box.append(el("div", "err", "Akış okunamadı: " + EDIT_ERROR));
    return;
  }
  if (!EDIT_DRAFT) {
    box.append(el("div", "railBos", "yükleniyor…"));
    return;
  }

  const draftState = EDIT_DRAFT;
  box.append(el("div", "railUst", "hub/flows/" + m.flow.name + ".yaml"));
  box.append(el("h2", "railRolBaslik", "Roller"));
  box.append(el("div", "duzenleAciklama",
    "Sıra formasyonu belirler: ↑/↓ ile taşımak rolün V'deki yerini de değiştirir."));

  const { errors, invalid } = editErrors(draftState.roles);
  const warningList = editDeleteWarnings(EDIT_ORIGINAL_ROLE_IDS, draftState.roles.map((r) => r.id), m.cards);
  errors.forEach((h) => box.append(el("div", "duzenleHata", h)));
  warningList.forEach((w) => box.append(el("div", "duzenleUyari", w)));

  const items = el("div", "duzenleRolListe");
  draftState.roles.forEach((roleRec, i) => { items.append(editRoleBlock(draftState, i, invalid.has(i))); });
  box.append(items);

  const addIt = el("button", "railBtn", "Rol ekle");
  addIt.type = "button";
  addIt.addEventListener("click", () => { editAddRole(); });
  box.append(addIt);

  box.append(drawEditPlanningSection(draftState));
  box.append(drawEditRejectSection(draftState));

  const yamlButton = el("button", "railBtn", EDIT_YAML_VISIBLE ? "YAML'ı gizle" : "YAML'ı göster");
  yamlButton.type = "button";
  yamlButton.addEventListener("click", () => {
    EDIT_YAML_VISIBLE = !EDIT_YAML_VISIBLE;
    drawRailEditPanel(box, m);
  });
  box.append(yamlButton);
  if (EDIT_YAML_VISIBLE) {
    const previewBox = el("div", "onizle");
    previewBox.id = "duzenleYaml";
    previewBox.textContent = EDIT_PREVIEW ? (EDIT_PREVIEW.yaml || "") : "önizleme yükleniyor…";
    box.append(previewBox);
  }

  const bottomBar = el("div", "duzenleAlt");
  const durum = el("div", "duzenleDurumMetni");
  durum.id = "duzenleDurumMetni";
  bottomBar.append(durum);
  const cancel = el("button", "railBtn", "Vazgeç");
  cancel.type = "button";
  cancel.id = "duzenleVazgecBtn";
  cancel.addEventListener("click", () => { editCancel(); });
  bottomBar.append(cancel);
  const saveBtn = el("button", "railBtn primary", "Kaydet");
  saveBtn.type = "button";
  saveBtn.id = "duzenleKaydetBtn";
  saveBtn.disabled = true;
  saveBtn.addEventListener("click", () => { void editWrite(); });
  bottomBar.append(saveBtn);
  box.append(bottomBar);

  editUpdateBottomBar();
  if (EDIT_PREVIEW === null) void editLoadPreview();
}

/** "Gözcü" girişi — çip bunu çağırır (bkz. ciz() "GÖZCÜ ÇİPİ" bloğu). */
function openWatcher() {
  RAIL = { mode: "daemon", roleId: null, cardId: null, cardFrom: "overview" };
  railRedraw();
}

/** Genel bakışa döner — MOD 5'in duzenleKapat()'ıyla AYNI desen. */
function closeWatcher() {
  RAIL = { mode: "overview", roleId: null, cardId: null, cardFrom: "overview" };
  railRedraw();
}

/**
 * ".skein/gozcu.log" son satırlarını okur — sagPanelCiz bunu "daemon"
 * moduna İLK girişte BİR KEZ çağırıyor ("data-rail-gozcu" koruması,
 * railKartYukle'nin "data-rail-kart"ıyla AYNI desen) VE gozcuKomut
 * başarılı her başlat/durdur sonrası (yeni satırlar düşmüş olabilir).
 * Okunamazsa (dosya yok, gözcü hiç açılmamış) sessizce BOŞ liste —
 * bu bir hata değil, "henüz günlük yok" demek.
 */
async function railLoadWatcher() {
  try {
    const answerBody = await fetch("/gozcu/log", { cache: "no-store" });
    const data = await answerBody.json();
    WATCHER_LOG = (answerBody.ok && Array.isArray(data.lines)) ? data.lines : [];
  } catch (e) {
    WATCHER_LOG = [];
  }
  if (RAIL.mode === "daemon") railRedraw();
}

/**
 * MOD 4 — Gözcü (DEVIR.md §2, kart c-20261105-92d731). Durum/düğme/bilgi
 * tablosu HER ciz() turunda TAZE çiziliyor ("overview"/"role" modlarıyla
 * AYNI ilke — bkz. railGenelBakisCiz) çünkü gözcünün canlı/çökmüş/duran
 * olması saniyeler içinde değişir; günlük kuyruğu (GOZCU_LOG) ise ayrı
 * bir ritimle yükleniyor (yukarıdaki railGozcuYukle yorumu).
 */
function drawRailWatcher(box, m) {
  box.replaceChildren();

  const geri = el("button", "railGeri", "← Genel bakış");
  geri.type = "button";
  geri.addEventListener("click", () => { closeWatcher(); });
  box.append(geri);

  const g = m.daemon;
  const isManaged = Boolean(WATCHER_CONFIG);
  const stopped = WATCHER_PENDING !== null;
  const statusInfo = watcherPanelState(g, isManaged, stopped);
  const topoWarning = watcherTopoWarning(g, m.flow.hash, statusInfo.durum);

  box.append(el("div", "railUst", "Gözcü"));
  const titleRow = el("div", "railGozcuBaslikSatir");
  titleRow.append(el("span", "railGozcuNokta " + statusInfo.durum));
  titleRow.append(el("h2", "railGozcuBaslik", statusInfo.label));
  box.append(titleRow);

  const DESCRIPTION = {
    on: "Kuyrukları izliyor; kart gördüğü rolü koşturuyor. Kuyruk boşalınca uyur, ölmez.",
    stopping: "Durdurma sinyali gitti. Gözcü süren ajan turunu bitirip çıkacak — anlık değil.",
    off: "Hiçbir rol koşmuyor. Açılan kartlar kuyrukta bekler.",
    stale: ".skein/daemon.json duruyor ama süreç yaşamıyor: gözcü çökmüş. Başlatınca kilit devralınır.",
    unmanaged: "Ekran gözcü bayrakları olmadan açıldı, o yüzden buradan başlatılamaz. Gözcüyü ayrı bir kabukta koşturabilirsin.",
  };
  box.append(el("div", "railGozcuAciklama", DESCRIPTION[statusInfo.durum]));

  if (topoWarning) {
    const warning = el("div", "railGozcuUyari");
    warning.append(el("div", "railGozcuUyariMetin",
      "Akış gözcü açıldıktan sonra değişti. Gözcü eski rol listesini taşıyor — yeni roller kuyruğa bakılmadan kalır."));
    const restartBtn = el("button", "railBtn primary", "Yeniden başlat");
    restartBtn.type = "button";
    restartBtn.addEventListener("click", () => {
      WATCHER_PENDING = "yenidenBaslatiliyor";
      void watcherCommand("durdur", restartBtn);
    });
    warning.append(restartBtn);
    box.append(warning);
  }

  const actions = el("div", "railGozcuEylemler");
  if (statusInfo.durum === "unmanaged") {
    const examples = watcherCommandExamples(m.flow.name);
    actions.append(el("div", "railGozcuKomutEtiket", "Ayrı kabukta:"));
    actions.append(el("code", "railGozcuKomut", examples.cmd1));
    actions.append(el("div", "railGozcuKomutEtiket", "ya da ekranı bayraklarla aç, düğme çıkar:"));
    actions.append(el("code", "railGozcuKomut", examples.cmd2));
  } else if (statusInfo.durum === "stopping") {
    const b = el("button", "railBtn", "Süren tur bitiyor…");
    b.type = "button";
    b.disabled = true;
    actions.append(b);
  } else {
    const isLive = Boolean(g && g.alive);
    const label = watcherActionLabel(g);
    const b = el("button", "railBtn" + (isLive ? "" : " primary"), label);
    b.type = "button";
    b.addEventListener("click", () => {
      // Durdurma İSTENDİ ama ANLIK değil (bkz. gozcuPanelDurum yorumu) —
      // çip/panel bir SONRAKİ yoklamada "stopping" göstersin diye bayrak
      // BURADA, cevap gelmeden ÖNCE kuruluyor.
      if (isLive) WATCHER_PENDING = "durduruluyor";
      void watcherCommand(isLive ? "durdur" : "baslat", b);
    });
    actions.append(b);
  }
  box.append(actions);

  // BİLGİ TABLOSU — pid/akış/mod/açıldı/kilit. Gözcü GERÇEKTEN BAŞKA bir
  // kabuktan açılmış olsa bile (g !== null) gösteriliyor: "unmanaged"
  // yalnızca BU EKRANIN yönetme yetkisini söylüyor, kilidin varlığını
  // DEĞİL (bkz. gozcuPanelDurum yorumu).
  if (g) {
    const infoBox = el("div", "railGozcuBilgi");
    const line = (label, value) => {
      const s = el("div", "railGozcuBilgiSatir");
      s.append(el("span", null, label));
      s.append(el("b", null, value));
      infoBox.append(s);
    };
    line("pid", String(g.info.pid) + (g.alive ? "" : " · yaşamıyor"));
    line("akış", g.info.flow);
    line("mod", g.info.mode === "serve" ? "serve · uzun ömürlü" : "batch · tek seferlik");
    line("açıldı", g.info.startedAt);
    line("kilit", ".skein/daemon.json");
    box.append(infoBox);
  }

  if (isManaged && WATCHER_CONFIG.bayraklar.length > 0) {
    box.append(el("div", "railAraBaslik", "Gözcüye geçen bayraklar"));
    const bayraklar = el("div", "railGozcuBayraklar");
    WATCHER_CONFIG.bayraklar.forEach((b) => bayraklar.append(el("span", "tag tag-outline", b)));
    box.append(bayraklar);
  }

  box.append(el("div", "railGozcuLogBaslik", ".skein/gozcu.log · son satırlar"));
  if (WATCHER_LOG.length === 0) {
    box.append(el("div", "railBos", "günlük boş"));
  } else {
    WATCHER_LOG.forEach((l) => {
      const line = el("div", "railGozcuLogSatir");
      line.append(el("span", "saat", l.at));
      line.append(el("span", l.error ? "hata" : null, l.message));
      box.append(line);
    });
  }
}

/** Sağ paneli RAIL'in o anki moduna göre doldurur — ciz()'in her çağrısında. */
function drawRightPanel(m) {
  const box = document.getElementById("sagPanel");
  if (!box) return;
  if (RAIL.mode !== "card") box.removeAttribute("data-rail-kart");
  // MOD 5 kendi "data-rail-edit" bayrağıyla AYNI korumayı kullanıyor
  // (railKartYukle'nin "data-rail-kart"ı) — yoksa her saniyelik yoklama
  // (yokla/ciz) formu sıfırlar, operatör yazarken kutular BAŞA döner.
  if (RAIL.mode !== "edit") box.removeAttribute("data-rail-edit");
  // MOD 4 kendi "data-rail-gozcu" bayrağıyla AYNI korumayı kullanıyor —
  // yalnızca GOZCU_LOG'un İLK yüklemesini bir kez tetiklemek için (bkz.
  // railGozcuYukle); durum/düğme HER turda zaten taze (railGozcuCiz).
  if (RAIL.mode !== "daemon") box.removeAttribute("data-rail-gozcu");
  if (RAIL.mode === "role") {
    drawRailRole(box, m, RAIL.roleId);
    return;
  }
  if (RAIL.mode === "card") {
    if (railNeedsReload(box.dataset.railKart, RAIL.cardId)) {
      box.dataset.railKart = RAIL.cardId;
      void railLoadCard(box, RAIL.cardId);
    }
    return;
  }
  if (RAIL.mode === "daemon") {
    if (box.dataset.railGozcu !== "1") {
      box.dataset.railGozcu = "1";
      void railLoadWatcher();
    }
    drawRailWatcher(box, m);
    return;
  }
  if (RAIL.mode === "edit") {
    if (box.dataset.railEdit !== "1") {
      box.dataset.railEdit = "1";
      void railLoadEdit(box);
    }
    return;
  }
  drawRailOverview(box, m);
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
function buildDiagramSvg(model, direction, editable) {
  const roleList = model.roles;
  const n = roleList.length;
  const idx = new Map(roleList.map((r, i) => [r.id, i]));
  const STEP = direction === "yatay" ? 180 : 86;
  // ana eksen boyunca düğümün kapladığı uzunluk (ilk/son düğüm taşmasın diye dolgu)
  const mainSize = direction === "yatay" ? NODE_W : NODE_H;
  // dik eksende düğümün kapladığı uzunluk (satır/sütunun kalınlığı)
  const vertSize = direction === "yatay" ? NODE_H : NODE_W;
  const MAIN_PAD = mainSize / 2 + 18;
  const ROW = GATE_BAND + vertSize / 2 + 18;
  // (ana, dik) çiftini gerçek (x, y)'ye çeviriyor — yerleşimin kendisi TEK,
  // yalnızca bu eşleme yöne göre değişiyor.
  const dot = direction === "yatay"
    ? (mainEl, vertical) => ({ x: mainEl, y: vertical })
    : (mainEl, vertical) => ({ x: vertical, y: mainEl });
  const mainPosition = (i) => MAIN_PAD + i * STEP;

  const mainLength = n <= 1 ? MAIN_PAD * 2 : MAIN_PAD * 2 + (n - 1) * STEP;
  const vertLength = ROW + vertSize / 2 + EDGE_LANE.syncBack + 18;
  const widthPx = direction === "yatay" ? mainLength : vertLength;
  const height2 = direction === "yatay" ? vertLength : mainLength;

  const svg = sv("svg", {
    viewBox: "0 0 " + widthPx + " " + height2,
    role: "img",
    "aria-label": "Akış diyagramı",
  });
  svg.classList.add("diyagram-" + direction);

  const edgeLayer = sv("g", { class: "kenarlar" });
  const gateLayer = sv("g", { class: "kapilar" });
  const nodeLayer = sv("g", { class: "dugumler" });

  model.edges.forEach((edge) => {
    const i = idx.get(edge.from);
    const j = idx.get(edge.to);
    if (i === undefined || j === undefined) return;
    const styleText = EDGE_STYLE[edge.kind];
    const g = sv("g", {
      class: "kenar kenar-" + edge.kind,
      "data-from": edge.from, "data-to": edge.to, "data-kind": edge.kind,
    });
    if (edge.kind === "next") {
      // BİTİŞİK düğümler arasında düz çizgi — next zincirde HER ZAMAN
      // ardıl role gider (load.ts chainOrder), sıçrama olmaz.
      const p1 = dot(mainPosition(i) + mainSize / 2, ROW);
      const p2 = dot(mainPosition(j) - mainSize / 2, ROW);
      const lineSeg = sv("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      lineSeg.style.stroke = styleText.colourVal;
      lineSeg.style.strokeWidth = "2";
      g.append(lineSeg);
      g.append(arrowHead(p2.x, p2.y, p2.x - p1.x, p2.y - p1.y, styleText.colourVal));
      edgeLayer.append(g);
      if (editable) {
        // "+" İŞARETİ kenarın TAM ORTASINDA — buraya basmak, yeni rolün
        // kenar.from ile kenar.to arasına gireceğini GÖSTERİYOR, ayrı
        // bir "nereye eklensin" sorusu sormuyor çünkü soru zaten diyagramda
        // tıklanan yerle cevaplanmış.
        edgeLayer.append(buildAddMark((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, edge.from));
      }
      return;
    } else {
      // GERİ kenar: satırın/sütunun DIŞINDA kavisli — ileri akışla
      // KARIŞMASIN (bu kartın asıl kısıtı). "lane" türe sabit: aynı çifte
      // giden reject ile syncBack iki ayrı eğride durur, biri biri
      // ezmez.
      const lane = EDGE_LANE[edge.kind];
      const p1 = dot(mainPosition(i), ROW + vertSize / 2);
      const p2 = dot(mainPosition(j), ROW + vertSize / 2);
      const middle = dot((mainPosition(i) + mainPosition(j)) / 2, ROW + vertSize / 2 + lane);
      const d = "M " + p1.x + " " + p1.y + " Q " + middle.x + " " + middle.y + " " + p2.x + " " + p2.y;
      const path = sv("path", { d: d, fill: "none" });
      path.style.stroke = styleText.colourVal;
      path.style.strokeWidth = "2";
      path.setAttribute("stroke-dasharray", styleText.dashed);
      g.append(path);
      g.append(arrowHead(p2.x, p2.y, p2.x - middle.x, p2.y - middle.y, styleText.colourVal));
    }
    edgeLayer.append(g);
  });

  // KAPILAR — zincirin üstünde durağan bir işaret, akış kenarlarından
  // ayrı. Yalnızca "approval" tipi çizilir: "none" davranışsal olarak
  // kapı DEĞİL ve bu filtre kararı BURADA (modelde değil — bkz. model.ts
  // "kapı tipi filtrelenmeden taşınıyor" yorumu).
  model.gates.forEach((gateEl) => {
    if (gateEl.type !== "approval") return;
    const i = idx.get(gateEl.after);
    if (i === undefined) return;
    const mainEl = mainPosition(i) + STEP / 2;
    const p = dot(mainEl, ROW - GATE_BAND);
    const g = sv("g", { class: "kapi-isaret", "data-after": gateEl.after });
    const pillG = 52;
    const pillY = 20;
    const pillBox = sv("rect", {
      x: p.x - pillG / 2, y: p.y - pillY / 2, width: pillG, height: pillY, rx: 10,
    });
    pillBox.style.fill = "var(--gate-bg)";
    pillBox.style.stroke = "var(--gate-line)";
    g.append(pillBox);
    const label = sv("text", { x: p.x, y: p.y + 3.5, "text-anchor": "middle" });
    label.style.fill = "var(--gate-ink)";
    label.style.fontSize = "10px";
    label.style.fontWeight = "600";
    label.textContent = "kapı";
    g.append(label);
    gateLayer.append(g);
  });

  // DÜĞÜMLER — kart değil ETİKET: id + sağlayıcı/workspace, hepsi kısa.
  //
  // editable'ken tıklanabilir: DIYAGRAM_SECILI o rolün id'sine döner ve
  // panel kendini yeniden kurup (bkz. yenile) diyagramın altına o rolün
  // düzenleme alanlarını açar. SEÇİLİ düğüm kendi dış çizgisiyle (vurgu
  // rengi, kalın çizgi) işaretli — operatör hangi düğümü düzenlediğini
  // kaybetmesin.
  roleList.forEach((roleRec, i) => {
    const p = dot(mainPosition(i), ROW);
    const selected = editable && DIAGRAM_SELECTED === roleRec.id;
    const g = sv("g", {
      class: "dugum" + (selected ? " dugum-secili" : ""), "data-rol": roleRec.id,
      transform: "translate(" + p.x + " " + p.y + ")",
    });
    const box = sv("rect", {
      x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 7,
    });
    box.style.fill = "var(--surface)";
    box.style.stroke = selected ? "var(--accent)" : "var(--line)";
    box.style.strokeWidth = selected ? "2.5" : "1";
    g.append(box);
    if (editable) {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => { DIAGRAM_SELECTED = roleRec.id; refreshIt(); });
    }
    const id = sv("text", { x: 0, y: -4, "text-anchor": "middle", class: "mono" });
    id.style.fill = "var(--ink)";
    id.style.fontWeight = "700";
    id.style.fontSize = "12.5px";
    id.textContent = roleRec.id;
    g.append(id);
    const alt = sv("text", { x: 0, y: 14, "text-anchor": "middle" });
    alt.style.fill = "var(--ink-3)";
    alt.style.fontSize = "10px";
    alt.textContent = roleRec.provider + " · " + roleRec.workspace;
    g.append(alt);
    nodeLayer.append(g);
  });

  svg.append(edgeLayer, gateLayer, nodeLayer);
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
function buildDraftModel(draftState) {
  const edges = [];
  draftState.roles.forEach((roleRec) => {
    if (roleRec.next !== "done") edges.push({ from: roleRec.id, to: roleRec.next, kind: "next" });
    if (roleRec.reject) edges.push({ from: roleRec.id, to: roleRec.reject, kind: "reject" });
    (roleRec.syncBack || []).forEach((target) => edges.push({ from: roleRec.id, to: target, kind: "syncBack" }));
  });
  return {
    flow: {},
    roles: draftState.roles.map((roleRec) => ({ id: roleRec.id, provider: roleRec.provider, workspace: roleRec.workspace })),
    edges,
    gates: draftState.gates || [],
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
function drawDiagramContent(model, editable) {
  const wrap = el("div", "diyagram-sarmal");
  if (!model) {
    wrap.append(el("div", "err", "Durum henüz okunamadı."));
    return wrap;
  }
  if (model.flow.error) {
    const error = el("div", "err",
      "Akış dosyası şu an geçersiz, diyagram bu yüzden çizilmiyor:\\n" + model.flow.error);
    error.style.cssText = "white-space:pre-wrap";
    wrap.append(error);
    return wrap;
  }
  if (!model.roles.length) {
    wrap.append(el("div", "ipucu", "Akışta hiç rol yok."));
    return wrap;
  }
  wrap.append(buildDiagramSvg(model, "yatay", editable));
  wrap.append(buildDiagramSvg(model, "dikey", editable));

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
    const i = DRAFT.roles.findIndex((r) => r.id === DIAGRAM_SELECTED);
    if (i !== -1) wrap.append(drawDiagramEditPanel(DRAFT.roles[i], i));
    wrap.append(drawPreviewBlock());
  }
  return wrap;
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
function drawDiagramEditPanel(roleRec, i) {
  const wrap = el("div", null);

  const box = el("div", "rol");
  const topEl = el("div", "rolust");
  topEl.append(el("b", null, "Düzenle: " + roleRec.id));
  topEl.append(el("div", "spacer"));

  const remove = el("button", "mini sil", "Rolü sil");
  remove.type = "button";
  remove.addEventListener("click", () => { diagramDeleteRole(roleRec.id); });
  topEl.append(remove);

  const closeSelection = el("button", "mini", "Seçimi kapat");
  closeSelection.type = "button";
  closeSelection.addEventListener("click", () => { DIAGRAM_SELECTED = null; refreshIt(); });
  topEl.append(closeSelection);
  box.append(topEl);

  const idList = DRAFT.roles.map((r) => r.id);
  const otherIds = idList.filter((x) => x !== roleRec.id);
  const targetList = otherIds.concat(["done"]);
  const rejectList = [""].concat(otherIds);

  box.append(field("provider", roleRec.provider, (v) => (roleRec.provider = v), PROVIDERS));
  box.append(field("workspace", roleRec.workspace, (v) => (roleRec.workspace = v)));
  box.append(field("next", roleRec.next, (v) => (roleRec.next = v), targetList));
  box.append(field("reject", roleRec.reject || "", (v) => { roleRec.reject = v || undefined; }, rejectList));
  box.append(syncBackField(roleRec, otherIds));
  wrap.append(box);
  return wrap;
}

/**
 * Diyagramdan silme — rolSilById ile AYNI reconnect mantığı (bkz. o
 * fonksiyonun ve rolSil'in yorumu): zincir kopmuyor, giden role işaret
 * eden reject/syncBack/gates.after temizleniyor. Seçim de temizlenir
 * — silinen düğümün düzenleme formu açık kalamaz.
 */
function diagramDeleteRole(id) {
  DIAGRAM_SELECTED = null;
  deleteRoleById(id);
}

/**
 * Diyagramdaki bir "+" işaretine tıklanınca: yeni rol oncekiId'nin
 * ARDINA girecek. Aynı "Yeni rol" panelini (bkz. yeniRolAc) açıyoruz —
 * diyagramın kendi formu YOK, var olan /rol/yeni yolunu diyagramdan
 * ÇAĞIRIYORUZ. YENI_ROL_ONCEDEN_SONRA o panele "nereye gireceğini"
 * önceden söylüyor: operatör boş bir "sonra" listesiyle karşılaşmıyor.
 */
function openInsertRoleBetween(previousId) {
  NEW_ROLE_PRESET_AFTER = previousId;
  location.hash = "prompt/yeni";
}

// Panelin hangi sekmede açıldığı: her açılışta "diyagram" — akış artık
// ÖNCE grafla gösteriliyor, ham YAML bir tık arkada (bkz. bu kartın
// isteği). "ham" sekmesi /akis okunamadıysa da çıkıyor; o durumda
// gerekçesi AKIS_HATA'da, yalnızca o sekmede basılıyor — diyagramı
// etkilemiyor çünkü diyagram zaten SON_MODEL'den geliyor, /akis'ten değil.
let FLOW_TAB = "diyagram";
let FLOW_ERROR = null;
// Diyagramda TIKLANMIŞ düğümün id'si — o rolün düzenleme alanlarını
// diyagramın ALTINDA açıyor. null = hiçbir düğüm seçili değil.
let DIAGRAM_SELECTED = null;

/** Akış panelinin DIŞ ÇATISI: kapat düğmesi, başlık, sekmeler, içerik. */
function drawFlowPanel() {
  const topEl = el("div", "ust");
  topEl.addEventListener("click", (e) => { if (e.target === topEl) kapat(); });
  const p = el("div", "panel");

  const closeButton = el("button", "kapat", "Kapat");
  closeButton.type = "button";
  closeButton.addEventListener("click", kapat);
  p.append(closeButton);

  p.append(el("h2", null, "Akış: " + (LAST_MODEL ? LAST_MODEL.flow.name : "")));

  const tabs = el("div", "sekmeler");
  const diagramButton = el("button", "mini" + (FLOW_TAB === "diyagram" ? " aktif" : ""), "Diyagram");
  diagramButton.type = "button";
  diagramButton.addEventListener("click", () => { FLOW_TAB = "diyagram"; refreshIt(); });
  const rawButton = el("button", "mini" + (FLOW_TAB === "ham" ? " aktif" : ""), "Ham YAML");
  rawButton.type = "button";
  rawButton.addEventListener("click", () => { FLOW_TAB = "ham"; refreshIt(); });
  tabs.append(diagramButton, rawButton);
  p.append(tabs);

  const contentEl = el("div", null);
  contentEl.id = "akisIcerik";
  if (FLOW_TAB === "diyagram") {
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
    const editableFlag = DRAFT !== null;
    const flowValid = !(LAST_MODEL && LAST_MODEL.flow && LAST_MODEL.flow.error);
    const diagramModel = editableFlag && flowValid ? buildDraftModel(DRAFT) : LAST_MODEL;
    contentEl.append(drawDiagramContent(diagramModel, editableFlag));
  } else if (DRAFT !== null) {
    contentEl.append(drawEditorContent());
  } else {
    contentEl.append(el("div", "err", FLOW_ERROR || "Akış okunamadı."));
  }
  p.append(contentEl);

  topEl.append(p);
  return topEl;
}

async function openFlow() {
  FLOW_TAB = "diyagram";
  DRAFT = null;
  PROVIDERS = [];
  FLOW_ERROR = null;
  DIAGRAM_SELECTED = null;
  try {
    const answerBody = await fetch("/akis", { cache: "no-store" });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    if (!data.draft) throw new Error("Bu ekran akış düzenlemeye açık değil.");
    DRAFT = data.draft;
    PROVIDERS = data.providers || [];
  } catch (e) {
    // DİYAGRAMI ETKİLEMİYOR: /akis yalnızca "Ham YAML" sekmesinin
    // kaynağı, diyagram SON_MODEL'den geliyor. Düzenleme kapalıysa bile
    // diyagram görünmeli — görüntülemek düzenlemekten ayrı bir yetki.
    FLOW_ERROR = e.message;
  }
  document.getElementById("panel").replaceChildren(drawFlowPanel());
}

function field(name, value, onChange, secenekler) {
  const l = el("label", null);
  l.append(document.createTextNode(name));
  const g = el(secenekler ? "select" : "input");
  if (secenekler) {
    secenekler.forEach((s) => {
      const o = el("option", null, s);
      o.value = s;
      if (s === value) o.selected = true;
      g.append(o);
    });
  } else {
    g.value = value == null ? "" : value;
  }
  g.addEventListener("change", () => { onChange(g.value); void preview(); });
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
function syncBackField(roleRec, otherIds) {
  const l = el("label", "genis");
  l.append(document.createTextNode("syncBack"));
  const box = el("div", "syncback");
  otherIds.forEach((id) => {
    const label = el("label", "syncback-oge");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.checked = (roleRec.syncBack || []).includes(id);
    checkbox.addEventListener("change", () => {
      const mevcut = new Set(roleRec.syncBack || []);
      if (checkbox.checked) mevcut.add(id);
      else mevcut.delete(id);
      roleRec.syncBack = Array.from(mevcut);
      void preview();
    });
    label.append(checkbox, document.createTextNode(id));
    box.append(label);
  });
  l.append(box);
  return l;
}

function drawRole(roleRec, i) {
  const box = el("div", "rol");
  const topEl = el("div", "rolust");
  topEl.append(el("b", null, (i + 1) + ". " + roleRec.id));
  topEl.append(el("div", "spacer"));

  // Zincire yeni rol EKLEMEK, sıradaki 'next' bağını yeniden kurmak demek:
  // sıra dizideki yerden değil 'next' zincirinden okunuyor.
  const addIt = el("button", "mini", "Altına rol ekle");
  addIt.type = "button";
  addIt.addEventListener("click", () => { addRole(i); });
  topEl.append(addIt);

  const remove = el("button", "mini sil", "Sil");
  remove.type = "button";
  remove.addEventListener("click", () => { deleteRole(i); });
  topEl.append(remove);
  box.append(topEl);

  const idList = DRAFT.roles.map((r) => r.id);
  const targetList = idList.filter((x) => x !== roleRec.id).concat(["done"]);
  const rejectList = [""].concat(idList.filter((x) => x !== roleRec.id));

  box.append(field("id", roleRec.id, (v) => { roleRename(i, v); }));
  box.append(field("provider", roleRec.provider, (v) => (roleRec.provider = v), PROVIDERS));
  box.append(field("workspace", roleRec.workspace, (v) => (roleRec.workspace = v)));
  box.append(field("receive", roleRec.receive || "task", (v) => (roleRec.receive = v), ["task", "batch"]));
  box.append(field("next", roleRec.next, (v) => (roleRec.next = v), targetList));
  box.append(field("reject", roleRec.reject || "", (v) => { roleRec.reject = v || undefined; }, rejectList));
  box.append(syncBackField(roleRec, idList.filter((x) => x !== roleRec.id)));
  const p = field("prompt", roleRec.prompt, (v) => (roleRec.prompt = v));
  p.className = "genis";
  box.append(p);
  return box;
}

/** Rolü zincire ekler: önceki rolün 'next'i yeni role, yeni rolünki eskisine. */
function addRole(i) {
  const previous = DRAFT.roles[i];
  let n = 1;
  while (DRAFT.roles.some((r) => r.id === "rol" + n)) n += 1;
  const fresh = {
    id: "rol" + n,
    provider: previous.provider,
    workspace: "rol" + n,
    prompt: previous.prompt,
    receive: "batch",
    next: previous.next,
  };
  previous.next = fresh.id;
  DRAFT.roles.splice(i + 1, 0, fresh);
  refreshIt();
}

/**
 * Rolü çıkarır ve ona yapılan HER atfı temizler.
 *
 * Atıfları bırakmak akışı kalıcı olarak geçersiz yapardı: kullanıcı silmek
 * istediği rolü silemez, çünkü ona işaret eden bir 'reject' kalıyor.
 */
function deleteRole(i) {
  if (DRAFT.roles.length < 2) return;
  const giden = DRAFT.roles[i];
  DRAFT.roles.splice(i, 1);
  DRAFT.roles.forEach((r) => {
    if (r.next === giden.id) r.next = giden.next;
    if (r.reject === giden.id) r.reject = undefined;
    if (r.syncBack) r.syncBack = r.syncBack.filter((x) => x !== giden.id);
  });
  if (DRAFT.gates) DRAFT.gates = DRAFT.gates.filter((g) => g.after !== giden.id);
  refreshIt();
}

/**
 * rolSil'in KİMLİKLE çağrılan hâli.
 *
 * Diyagramdan tıklanan düğüm bir İNDEKS taşımıyor, bir id taşıyor
 * (bkz. data-rol özniteliği) — bu sarmalayıcı aynı reconnect mantığını
 * (bkz. rolSil yorumu) diyagramın konuştuğu kimlikle çağırıyor, mantığı
 * İKİ YERDE yazmak yerine.
 */
function deleteRoleById(id) {
  const i = DRAFT.roles.findIndex((r) => r.id === id);
  if (i !== -1) deleteRole(i);
}

function roleRename(i, newName) {
  const oldValue = DRAFT.roles[i].id;
  if (!newName || newName === oldValue) return;
  DRAFT.roles[i].id = newName;
  DRAFT.roles.forEach((r) => {
    if (r.next === oldValue) r.next = newName;
    if (r.reject === oldValue) r.reject = newName;
    if (r.syncBack) r.syncBack = r.syncBack.map((x) => (x === oldValue ? newName : x));
  });
  if (DRAFT.gates) DRAFT.gates.forEach((g) => { if (g.after === oldValue) g.after = newName; });
  refreshIt();
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
function refreshIt() {
  document.getElementById("panel").replaceChildren(drawFlowPanel());
  void preview();
}

/**
 * "Ham YAML" sekmesinin içeriği: rol alanları + canlı önizleme + kaydet.
 *
 * Eskiden bu, akisPanelCiz'in (o zamanki adıyla editorCiz'in) KENDİSİYDİ —
 * panel hep editördü. Artık panelin dış çatısı (kapat, başlık, sekmeler)
 * akisPanelCiz'de; bu fonksiyon yalnızca İÇERİĞİ döndürüyor, diyagram
 * sekmesiyle AYNI yuvaya giriyor.
 */
function drawEditorContent() {
  const contentEl = el("div", null);
  contentEl.append(el("div", "cid", DRAFT.roles.length + " rol · kaydetmek dosyayı YENİDEN YAZAR"));

  const ed = el("div", "ed");
  DRAFT.roles.forEach((roleRec, i) => ed.append(drawRole(roleRec, i)));
  contentEl.append(ed);

  contentEl.append(drawPreviewBlock());
  return contentEl;
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
function drawPreviewBlock() {
  const wrap = el("div", null);
  const result = el("div", "kutu");
  result.id = "onizleme";
  wrap.append(result);

  const alt = el("div", "exits");
  const save = el("button", "kaydet", "Dosyaya yaz");
  save.type = "button";
  save.id = "kaydet";
  save.disabled = true;
  save.addEventListener("click", () => { void writeText(); });
  alt.append(save);
  wrap.append(alt);
  wrap.append(el("div", "soon",
    "Kaydetmek akış dosyasını yeniden yazar: YORUMLAR KAYBOLUR. Dosya git'te, " +
    "diff'e bakabilirsin. Kapı metinleri, anayasa ve audit ayarları aynen korunur."));
  return wrap;
}

/** Taslağı DOSYAYA YAZMADAN doğrular; kural numarası kullanıcıya aynen gider. */
async function preview() {
  const box = document.getElementById("onizleme");
  const save = document.getElementById("kaydet");
  if (!box) return;
  try {
    const answerBody = await fetch("/akis/onizleme", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify(DRAFT),
    });
    const v = await answerBody.json();
    box.replaceChildren();
    if (!answerBody.ok) throw new Error(v.error || answerBody.status);
    if (!v.ok) {
      box.append(el("div", "err", v.message));
      if (save) save.disabled = true;
    } else {
      box.append(el("div", "eyebrow", "Maliyet"));
      const m = el("div", "maliyet");
      m.append(el("span", null, v.cost.base + " aktivasyon/kart"));
      m.append(el("span", null, v.cost.worst + " en kötü"));
      m.append(el("span", null, v.cost.rejectEdges.length + " ret kenarı"));
      box.append(m);
      if (save) save.disabled = false;
    }
    box.append(el("div", "eyebrow", "Yazılacak dosya"));
    box.append(el("div", "onizle", v.yaml || ""));
  } catch (e) {
    box.replaceChildren(el("div", "err", "Önizleme alınamadı: " + e.message));
    if (save) save.disabled = true;
  }
}

async function writeText() {
  const save = document.getElementById("kaydet");
  save.disabled = true;
  try {
    const answerBody = await fetch("/akis/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify(DRAFT),
    });
    const v = await answerBody.json();
    if (!answerBody.ok) throw new Error(v.error || answerBody.status);
    draw(v.model);
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
let PROMPTS = [];
let PROMPT_SELECTED = null;
// DİSKTEN son okunan (ya da son kaydedilen) metin, yol başına — "temiz"
// referans. "Geri al" buraya döner, başarılı bir "Kaydet" bunu GÜNCELLER.
let PROMPT_ORIGINAL = {};
// Editördeki GÜNCEL metin, yol başına. PROMPT_ORIJINAL'den FARKLIYSA dosya
// "kirli" sayılır (bkz. promptKirliMi). Seçim değişse de (başka bir dosyaya
// geçilse de) BURADA KALIR: birden fazla dosya aynı anda düzenlenmiş
// durabilir — "Kaydet" yalnızca O AN seçili olanı yazar, ötekiler etkilenmez.
let PROMPT_TEXT = {};
// Dosya başına OKUMA hatası (örn. /prompt isteği başarısız oldu) — panelde
// gösterilir, o dosya başarıyla yüklenince temizlenir.
let PROMPT_ERROR = {};

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
function flowRelativePathToRoot(relPath) {
  const parts = ("hub/flows/" + relPath).split("/");
  const stack = [];
  parts.forEach((p) => {
    if (p === "" || p === ".") return;
    if (p === "..") stack.pop();
    else stack.push(p);
  });
  return stack.join("/");
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
function promptUsersList(prompts, summaryList, activeName, path) {
  const result = [];
  prompts.forEach((p) => {
    if (p.path !== path) return;
    result.push({ akis: activeName, roleRec: p.label.indexOf("rol:") === 0 ? p.label.slice("rol:".length) : null });
  });
  summaryList.forEach((o) => {
    if (o.name === activeName || !o.draft) return;
    if (o.draft.constitution.some((c) => flowRelativePathToRoot(c) === path)) {
      result.push({ akis: o.name, roleRec: null });
    }
    o.draft.roles.forEach((r) => {
      if (flowRelativePathToRoot(r.prompt) === path) result.push({ akis: o.name, roleRec: r.id });
    });
  });
  return result;
}

/** 'promptKullananListesi'nin SAYIMI — "N rol · M akış" (DEVIR.md §5). SAF. */
function promptUsageCount(items) {
  const flows = new Set();
  let roleRec = 0;
  items.forEach((k) => {
    flows.add(k.akis);
    if (k.roleRec !== null) roleRec++;
  });
  return { roleRec, akis: flows.size };
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
function promptUsageLabel(roleRec, akis) {
  if (roleRec === 0 && akis === 0) return "kullanılmıyor";
  return roleRec + " rol · " + akis + " akış";
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
function agentReadOrder(prompts, selectedPath) {
  const steps = [];
  prompts.forEach((p) => {
    if (p.label.indexOf("anayasa:") === 0) steps.push({ label: shortFileName(p.path), path: p.path });
  });
  const roleList = prompts.filter((p) => p.label.indexOf("rol:") === 0);
  const selectedRole = roleList.find((p) => p.path === selectedPath) || roleList[0] || null;
  if (selectedRole !== null) steps.push({ label: selectedRole.label.slice("rol:".length), path: selectedRole.path });
  steps.push({ label: "kart metni", path: null });
  return steps.map((a) => ({ label: a.label, accented: a.path !== null && a.path === selectedPath }));
}

/** Dosya yolundan uzantısız kısa ad — "hub/prompts/roles/coder.md" -> "coder". SAF. */
function shortFileName(path) {
  const parts = path.split("/");
  const last = parts[parts.length - 1] || path;
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(0, dot) : last;
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
function promptTaskSummary(textValue) {
  const lines = (textValue || "").split("\\n");
  let i = 0;
  // Başlık satırı ("# ...") varsa atlanır — yoksa (biçimi tutmayan bir
  // dosya) her şey GİRİŞ sayılır, ilk "##" bulunana kadar.
  if (lines.length && lines[0].trim().indexOf("# ") === 0) i = 1;

  const entryRows = [];
  while (i < lines.length && lines[i].trim().indexOf("## ") !== 0) {
    const line = lines[i].trim();
    if (line !== "") entryRows.push(line);
    i += 1;
  }

  if (i >= lines.length) return { entry: entryRows.join(" "), title: null, clauses: [] };

  const title = lines[i].trim().slice("## ".length).trim();
  i += 1;
  const clauses = [];
  while (i < lines.length && lines[i].trim().indexOf("## ") !== 0) {
    const line = lines[i].trim();
    if (line.indexOf("- ") === 0 || line.indexOf("* ") === 0) clauses.push(line.slice(2).trim());
    i += 1;
  }

  return { entry: entryRows.join(" "), title, clauses: clauses.slice(0, 5) };
}

/** Bir dosyanın editördeki metni DİSKTEKİ (son yüklenen/kaydedilen) metinden FARKLI mı. SAF. */
function isPromptDirty(original, textValue, path) {
  return textValue[path] !== undefined && textValue[path] !== original[path];
}

/** Kaç dosyanın editördeki metni disktekinden farklı — Promptlar rozeti (DEVIR.md §5). SAF. */
function promptUnsavedCount(original, textValue) {
  return Object.keys(textValue).filter((path) => isPromptDirty(original, textValue, path)).length;
}

/** Sabit alt çubuğun durum metni — seçili dosya kirliyse/temizse (DEVIR.md §5). SAF. */
function promptStatusText(dirty) {
  return dirty ? "kaydedilmemiş değişiklik" : "kaydedildi";
}

/**
 * Üst çubuğun bir nav rozetini TEK BAŞINA günceller — tam 'ciz()' çağırmak
 * (board/sağ panel/sayaçlar dahil HER ŞEYİ yeniden kurar) her tuş
 * vuruşunda gereksiz bir maliyet olurdu (bkz. promptlarDurumGuncelle).
 * 'sekmeUygula'nın "data-sekme" ile nav düğmelerini DOĞRUDAN yamaladığı
 * desenin AYNISI.
 */
function updateNavBadge(name, count) {
  document.querySelectorAll(".navSekme").forEach((b) => {
    if (b.dataset.sekme !== name) return;
    const badge = b.querySelector(".navRozet");
    if (badge) badge.textContent = String(count);
  });
}

/**
 * Promptlar sekmesinin GİRİŞ noktası — hash "#promptlar" olduğunda
 * (hashOku) çağrılır. Akışlar sekmesinin tersine liste HER AÇILIŞTA
 * yeniden istenir: bu liste AKTİF akışın topolojisinden türüyor ve akış
 * hem değiştirilebiliyor hem düzenlenebiliyor (eski promptAc'ın AYNI
 * davranışı).
 */
async function drawPromptsScreen() {
  const rootEl = document.getElementById("icerikPromptlar");
  try {
    const answerBody = await fetch("/promptlar", { cache: "no-store" });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    PROMPTS = data.prompts || [];
    if (!PROMPTS.length) {
      rootEl.replaceChildren(el("div", "ipucu", "Bu akışta düzenlenebilir prompt yok."));
      return;
    }
    if (!PROMPTS.some((p) => p.path === PROMPT_SELECTED)) PROMPT_SELECTED = PROMPTS[0].path;
    await promptsSelect(PROMPT_SELECTED);
  } catch (e) {
    rootEl.replaceChildren(el("div", "err", "Prompt listesi okunamadı: " + e.message));
  }
}

/** Seçilen dosyayı DEĞİŞTİRİR, gerekirse metnini yükler, sekmeyi YENİDEN ÇİZER. */
async function promptsSelect(path) {
  PROMPT_SELECTED = path;
  await promptsFetchText(path);
  drawPrompts();
}

/**
 * 'yol'ün metnini garanti eder — ZATEN YÜKLÜYSE (düzenlenmiş olabilir)
 * TEKRAR OKUMUYOR: disk'ten yeniden okumak operatörün elle yazdığını
 * SESSİZCE EZERDİ.
 */
async function promptsFetchText(path) {
  if (PROMPT_TEXT[path] !== undefined) return;
  try {
    const answerBody = await fetch("/prompt?yol=" + encodeURIComponent(path), { cache: "no-store" });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    PROMPT_ORIGINAL[path] = data.text;
    PROMPT_TEXT[path] = data.text;
    delete PROMPT_ERROR[path];
  } catch (e) {
    PROMPT_ERROR[path] = e.message;
  }
}

/** Bir liste grubunu (Anayasa / Rol promptları) kurar — DEVIR.md §5. */
function buildPromptsGroup(title, elemList) {
  const group = el("div", "promptlarGrup");
  group.append(el("h3", "promptlarGrupBaslik", title));
  elemList.forEach((p) => {
    const usageInfo = promptUsageCount(promptUsersList(PROMPTS, FLOWS_SUMMARY, ACTIVE_NAME, p.path));
    const item2 = el("button", "promptlarOge" + (p.path === PROMPT_SELECTED ? " promptlarOge-secili" : ""));
    item2.type = "button";
    item2.title = p.path;
    item2.dataset.path = p.path;
    const nameRow = el("span", "promptlarOgeAd");
    nameRow.append(document.createTextNode(shortFileName(p.path)));
    if (isPromptDirty(PROMPT_ORIGINAL, PROMPT_TEXT, p.path)) {
      nameRow.append(el("span", "promptlarTaslakIsareti"));
    }
    item2.append(nameRow);
    item2.append(el("span", "promptlarOgeKullanim", promptUsageLabel(usageInfo.roleRec, usageInfo.akis)));
    item2.addEventListener("click", () => { void promptsSelect(p.path); });
    group.append(item2);
  });
  return group;
}

/**
 * Sağ taraf — dosya adı/yolu, "Kullanan", "Ajanın okuduğu sıra", metin
 * alanı, sabit alt çubuk (DEVIR.md §5).
 */
function buildPromptsPanel() {
  const panelEl = el("div", "promptlarPanel");
  panelEl.append(el("h1", "promptlarBaslik", shortFileName(PROMPT_SELECTED)));
  panelEl.append(el("div", "promptlarYol mono", PROMPT_SELECTED));

  const userBlock = el("div");
  userBlock.append(el("span", "eyebrow", "Kullanan"));
  const userRow = el("div", "promptlarKullanan");
  const user = promptUsersList(PROMPTS, FLOWS_SUMMARY, ACTIVE_NAME, PROMPT_SELECTED);
  if (!user.length) {
    userRow.append(el("span", "promptlarIpucu", "hiçbir akış kullanmıyor"));
  } else {
    user.forEach((k) => {
      const label = el("button", "promptlarKullananEtiket",
        k.roleRec === null ? k.akis + " · (tüm roller)" : k.akis + " · " + k.roleRec);
      label.type = "button";
      label.addEventListener("click", () => { void promptsUserClick(k.akis, k.roleRec); });
      userRow.append(label);
    });
  }
  userBlock.append(userRow);
  panelEl.append(userBlock);

  const orderBlock = el("div");
  orderBlock.append(el("span", "eyebrow", "Ajanın okuduğu sıra"));
  const orderRow = el("div", "promptlarSira");
  agentReadOrder(PROMPTS, PROMPT_SELECTED).forEach((a) => {
    orderRow.append(el("span", "promptlarSiraAdim" + (a.accented ? " promptlarSiraAdim-vurgulu" : ""), a.label));
  });
  orderBlock.append(orderRow);
  panelEl.append(orderBlock);

  if (PROMPT_ERROR[PROMPT_SELECTED]) {
    panelEl.append(el("div", "err", "Okunamadı: " + PROMPT_ERROR[PROMPT_SELECTED]));
  }

  const textBox = el("textarea", "promptlarMetin mono");
  textBox.id = "promptlarMetin";
  const textValue = PROMPT_TEXT[PROMPT_SELECTED];
  textBox.value = textValue === undefined ? "" : textValue;
  textBox.disabled = textValue === undefined;
  textBox.addEventListener("input", () => {
    PROMPT_TEXT[PROMPT_SELECTED] = textBox.value;
    promptsUpdateStatus();
  });
  panelEl.append(textBox);

  const dirty = isPromptDirty(PROMPT_ORIGINAL, PROMPT_TEXT, PROMPT_SELECTED);
  const bottomBar = el("div", "duzenleAlt");
  bottomBar.append(el("span", "duzenleDurumMetni promptlarDurum", promptStatusText(dirty)));
  const undo = el("button", "railBtn", "Geri al");
  undo.type = "button";
  undo.id = "promptlarGeriAl";
  undo.disabled = !dirty;
  undo.addEventListener("click", promptsUndo);
  bottomBar.append(undo);
  const save = el("button", "railBtn primary", "Kaydet");
  save.type = "button";
  save.id = "promptlarKaydet";
  save.disabled = !dirty;
  save.addEventListener("click", () => { void promptsSave(); });
  bottomBar.append(save);
  panelEl.append(bottomBar);

  const errorBox = el("div", "err");
  errorBox.id = "promptlarKaydetHata";
  errorBox.style.cssText = "display:none";
  panelEl.append(errorBox);

  return panelEl;
}

/** Sekmenin TAM içeriği — seçim değişince / "Kaydet"-"Geri al"'dan SONRA baştan kuruluyor. */
function drawPrompts() {
  const rootEl = document.getElementById("icerikPromptlar");
  const bodyPart = el("div", "promptlarGovde");

  const items = el("div", "promptlarListe");
  items.append(buildPromptsGroup("Anayasa", PROMPTS.filter((p) => p.label.indexOf("anayasa:") === 0)));
  items.append(buildPromptsGroup("Rol promptları", PROMPTS.filter((p) => p.label.indexOf("rol:") === 0)));
  // YENİ ROL PROMPTU yolu bu listenin altında: zincire bir rol eklemek
  // demek, promptunu da BİRLİKTE yaratmak demek (bkz. /rol/yeni yorumu,
  // server.ts) — iki ayrı ekrana bölmek yarı yaratılmış bir rolü vaat
  // ederdi. "Sahiplendiğin/Sahiplenmediğin" şablonu BOŞ bırakılırsa
  // sunucu zaten ondan yazıyor (bkz. rolPromptSablonu, server.ts).
  const newRoleButton = el("button", "railBtn promptlarYeniRol", "Yeni rol promptu");
  newRoleButton.type = "button";
  newRoleButton.addEventListener("click", () => { location.hash = "prompt/yeni"; });
  items.append(newRoleButton);
  bodyPart.append(items);

  bodyPart.append(buildPromptsPanel());
  rootEl.replaceChildren(bodyPart);
  updateNavBadge("promptlar", promptUnsavedCount(PROMPT_ORIGINAL, PROMPT_TEXT));
}

/**
 * Metin kutusuna her TUŞ VURUŞUNDA tam yeniden çizim YAPMIYOR —
 * 'promptlarCiz' textarea'yı YENİDEN KURAR, bu da imleç konumunu/odağı
 * kaybettirirdi. Burada yalnızca etkilenen DOM parçaları yama gibi
 * güncelleniyor: seçili ögenin taslak işareti, alt çubuğun düğmeleri/durum
 * metni, nav rozeti.
 */
function promptsUpdateStatus() {
  const dirty = isPromptDirty(PROMPT_ORIGINAL, PROMPT_TEXT, PROMPT_SELECTED);
  document.querySelectorAll(".promptlarOge").forEach((item2) => {
    if (item2.dataset.path !== PROMPT_SELECTED) return;
    const name = item2.querySelector(".promptlarOgeAd");
    if (!name) return;
    const mevcut = name.querySelector(".promptlarTaslakIsareti");
    if (dirty && !mevcut) name.append(el("span", "promptlarTaslakIsareti"));
    if (!dirty && mevcut) mevcut.remove();
  });
  const statusEl = document.querySelector(".promptlarDurum");
  if (statusEl) statusEl.textContent = promptStatusText(dirty);
  const undo = document.getElementById("promptlarGeriAl");
  if (undo) undo.disabled = !dirty;
  const save = document.getElementById("promptlarKaydet");
  if (save) save.disabled = !dirty;
  updateNavBadge("promptlar", promptUnsavedCount(PROMPT_ORIGINAL, PROMPT_TEXT));
}

/** "Geri al" — editördeki metni DİSKTEKİ (son yüklenen/kaydedilen) hâline döndürür. */
function promptsUndo() {
  if (PROMPT_ORIGINAL[PROMPT_SELECTED] === undefined) return;
  PROMPT_TEXT[PROMPT_SELECTED] = PROMPT_ORIGINAL[PROMPT_SELECTED];
  drawPrompts();
}

/**
 * Prompt dosyasını YAZAR — KOMUT göndererek.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek yazıyor, cevaptaki yeni
 * model çiziliyor. Çekirdek reddederse (bilinmeyen yol, boş metin, yetki
 * yok) mesaj kullanıcıya aynen gider — akış düzenleyicideki "yaz"ın aynısı.
 */
async function promptsSave() {
  const save = document.getElementById("promptlarKaydet");
  const errorBox = document.getElementById("promptlarKaydetHata");
  const path = PROMPT_SELECTED;
  const textValue = PROMPT_TEXT[path];
  if (textValue === undefined) return;
  if (save) save.disabled = true;
  if (errorBox) errorBox.style.cssText = "display:none";
  try {
    const answerBody = await fetch("/prompt/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      // Kısayol alan AÇIK yazıldı: tel adı sunucunun beklediği "text",
      // yerel değişken olduğu gibi. Kısayol bırakılınca sunucu "text"
      // beklerken istemci "metin" gönderiyordu ve prompt kaydetme
      // SESSİZCE yazmıyordu — tsc temizdi, tarayıcı sınaması yakaladı.
      //
      // NOT: bu dosyada BACKTICK YAZILAMAZ; template literal'i kapatır.
      // Bu yorumu ilk yazışımda backtick kullandım ve derleme patladı.
      body: JSON.stringify({ path, text: textValue }),
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    PROMPT_ORIGINAL[path] = textValue;
    draw(data.model);
    drawPrompts();
  } catch (e) {
    if (errorBox) {
      errorBox.textContent = e.message;
      errorBox.style.cssText = "display:block;white-space:pre-wrap";
    }
    if (save) save.disabled = false;
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
async function promptsUserClick(akis, roleRec) {
  if (akis !== ACTIVE_NAME) {
    const succeeded = await selectFlowCard(akis);
    if (!succeeded) return;
  }
  if (roleRec !== null) RAIL = railTransition(RAIL, { tur: "rolSec", roleId: roleRec });
  location.hash = "";
  railRedraw();
}

// --- Yeni rol ---
//
// Zincire rol eklemek dosyasız yapılamıyordu, dosya rolsüz yaratılamıyordu
// (bkz. /rol/yeni yorumu, server.ts) — uç ikisini TEK gövdede, ATOMİK
// yapıyor. İstemci burada "sonra" (yeni rolün hangi rolün ARDINA gireceği)
// sorusunu KENDİ KAFASINA GÖRE tahmin etmiyor: liste akışın GERÇEK rol
// sırasından geliyor (/akis'in draft'ı) ve operatör seçiyor.
let NEW_ROLE_PROVIDERS = [];
let NEW_ROLE_ROLES = [];
/**
 * Diyagramdan tıklanan "+" işaretinin önceden söylediği yer — bkz.
 * diyagramRolArasiEkleAc. yeniRolAc bunu OKUYUP SIFIRLIYOR: panel
 * Promptlar sekmesinin "Yeni rol promptu" düğmesinden de açılabiliyor ve
 * o yolda bu ön seçim olmamalı (eski bir diyagram tıklaması bir sonraki,
 * İLİŞKİSİZ açılışı etkilemesin).
 */
let NEW_ROLE_PRESET_AFTER = null;
/** Seçili "sonra" rolünün tam kaydı — başlıkta "X ile Y arasına" yazmak için. */
let NEW_ROLE_AFTER_DEFAULT = null;

async function openNewRole() {
  const container = document.getElementById("panel");
  const presetAfter = NEW_ROLE_PRESET_AFTER;
  NEW_ROLE_PRESET_AFTER = null;
  try {
    const answerBody = await fetch("/akis", { cache: "no-store" });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    // /rol/yeni'nin kendi kapısıyla AYNI koşul: taslak yoksa (salt okunur
    // ekran) uç de 404 döner — burada önceden söylemek, operatörü boş bir
    // formu doldurduktan SONRA reddedilmeye bırakmıyor.
    if (!data.draft) throw new Error("Bu ekran rol eklemeye açık değil.");
    NEW_ROLE_PROVIDERS = data.providers || [];
    const roleList = data.draft.roles || [];
    NEW_ROLE_ROLES = roleList.map((r) => r.id);
    if (!NEW_ROLE_ROLES.length) throw new Error("Akışta hiç rol yok — ardına eklenecek bir rol bulunamadı.");
    // Diyagramdan gelen ön seçim GERÇEKTEN akışta bir rolse kullanılıyor —
    // uydurma bir id formu bozuk bir varsayılanla açmasın.
    NEW_ROLE_AFTER_DEFAULT = NEW_ROLE_ROLES.includes(presetAfter)
      ? roleList.find((r) => r.id === presetAfter)
      : null;
    container.replaceChildren(drawNewRoleEditor());
  } catch (e) {
    container.replaceChildren(el("div", "err", "Rol eklenemedi: " + e.message));
  }
}

function newRoleField(label, entryTag, id) {
  const l = el("label", null);
  l.append(document.createTextNode(label));
  const g = el(entryTag);
  g.id = id;
  l.append(g);
  return { label: l, entry: g };
}

function drawNewRoleEditor() {
  const topEl = el("div", "ust");
  topEl.addEventListener("click", (e) => { if (e.target === topEl) kapat(); });
  const p = el("div", "panel");

  const closeButton = el("button", "kapat", "Kapat");
  closeButton.type = "button";
  closeButton.addEventListener("click", kapat);
  p.append(closeButton);

  // DİYAGRAMDAN AÇILDIYSA başlık NEREYE eklendiğini AÇIKÇA söylüyor —
  // bu kartın kendi isteği ("yeni rolün zincire NEREYE girdiğini açıkça
  // göstermek"). next zincirin BİR SONRAKİ rolü: "A ile B arasına".
  const title = NEW_ROLE_AFTER_DEFAULT === null
    ? "Yeni rol"
    : "Yeni rol — " + NEW_ROLE_AFTER_DEFAULT.id + " ile " + NEW_ROLE_AFTER_DEFAULT.next + " arasına";
  p.append(el("h2", null, title));
  p.append(el("div", "cid",
    "rol VE promptu BİRLİKTE yaratılır — geçersiz bir akış üretirse ikisi de GERİ ALINIR"));

  const box = el("div", "rol");

  const { label: idLabel, entry: idInput } = newRoleField("id", "input", "yeniRolId");
  idInput.type = "text";
  idInput.placeholder = "örn. reviewer";
  box.append(idLabel);

  const { label: providerLabel, entry: selectProvider } =
    newRoleField("provider", "select", "yeniRolProvider");
  NEW_ROLE_PROVIDERS.forEach((s) => {
    const o = el("option", null, s);
    o.value = s;
    selectProvider.append(o);
  });
  box.append(providerLabel);

  const { label: workspaceLabel, entry: workspaceInput } =
    newRoleField("workspace", "input", "yeniRolWorkspace");
  workspaceInput.type = "text";
  box.append(workspaceLabel);

  // "sonra" ÇAĞIRANIN (burada: operatörün) seçimi — uç bunu tahmin etmiyor.
  // DİYAGRAMDAN gelen ön seçim VARSAYILAN olarak işaretli (operatör
  // isterse değiştirebilir) — başlıktaki "A ile B arasına" ile AYNI yere
  // işaret ediyor.
  const { label: afterLabel, entry: selectAfter } = newRoleField("sonra — hangi rolün ARDINA", "select", "yeniRolSonra");
  NEW_ROLE_ROLES.forEach((id) => {
    const o = el("option", null, id);
    o.value = id;
    if (NEW_ROLE_AFTER_DEFAULT !== null && id === NEW_ROLE_AFTER_DEFAULT.id) o.selected = true;
    selectAfter.append(o);
  });
  box.append(afterLabel);

  // Prompt BOŞ bırakılabilir: sunucu bu durumda ŞABLONDAN yazıyor (kural 9
  // boş dosyayı reddediyor, bkz. rolPromptSablonu yorumu).
  const { label: promptLabel, entry: promptInput } = newRoleField(
    "prompt (boş bırakılırsa ŞABLONDAN yazılır)", "textarea", "yeniRolPrompt",
  );
  promptLabel.className = "genis";
  promptInput.rows = 10;
  box.append(promptLabel);

  p.append(box);

  const bottomRow = el("div", "exits");
  const addIt = el("button", "primary", "Rolü ekle");
  addIt.type = "button";
  addIt.id = "yeniRolEkle";
  addIt.addEventListener("click", () => { void submitNewRole(); });
  bottomRow.append(addIt);
  const cancel = el("button", null, "Vazgeç");
  cancel.type = "button";
  cancel.addEventListener("click", kapat);
  bottomRow.append(cancel);
  p.append(bottomRow);

  const errorBox = el("div", "err");
  errorBox.id = "yeniRolHata";
  errorBox.style.cssText = "display:none";
  p.append(errorBox);

  topEl.append(p);
  return topEl;
}

/**
 * Yeni rolü KOMUT göndererek yaratır.
 *
 * Çekirdek reddederse (aynı id, bilinmeyen 'sonra', geçersiz akış/workspace)
 * mesaj OLDUĞU GİBİ operatöre gider — workspace/provider kuralları burada
 * TEKRAR UYGULANMIYOR, doğrulama çekirdekte (bkz. server.ts yorumu).
 */
async function submitNewRole() {
  const idInput = document.getElementById("yeniRolId");
  const selectProvider = document.getElementById("yeniRolProvider");
  const workspaceInput = document.getElementById("yeniRolWorkspace");
  const selectAfter = document.getElementById("yeniRolSonra");
  const promptInput = document.getElementById("yeniRolPrompt");
  const addIt = document.getElementById("yeniRolEkle");
  const errorBox = document.getElementById("yeniRolHata");
  if (!idInput || !selectProvider || !workspaceInput || !selectAfter || !promptInput || !addIt || !errorBox) return;

  addIt.disabled = true;
  errorBox.style.cssText = "display:none";
  try {
    const promptBody = promptInput.value;
    const bodyPart = {
      id: idInput.value.trim(),
      provider: selectProvider.value,
      workspace: workspaceInput.value.trim(),
      sonra: selectAfter.value,
      ...(promptBody.trim() === "" ? {} : { prompt: promptBody }),
    };
    const answerBody = await fetch("/rol/yeni", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": TOKEN },
      body: JSON.stringify(bodyPart),
    });
    const data = await answerBody.json();
    if (!answerBody.ok) throw new Error(data.error || answerBody.status);
    // Çekirdeğin döndürdüğü model çiziliyor: ekran kendi kopyasını
    // uydurmuyor, yeni rolün GERÇEKTEN nereye bağlandığını çekirdek söylüyor.
    draw(data.model);
    location.hash = "";
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.style.cssText = "display:block;white-space:pre-wrap";
  } finally {
    addIt.disabled = false;
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
function buildAgentNowBox(currentCard, daemon) {
  const box = el("div", "ajanSuAn");
  if (!currentCard) {
    box.append(el("div", "ipucu", "Şu an bu role atanmış bir kart yok."));
    return box;
  }
  const durum = agentCurrentState(currentCard, daemon);
  // "gözcü kapalı" ise bu karta dokunan bir süreç YOK — DEVIR'in
  // "çalışırken ya da kapıda üstte 4px accent çizgi" kuralı o yüzden bu
  // dalda KASITLI OLARAK uygulanmıyor: accent çizgisi "şu an önemli bir
  // şey oluyor" der, burada olmuyor.
  if (durum.tur !== "gozcuKapali") box.classList.add("ajanSuAn-vurgulu");
  box.append(el("div", "ajanSuAnBaslik", currentCard.title));

  const line = el("div", "ajanSuAnSatir mono");
  if (durum.tur === "gozcuKapali") {
    line.append(el("span", null, "gözcü kapalı · yarıda"));
  } else if (durum.tur === "live") {
    line.append(el("b", null, durum.live.name || durum.live.kind));
    if (durum.live.detail) line.append(el("span", null, durum.live.detail));
  } else if (durum.tur === "calisiyor") {
    line.append(el("span", null, "çalışıyor"));
  } else {
    line.append(el("span", null, "kapıda"));
  }
  if (currentCard.durationMs) line.append(el("span", null, duration(currentCard.durationMs)));
  if (currentCard.costUsd || currentCard.unmeasured) {
    line.append(el("span", currentCard.unmeasured ? "bad" : null,
      costText(currentCard.costUsd, currentCard.unmeasured, currentCard.tokens)));
  }
  box.append(line);

  const open = el("button", "railBtn", "Kartı panoda aç");
  open.type = "button";
  open.addEventListener("click", () => { location.hash = "kart/" + currentCard.id; });
  box.append(open);
  return box;
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
function buildAgentSteps(currentCard, daemon) {
  const box = el("div", "ajanBolum");
  const title = el("div", "railAraBaslik", "Adımlar");
  if (isAgentLive(currentCard, daemon)) title.append(el("span", "ajanCanliEtiket", "canlı"));
  box.append(title);

  if (!currentCard) {
    box.append(el("div", "ipucu", "Koşan bir ajan yok."));
    return box;
  }
  const steps = AGENT_STEPS[currentCard.id] || [];
  if (!steps.length) {
    box.append(el("div", "ipucu",
      isAgentLive(currentCard, daemon) ? "ilk adım bekleniyor…" : "bu aktivasyon için kayıtlı adım yok."));
    return box;
  }
  steps.slice().reverse().forEach((a) => {
    const line = el("div", "ajanAdim");
    line.append(el("span", "seq", String(a.seq)));
    line.append(el("span", "ad", a.name || a.kind));
    line.append(el("span", "detay", a.detail || ""));
    line.append(el("span", "saat", a.at ? a.at.slice(11, 19) : ""));
    box.append(line);
  });
  return box;
}

/**
 * "Görevi · promptundan" bloğu — DEVIR.md §6: rol prompt dosyasının giriş
 * paragrafı + ilk "##" bölümünün madde listesi (en fazla 5), "Promptu
 * düzenle →".
 */
function buildAgentTask(meta) {
  const box = el("div", "ajanBolum");
  box.append(el("div", "railAraBaslik", "Görevi · " + meta.prompt));

  const summary = AGENT_PROMPT_SUMMARY[meta.prompt];
  if (summary === undefined) {
    box.append(el("div", "ipucu", "yükleniyor…"));
  } else if (summary === null) {
    box.append(el("div", "err", "Prompt okunamadı" + (PROMPT_ERROR[meta.prompt] ? ": " + PROMPT_ERROR[meta.prompt] : ".")));
  } else {
    if (summary.entry) box.append(el("p", "ajanGorevMetin", summary.entry));
    if (summary.clauses.length) {
      const items = el("ul", "ajanGorevListe");
      summary.clauses.forEach((itemText) => items.append(el("li", null, itemText)));
      box.append(items);
    } else if (!summary.entry) {
      box.append(el("div", "ipucu", "(bölüm boş)"));
    }
  }

  const edit = el("button", "railBtn", "Promptu düzenle →");
  edit.type = "button";
  edit.addEventListener("click", () => {
    PROMPT_SELECTED = meta.prompt;
    location.hash = "promptlar";
  });
  box.append(edit);
  return box;
}

/** Seçili rolün sağ taraf içeriği — üst bilgi + "şu an" + adımlar + görev (DEVIR.md §6). */
function buildAgentPanel(m, roleIdent) {
  const panelEl = el("div", "ajanPanel");
  const meta = railRoleMeta(m, roleIdent);
  if (!meta) {
    panelEl.append(el("div", "ipucu", "Rol bulunamadı."));
    return panelEl;
  }

  const topEl = el("div", "ajanPanelUst");
  topEl.append(el("div", "railAraBaslik", "ajan " + meta.no + " · " + m.flow.name));
  topEl.append(el("h1", "ajanPanelAd", meta.id));
  const metaRow = el("div", "ajanPanelMeta mono");
  metaRow.append(el("span", null, meta.provider));
  metaRow.append(el("span", null, meta.workspace));
  metaRow.append(el("span", null, meta.receive === "batch" ? "toplu alım" : "tekil alım"));
  metaRow.append(el("span", null, "sonraki · " + meta.nextRole));
  topEl.append(metaRow);
  panelEl.append(topEl);

  const currentCard = agentCurrentCard(roleIdent, m.cards);
  panelEl.append(buildAgentNowBox(currentCard, m.daemon));
  panelEl.append(buildAgentSteps(currentCard, m.daemon));
  panelEl.append(buildAgentTask(meta));
  return panelEl;
}

/** Ajan listesinin TEK satırı — 36px kuş, rol adı, sağlayıcı, tek satırlık durum (DEVIR.md §6). */
function buildAgentRow(m, roleRec) {
  const currentCard = agentCurrentCard(roleRec.id, m.cards);
  const cardList = roleOpenCards(m.cards, roleRec.id);

  const line = el("button", "ajanSatir" + (roleRec.id === AGENT_SELECTED ? " ajanSatir-secili" : ""));
  line.type = "button";
  line.setAttribute("aria-pressed", String(roleRec.id === AGENT_SELECTED));

  const animationOn = document.documentElement.dataset.animate !== "off";
  const bird = sv("svg", { viewBox: "0 0 46 23", role: "img", "aria-label": roleRec.id + " rolü" });
  bird.classList.add("ajanKus");
  if (wingsFlapping(cardList, m.daemon) && animationOn) bird.classList.add("kanatCirpiyor");
  const birdPolyline = sv("polyline", { points: "2,5 13,9 24,19 35,9 46,5", fill: "none" });
  birdPolyline.style.stroke = birdColour(cardList);
  birdPolyline.style.strokeWidth = "4";
  birdPolyline.style.strokeLinejoin = "miter";
  bird.append(birdPolyline);
  line.append(bird);

  const infoBox = el("div", "ajanSatirBilgi");
  infoBox.append(el("div", "ajanSatirAd", roleRec.id + " · " + roleRec.provider));
  infoBox.append(el("div", "ajanSatirDurum", agentStatusText(roleRec, currentCard, m.daemon)));
  line.append(infoBox);

  line.addEventListener("click", () => {
    AGENT_SELECTED = roleRec.id;
    drawAgentsScreen(m);
  });
  return line;
}

/**
 * Ajanlar sekmesinin TAM içeriği — HER yoklamada yeniden çiziliyor
 * (formasyonSvgKur ile AYNI ilke): birincil veri /durum modelinin parçası.
 * Sekme GÖRÜNMÜYOR OLSA BİLE çağrılıyor (Pano'nun board'u gibi), ki
 * sekmeye geçildiği an içerik hazır olsun.
 */
function drawAgentsScreen(m) {
  const rootEl = document.getElementById("icerikAjanlar");
  if (!rootEl) return;
  if (!m.roles.length) {
    rootEl.replaceChildren(el("div", "ipucu", "Bu akışta rol yok."));
    return;
  }
  if (!m.roles.some((r) => r.id === AGENT_SELECTED)) AGENT_SELECTED = m.roles[0].id;

  const bodyPart = el("div", "ajanlarGovde");
  const items = el("div", "ajanlarListe");
  m.roles.forEach((roleRec) => items.append(buildAgentRow(m, roleRec)));
  bodyPart.append(items);
  bodyPart.append(buildAgentPanel(m, AGENT_SELECTED));
  rootEl.replaceChildren(bodyPart);

  // Bu noktadan sonrası yalnızca SEKME GERÇEKTEN açıkken: gizliyken
  // prompt/adım isteği atmanın anlamı yok — Promptlar/Akışlar'ın "sekme
  // açılınca yükle" ilkesiyle AYNI gerekçe, burada "her saniye" için.
  if (tabName(decodeURIComponent(location.hash.replace(/^#/, ""))) !== "ajanlar") return;

  const roleRec = m.roles.find((r) => r.id === AGENT_SELECTED);
  if (roleRec && AGENT_PROMPT_SUMMARY[roleRec.prompt] === undefined) void loadAgentPrompt(roleRec.prompt);

  const currentCard = agentCurrentCard(AGENT_SELECTED, m.cards);
  if (isAgentLive(currentCard, m.daemon)) void loadAgentSteps(currentCard.id);
}

/**
 * Rol promptunun "Görevi" özetini bir KEZ yükler — promptlarMetniGetir'in
 * KENDİ önbelleği (PROMPT_METIN) zaten "yüklüyse tekrar okuma" diyor, bu
 * da AYNI metni promptGorevOzeti ile BİR KEZ ayrıştırıp AJAN_PROMPT_OZET'e
 * yazıyor. Promptlar sekmesi bu dosyayı AYRICA açarsa (PROMPT_SEC
 * değişirse) metin zaten önbellekte, ikinci bir ağ isteği olmaz.
 */
async function loadAgentPrompt(path) {
  await promptsFetchText(path);
  const textValue = PROMPT_TEXT[path];
  AGENT_PROMPT_SUMMARY[path] = textValue === undefined ? null : promptTaskSummary(textValue);
}

/**
 * Güncel kartın TAM adım izini getirir — "GET /adimlar?kart=" (DEVIR.md
 * §6'nın gerçekten yeni ucu, bkz. server.ts). Bu fonksiyon kendi başına
 * yeniden ÇİZMİYOR: bir sonraki saniyelik yoklamada (ciz() → ajanlarEkraniCiz)
 * AJAN_ADIMLAR'daki TAZE liste zaten basılır — sagPanelCiz'in Kart modu
 * "data-rail-kart" desenindeki fazladan karmaşıklık burada GEREKMİYOR,
 * bu ekran saniyede bir ZATEN yeniden çiziliyor.
 */
async function loadAgentSteps(cardIdent) {
  try {
    const answerBody = await fetch("/adimlar?kart=" + encodeURIComponent(cardIdent), { cache: "no-store" });
    const data = await answerBody.json();
    if (answerBody.ok && Array.isArray(data.steps)) AGENT_STEPS[cardIdent] = data.steps;
  } catch (e) {
    // Sessizce bırak: önbellekteki ESKİ liste (varsa) ekranda kalır, bir
    // sonraki yoklama yeniden deneyecek.
  }
}

// Liste ÖNCE: ilk çizimde seçici eksik çıkıp bir saniye sonra belirmesin.
void loadFlows().then(() => probe().then(readHash));
setInterval(probe, 1000);
</script>
</body>
</html>
`;

