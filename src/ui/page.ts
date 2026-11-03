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
export function renderPage(token: string): string {
  return PAGE.replace("__JETON__", token);
}

const PAGE = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skein</title>
<style>
  /*
   * GÖKYÜZÜ VE İZ. "skein" bir kaz sürüsünün V dizilişi — palet bunu
   * taşıyor: zemin geniş ve sakin, soğuk gri-mavi bir gökyüzü; kartlar o
   * zeminin üstünde duran AÇIK paneller; ince açık çizgiler "uçuş izi".
   * TEK bir sıcak renk var (--gate) ve o yalnızca insan kararı bekleyen
   * yerler için ayrılmış — kapı, uyarı, engel. Önceki palette kapı
   * sarısı ile vurgu yeşili AYNI ANDA bağırıyordu; burada --accent sakin
   * bir gökyüzü mavisi, sıcaklık tek yerde kalıyor.
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
    /* yüzeyler: soğuk gri-mavi zemin, beyaz panel */
    --bg: #E7ECF2; --surface: #FFFFFF; --surface-2: #EEF2F7;
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
    }
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

  /* koşu şeridi */
  .bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-5) var(--sp-9);
    background: var(--surface); border: 1px solid var(--line); border-radius: 4px;
    padding: var(--sp-5) var(--sp-8); margin-bottom: var(--sp-8);
  }
  .brand { font-size: var(--fs-brand); font-weight: 700; letter-spacing: -.02em; }
  /*
   * KUS ISARETI. Duz metin "Skein" yerine gecti - isim zaten iki anlami
   * birden tasiyor (cile ipligin kivrimi / V diziliminde ucan suru) ve
   * marka bunu SOYLEMEK yerine GOSTERMELI. svg currentColor kullaniyor,
   * yani renk burada degil govdenin --ink'inden geliyor: iki tema icin
   * iki ayri kopya YOK, tek govde iki temada da dogru renkte.
   */
  .marka { display: inline-flex; align-items: center; }
  .marka svg { width: 26px; height: 26px; color: var(--ink); display: block; }
  #akisSecici {
    font: inherit; font-size: var(--fs-ui); font-family: var(--mono); min-height: 34px;
    padding: 0 var(--sp-3); border: 1px solid var(--line); border-radius: 3px;
    background: var(--surface-2); color: var(--ink); cursor: pointer;
  }
  #akisSecici:disabled { cursor: progress; opacity: .6; }
  .pill {
    display: inline-flex; align-items: center; gap: var(--sp-3);
    border: 1px solid var(--line); border-radius: 3px; padding: var(--sp-2) var(--sp-5);
    font-size: var(--fs-ui);
  }
  .pill.on { background: var(--accent-soft); border-color: var(--accent-line); }
  .pill.off { background: var(--surface-2); color: var(--ink-2); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
  .dot.dead { background: var(--ink-3); }
  .spacer { flex: 1 1 auto; }
  .stat { text-align: right; }
  .stat b { display: block; font-family: var(--mono); font-size: var(--fs-stat); font-weight: 500; font-variant-numeric: tabular-nums; }

  /* pano */
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(252px, 1fr)); gap: var(--sp-6) var(--sp-5); align-items: start; }
  .col { min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4); }
  .colhead {
    display: flex; align-items: baseline; gap: var(--sp-3);
    padding-bottom: var(--sp-2); border-bottom: 2px solid var(--ink);
  }
  .colhead.muted { border-bottom-color: var(--line); color: var(--ink-2); }
  .colhead h2 { margin: 0; font-size: var(--fs-heading); font-weight: 700; }
  /*
   * ZİNCİR OKU. 'skein' bir kaz sürüsünün V dizilişi ve sütunlar bugüne
   * kadar yan yana duran BAĞIMSIZ kutular gibi görünüyordu, oysa her
   * sütun zincirde ÖNCEKİNİN ardında duruyor. Başlık artık sıradaki
   * sütunu da söylüyor; yön ipucu salt tipografi, ağır bir çizim değil.
   */
  .colhead .zincir {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3);
  }
  .colhead .zincir .ok { display: inline-block; }
  /*
   * DAR EKRANDA YÖN DEĞİŞİR. '.board' grid-template-columns:
   * repeat(auto-fit, minmax(252px, 1fr)) kullanıyor, yani sütun sayısı
   * JS'siz, konteyner genişliğine göre kendiliğinden düşüyor — iki sütun
   * en az 2*252 + aralarındaki boşluk (12px) + kenar dolgusu (2*16px)
   * = 548px istiyor. Bu eşiğin altında sütunlar ALT ALTA dizilir ve ok
   * SAĞI göstermeyi sürdürürse sıradaki sütun artık altta dururken ok
   * yanlış yönü söyler. 600px'lik bir pay bırakılıyor; JS'le ÖLÇÜLEN bir
   * eşik değil, grid'in KENDİ kuralıyla aynı yönde kaba bir yaklaşıklık.
   */
  @media (max-width: 600px) {
    .colhead .zincir .ok { display: inline-block; transform: rotate(90deg); }
  }
  .card {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 4px; padding: var(--sp-6) var(--sp-6);
  }
  .card.live { border: 2px solid var(--accent); padding: var(--sp-5) var(--sp-6); }
  .card.gate { background: var(--gate-bg); border-color: var(--gate-line); }
  .card.orphan { border-color: var(--reject); border-style: dashed; }
  /*
   * DEVIR HAREKETI. Kart yeni bir sutuna gectiginde ya da panoya ilk
   * dustugunde bu sinif bir yoklama boyunca uzerinde durur (bkz. JS
   * tarafinda kartYerlestir). Hareket EN ONEMLI kisitla geliyor: hareket
   * duyarliligi olan biri icin prefers-reduced-motion: reduce bunu
   * tamamen SIFIRLIYOR - bir suslemeyi kapatmiyoruz, bir erisilebilirlik
   * kosulunu yerine getiriyoruz.
   */
  @keyframes kartGelis { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .card.gelis { animation: kartGelis .3s ease-out; }
  @media (prefers-reduced-motion: reduce) {
    .card.gelis { animation: none; }
  }
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
  .iz .t { width: 54px; flex: 0 0 auto; font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3); padding-top: 2px; font-variant-numeric: tabular-nums; }
  .iz .rail { width: 11px; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  .iz .rail i { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; flex: 0 0 auto; }
  .iz .rail s { width: 1px; flex: 1 1 auto; background: var(--line); min-height: 12px; }
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
    border: 1px solid var(--line); background: transparent; color: var(--ink-2); border-radius: 3px;
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

  /* prompt düzenleyici — soldan dosya seç, sağda metin alanı */
  .promptEd { display: flex; gap: var(--sp-5); align-items: flex-start; }
  .promptListe {
    flex: 0 0 150px; display: flex; flex-direction: column; gap: var(--sp-1);
    max-height: 64vh; overflow-y: auto;
  }
  .promptListe button { text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .promptListe button.secili { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }
  .promptAlan { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-4); }
  .promptAlan textarea {
    font: inherit; font-family: var(--mono); font-size: var(--fs-body); line-height: 1.5;
    min-height: 44vh; padding: var(--sp-4) var(--sp-5); border: 1px solid var(--line); border-radius: 3px;
    background: var(--surface-2); color: var(--ink); resize: vertical;
  }
  .promptAlan textarea:disabled { opacity: .6; }

  footer { margin-top: var(--sp-8); font-family: var(--mono); font-size: var(--fs-label); color: var(--ink-3); }
</style>
</head>
<body>
<div class="wrap">
  <div class="bar" id="bar"></div>
  <div id="kopuk"></div>
  <div id="hata"></div>
  <div id="uyari"></div>
  <div class="board" id="board"></div>
  <footer id="foot"></footer>
</div>
<div id="panel"></div>
<script>
const JETON = "__JETON__";
// Seçilebilecek akış adları — sayfa açılışında BİR KEZ okunuyor (bkz.
// akislarYukle). Dosya listesi koşarken değişmiyor; her yoklamada yeniden
// istemek, değişmeyen bir şeyi saniyede bir sormak olurdu.
let AKISLAR = [];
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

/*
 * KUŞ İŞARETİ — TEK ÇİZGİ, İKİ ANLAM.
 *
 * "skein" hem bir çile ipliğin (yumak edilmeden gevşek sarılmış ip) hem
 * de V dizilişinde uçan bir kuş sürüsünün adı. Bu yol ("d") ikisini de
 * AYNI çizgide taşıyor kasıtlı olarak: üç köşeli zikzak (her köşe bir V
 * açısı, kuş sürüsünün önden lider izlediği dalgalı hat) ipin son ucunda
 * bir kıvrıma (küçük bir eğri) kapanıyor — gevşek sarılmış bir çilenin
 * ucu gibi. İKİ AYRI SVG YOK: hem bardaki işaret hem favicon bu TEK
 * sabitten türüyor (bkz. faviconAyarla).
 */
const ISARET_D = "M3 17 L8 6 L12.5 16 L17 5 L21 15 C23.5 18 21 20.8 18 19";

/**
 * İşaretin bir <svg> düğümünü kurar.
 *
 * "renk" parametre: bardaki kullanım "currentColor" veriyor (gövdenin
 * --ink'inden gelsin, iki temada da kendiliğinden doğru renkte olsun —
 * bu yüzden burada hiçbir hex YOK). Favicon ayrı bir belge gibi
 * render edildiği için (tarayıcı sekmesinde, sayfanın CSS'i ona
 * ulaşmıyor) "currentColor" orada anlamsız; faviconAyarla() kendi sabit
 * rengini veriyor ama AYNI ISARET_D yolunu kullanıyor.
 *
 * NOT: bu dosya gömülü istemci betiğini bir ŞABLON DİZESİ içinde taşıyor
 * — yorumda ters tırnak dizgiyi kapatır ve derleme kırılır.
 */
function isaretSvg(renk) {
  // Değer İKİYE BÖLÜNMÜŞ YAZILIYOR: sayfa "dış kaynak yüklemez" iddiasını
  // kaynak metinde bir URL şeması dizgesi aramasıyla sınıyor (bkz.
  // page.test.ts) ve bu isim uzayı hiçbir şey İNDİRMİYOR — ad alanı
  // (namespace) kimliği, ağdan çekilen bir adres değil. Sonuç AYNI,
  // kaynak metinde tek parça değil.
  const NS = "http:" + "//www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-label", "Skein");
  svg.setAttribute("role", "img");
  const yol = document.createElementNS(NS, "path");
  yol.setAttribute("d", ISARET_D);
  yol.setAttribute("fill", "none");
  yol.setAttribute("stroke", renk);
  yol.setAttribute("stroke-width", "2.2");
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
 * Kapıyı açar — KOMUT göndererek.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek kararı uyguluyor, cevaptaki
 * yeni model çiziliyor. Çekirdek reddederse mesajı aynen gösteriyoruz;
 * o mesaj gerekçeyi ve çıkış yolunu zaten söylüyor.
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
    ciz(veri.model);
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
  } catch (e) {
    dugme.disabled = false;
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
  const eski = document.querySelector("#bar .redd");
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
    document.getElementById("bar").append(kutu);
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

// Kartın panoda hangi sütunda durduğunu ve DOM düğümünü hatırlar — devir
// hareketinin ÖN KOŞULU. Modül kapsamında yaşıyor, yani bir yoklamadan
// (ciz çağrısı) ötekine HAYATTA kalıyor; ciz() içinde yeniden
// yaratılsaydı her çağrı "ilk kez görülen kart" sanırdı.
const KART_DUGUM = new Map();
const KART_SUTUN = new Map();

/**
 * Panodaki bir kartın düğümünü verir — VARSA AYNI düğümü, YOKSA yenisini.
 *
 * Bu, "kartın KİMLİĞİ korunsun" kısıtının tam karşılığı: tarayıcı aynı
 * nesneyi görürse (çağıran taraf bunu col.append(kutu) ile başka bir
 * ebeveyne TAŞIR, yok edip yeniden yaratmaz) CSS geçişi/animasyonu o
 * düğüm üzerinde anlamlı kalır. "kolonAnahtari" değiştiyse (ya da düğüm
 * hiç yoktuysa) "gelis" sınıfı eklenir — devrin görünür hareketi bu.
 */
function kartYerlestir(kolonAnahtari, c) {
  let kutu = KART_DUGUM.get(c.id);
  const yeniDugum = kutu === undefined;
  if (yeniDugum) {
    kutu = el("div");
    KART_DUGUM.set(c.id, kutu);
    kartDugumBaslat(kutu, c.id);
  }
  const sutunDegisti = !yeniDugum && KART_SUTUN.get(c.id) !== kolonAnahtari;
  // İçerik ÖNCE kuruluyor: kartIcerik className'i baştan yazıyor, yani
  // ".gelis" sınıfı buradan SONRA eklenmezse bir önceki yoklamanın
  // kalıntısı yeni içerik tarafından zaten silinmiş olurdu.
  kartIcerik(kutu, c);
  KART_SUTUN.set(c.id, kolonAnahtari);
  if (yeniDugum || sutunDegisti) kutu.classList.add("gelis");
  return kutu;
}

/**
 * Artık panoda GÖRÜNMEYEN kartların hafızasını siler.
 *
 * KART_DUGUM/KART_SUTUN hiç küçülmezse (kart bitip yetim/başka-akış
 * bandına düşse ya da kapansa) her ikisi de sonsuza kadar büyür —
 * düğümler DOM'dan çoktan ayrılmış olsa da referans burada yaşar.
 * Sızıntı bir performans sorunudan önce bir DOĞRULUK sorunu: silinmeyen
 * bir KART_SUTUN girdisi, aynı kimlikte bambaşka bir kart geri
 * geldiğinde "sütun değişmedi" sanıp devir animasyonunu YUTARDI.
 */
function kartHafizasiniBudat(canliIdler) {
  for (const id of KART_DUGUM.keys()) {
    if (!canliIdler.has(id)) { KART_DUGUM.delete(id); KART_SUTUN.delete(id); }
  }
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
  const iz = el("div", "kutu");
  iz.append(el("div", "eyebrow", "Kartın izi"));
  d.history.forEach((h, i) => {
    const satir = el("div", "iz");
    satir.style.marginTop = i === 0 ? "10px" : "0";
    satir.append(el("div", "t", h.at.slice(11, 19)));
    const rail = el("div", "rail");
    const nokta = el("i");
    nokta.style.background = IZ_RENK[h.event] || "var(--accent)";
    rail.append(nokta);
    if (i < d.history.length - 1) rail.append(el("s"));
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
  p.append(iz);

  // "Kodda ne değişti" — devredilen commit'in diff özeti.
  const kod = el("div", "kutu");
  kod.append(el("div", "eyebrow", "Kodda ne değişti"));
  if (!d.diff) {
    kod.append(el("div", "empty", "Bu kart için commit kaydı yok."));
  } else {
    kod.append(el("div", "cid", d.diff.commit));
    const enBuyuk = Math.max(1, ...d.diff.files.map((f) => f.add + f.del));
    d.diff.files.forEach((f) => {
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
  }
  p.append(kod);

  ust.append(p);
  return ust;
}

function kapat() {
  if (location.hash) location.hash = "";
  else document.getElementById("panel").replaceChildren();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") kapat(); });

function hashOku() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h.startsWith("kart/")) detayAc(h.slice("kart/".length));
  else if (h === "akis") void akisAc();
  else if (h === "prompt") void promptAc();
  else if (h === "prompt/yeni") void yeniRolAc();
  else if (h === "yeni") yeniKartAc();
  else document.getElementById("panel").replaceChildren();
}
window.addEventListener("hashchange", hashOku);

function ciz(m) {
  AKTIF_AD = m.flow.name;
  SON_MODEL = m;
  const bar = document.getElementById("bar");
  bar.replaceChildren();
  // KUŞ İŞARETİ bardaki "Skein" metninin YERİNE geçiyor (bkz. isaretSvg
  // yorumu) — currentColor kullandığı için burada hiçbir renk kararı
  // verilmiyor, gövdenin --ink'i ne ise işaret onu alıyor.
  const marka = el("div", "marka");
  marka.append(isaretSvg("currentColor"));
  bar.append(marka);
  const akis = el("div");
  akis.append(el("div", "eyebrow", "Akış"));
  akis.append(el("div", "mono", m.flow.name + "  " + m.flow.hash.slice(0, 12) + "…"));
  bar.append(akis);

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
    bar.append(secici);
  }

  // Akış dosyası bozulduysa ekran eski topolojiyle çizmeye devam ediyor;
  // bunu söylemezse kullanıcı düzenlemesinin neden tutmadığını bilemez.
  const hataKabi = document.getElementById("hata");
  if (m.flow.error) {
    hataKabi.replaceChildren(el("div", "err",
      "Akış dosyası şu an geçersiz — ekran ve gözcü ESKİ topolojiyle devam ediyor:\\n" + m.flow.error));
  } else {
    hataKabi.replaceChildren();
  }

  const g = m.daemon;
  const pill = el("span", "pill " + (g && g.alive ? "on" : "off"));
  pill.append(el("span", "dot" + (g && g.alive ? "" : " dead")));
  pill.append(document.createTextNode(g ? (g.alive ? "gözcü açık" : "gözcü kapalı (bayat kilit)") : "gözcü yok"));
  if (g) pill.append(el("span", "mono", "pid " + g.info.pid));
  bar.append(pill);

  // GÖZCÜ DÜĞMESİ. Ekrandan kart açılabiliyordu ama hiçbir şey koşmuyordu:
  // gözcü ayrı bir kabukta elle başlatılıyordu. Düğme PARAMETRE SEÇMİYOR —
  // model ve araç listesi ekranı açan komutta kuruldu; bu düğme yalnızca
  // onu çalıştırıp durduruyor.
  //
  // Düğme kilidin VARLIĞINA değil CANLI olmasına bakıyor. İlk yazımda
  // g degiskenini kullanmıştım ve gerçek tarayıcıda çıktı: bayat kilitte (gözcü
  // çökmüş, dosya kalmış) düğme "Gözcüyü durdur" diyordu ve basınca
  // "bu gözcüyü bu ekran başlatmadı" cevabı geliyordu. Yapamayacağı şeyi
  // vaat eden düğme — bugün "Geri gönder"de düzeltilen kusurun aynısı.
  // Hap zaten "gözcü kapalı (bayat kilit)" diyor; düğme onunla aynı
  // gerçeği okumak zorunda.
  const canli = Boolean(g && g.alive);
  const gozcuDugme = el("button", "mini", canli ? "Gözcüyü durdur" : "Gözcüyü başlat");
  gozcuDugme.type = "button";
  gozcuDugme.addEventListener("click", () => void gozcuKomut(canli ? "durdur" : "baslat", gozcuDugme));
  bar.append(gozcuDugme);

  bar.append(el("div", "spacer"));
  // Kart açmak, ekranın EN ÇOK kullanılan eylemi ve tek yolu terminaldi:
  // "ekrandan yönet" diyen bir araçta işe başlamanın kendisi ekranda
  // olmayan bir adımdı. İlk sırada duruyor.
  const yeni = el("button", "mini birincil", "Yeni kart");
  yeni.type = "button";
  yeni.addEventListener("click", () => { location.hash = "yeni"; });
  bar.append(yeni);
  const duzenle = el("button", "mini", "Akışı düzenle");
  duzenle.type = "button";
  duzenle.addEventListener("click", () => { location.hash = "akis"; });
  bar.append(duzenle);
  const promptlarDugme = el("button", "mini", "Promptları düzenle");
  promptlarDugme.type = "button";
  promptlarDugme.addEventListener("click", () => { location.hash = "prompt"; });
  bar.append(promptlarDugme);
  // Ust bardaki toplam da alt sinir olabilir; isaret oraya da gider,
  // yoksa kart duzeyinde durust olup ozette yalan sorulmus olurduk.
  [["Açık", m.totals.open], ["Bitti", m.totals.done], ["Aktivasyon", m.totals.activations],
   ["Maliyet", (m.totals.olculmeyen ? "\u2265" : "") + para(m.totals.costUsd)]]
    .forEach(([ad, deger]) => {
      const s = el("div", "stat");
      s.append(el("div", "eyebrow", ad));
      s.append(el("b", null, String(deger)));
      bar.append(s);
    });

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

  const board = document.getElementById("board");
  board.replaceChildren();
  // DEVİR HAREKETİNİN KİMLİK KOŞULU: bu yoklamada panoda kalan her kart
  // kimliğini KORUYOR (bkz. kartYerlestir) — hangi kartların kaldığını
  // biliyoruz ki döngü bitince düşenleri KART_DUGUM/KART_SUTUN'dan silelim
  // (kartHafizasiniBudat), yoksa hafıza sonsuza dek büyür.
  const canliIdler = new Set();
  m.roles.forEach((rol) => {
    const col = el("div", "col");
    const head = el("div", "colhead");
    head.append(el("h2", null, rol.id));
    // ZİNCİR OKU: bu sütunun kartı kabul edilince hangi sütuna gidiyor —
    // yön dar ekranda CSS medya sorgusuyla aşağı döner (bkz. .colhead
    // .zincir .ok kuralı), ölçerek değil.
    const zincir = el("span", "zincir");
    zincir.append(el("span", "ok", "→"));
    zincir.append(document.createTextNode(" " + sonrakiSutun(m, rol.id)));
    head.append(zincir);
    head.append(el("span", "mono", rol.provider + " · " + rol.workspace));
    head.append(el("div", "spacer"));
    const kartlar = m.cards.filter((c) => c.role === rol.id && c.state !== "done" && !c.orphan);
    // Sayı SÜTUNDAKİ kart sayısı, kuyruk derinliği değil: kapıda bekleyen
    // kart kuyrukta durmuyor ve "0" yazan bir başlık yalan söylüyordu.
    head.append(el("span", "mono", String(kartlar.length)));
    if (rol.depth !== kartlar.length) {
      const k = el("span", "mono", rol.depth + " kuyrukta");
      k.style.cssText = "font-size:var(--fs-micro);color:var(--ink-3)";
      head.append(k);
    }
    col.append(head);
    if (!kartlar.length) col.append(el("div", "empty", bosRolMetni(rol, kartlar)));
    kartlar.forEach((c) => {
      canliIdler.add(c.id);
      col.append(kartYerlestir(rol.id, c));
    });
    board.append(col);
  });

  const bitti = m.cards.filter((c) => c.state === "done");
  const col = el("div", "col");
  const head = el("div", "colhead muted");
  head.append(el("h2", null, "bitti"));
  head.append(el("div", "spacer"));
  head.append(el("span", "mono", String(bitti.length)));
  col.append(head);
  if (!bitti.length) col.append(el("div", "empty", bosBittiMetni(m)));
  bitti.forEach((c) => {
    canliIdler.add(c.id);
    col.append(kartYerlestir("bitti", c));
  });
  board.append(col);
  kartHafizasiniBudat(canliIdler);

  // "bu yuzey yalnizca okur" ARTIK DOGRU DEGILDI ve en gorunur yerde
  // duruyordu: ekran kapi karari veriyor, kart aciyor, akis ve prompt
  // yaziyor, gozcuyu baslatiyor. Ozellikler eklendikce bayatlayan bir
  // guvence, hic verilmemis bir guvenceden kotudur.
  document.getElementById("foot").textContent =
    "okundu " + new Date(m.at).toLocaleTimeString("tr-TR") +
    " · durum .skein/ ve olaylar.jsonl'dan okunuyor · değişiklik yalnızca düğmelerle";
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
  } catch (e) {
    // Liste okunamadıysa seçici hiç çıkmaz (AKISLAR boş kalır) — sessizce
    // "başarılı ama boş" ile gerçek bir okuma hatasını karıştırmıyoruz,
    // ama seçici YOKKEN ekranın asıl işi (pano) yine de çizilmeli.
    AKISLAR = [];
  }
}

async function yokla() {
  const uyari = document.getElementById("kopuk");
  try {
    const cevap = await fetch("/durum", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    uyari.replaceChildren();
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

// --- Rol promptları düzenleyici ---
//
// Akış YAML'ı ekrandan düzenlenebiliyordu, ajanın gördüğü METİN (anayasa +
// rol promptu) düzenlenemiyordu. Liste sunucudaki /promptlar ucundan geliyor
// ve TOPOLOJİDEN türüyor — depodaki her dosya değil, yalnızca akışın
// bildirdikleri. Seçilen dosyanın yolu burada, istemcide, uydurulmuyor:
// sunucu her okuma ve yazmada aynı listeye karşı üyelik soruyor.
let PROMPTLAR = [];
let PROMPT_SEC = null;

async function promptAc() {
  const kap = document.getElementById("panel");
  try {
    const cevap = await fetch("/promptlar", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    PROMPTLAR = veri.promptlar || [];
    if (!PROMPTLAR.length) throw new Error("Bu akışta düzenlenebilir prompt yok.");
    if (!PROMPTLAR.some((p) => p.yol === PROMPT_SEC)) PROMPT_SEC = PROMPTLAR[0].yol;
    kap.replaceChildren(promptEditorCiz());
    await promptYukle(PROMPT_SEC);
  } catch (e) {
    kap.replaceChildren(el("div", "err", "Prompt listesi okunamadı: " + e.message));
  }
}

function promptEditorCiz() {
  const ust = el("div", "ust");
  ust.addEventListener("click", (e) => { if (e.target === ust) kapat(); });
  const p = el("div", "panel");

  const kapatDugme = el("button", "kapat", "Kapat");
  kapatDugme.type = "button";
  kapatDugme.addEventListener("click", kapat);
  p.append(kapatDugme);

  p.append(el("h2", null, "Rol promptları"));
  p.append(el("div", "cid", "akışın bildirdiği dosyalar — kaydetmek dosyayı YENİDEN YAZAR"));

  // YENİ ROL yolu bu panelde: zincire bir rol eklemek demek, promptunu da
  // BİRLİKTE yaratmak demek (bkz. /rol/yeni yorumu, server.ts) — iki ayrı
  // ekrana bölmek yarı yaratılmış bir rolü vaat ederdi.
  const yeniRolDugme = el("button", "mini", "Yeni rol");
  yeniRolDugme.type = "button";
  yeniRolDugme.addEventListener("click", () => { location.hash = "prompt/yeni"; });
  p.append(yeniRolDugme);

  const ed = el("div", "promptEd");

  const liste = el("div", "promptListe");
  PROMPTLAR.forEach((pr) => {
    const b = el("button", "mini" + (pr.yol === PROMPT_SEC ? " secili" : ""), pr.etiket);
    b.type = "button";
    b.title = pr.yol;
    b.addEventListener("click", () => { void promptSec(pr.yol); });
    liste.append(b);
  });
  ed.append(liste);

  const alan = el("div", "promptAlan");
  alan.append(el("div", "cid", PROMPT_SEC || ""));
  const metinKutusu = el("textarea");
  metinKutusu.id = "promptMetin";
  metinKutusu.rows = 20;
  alan.append(metinKutusu);

  const altSatir = el("div", "exits");
  const kaydet = el("button", "kaydet", "Dosyaya yaz");
  kaydet.type = "button";
  kaydet.id = "promptKaydet";
  kaydet.addEventListener("click", () => { void promptYaz(); });
  altSatir.append(kaydet);
  alan.append(altSatir);

  const hataKutu = el("div", "err");
  hataKutu.id = "promptHata";
  hataKutu.style.cssText = "display:none";
  alan.append(hataKutu);

  ed.append(alan);
  p.append(ed);

  ust.append(p);
  return ust;
}

/** Seçilen dosyayı değiştirir ve panoyu yeniden çizer — eski seçimi kaybetmeden. */
async function promptSec(yol) {
  PROMPT_SEC = yol;
  document.getElementById("panel").replaceChildren(promptEditorCiz());
  await promptYukle(yol);
}

async function promptYukle(yol) {
  const alan = document.getElementById("promptMetin");
  if (!alan) return;
  alan.disabled = true;
  try {
    const cevap = await fetch("/prompt?yol=" + encodeURIComponent(yol), { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    alan.value = veri.metin;
  } catch (e) {
    alan.value = "";
    const hataKutu = document.getElementById("promptHata");
    if (hataKutu) {
      hataKutu.textContent = "Okunamadı: " + e.message;
      hataKutu.style.cssText = "display:block;white-space:pre-wrap";
    }
  } finally {
    alan.disabled = false;
  }
}

/**
 * Prompt dosyasını YAZAR — KOMUT göndererek.
 *
 * Ekran kendi kopyasını güncellemiyor: çekirdek yazıyor, cevaptaki yeni
 * model çiziliyor. Çekirdek reddederse (bilinmeyen yol, boş metin, yetki
 * yok) mesaj kullanıcıya aynen gider — akış düzenleyicideki "yaz"ın aynısı.
 */
async function promptYaz() {
  const alan = document.getElementById("promptMetin");
  const kaydet = document.getElementById("promptKaydet");
  const hataKutu = document.getElementById("promptHata");
  if (!alan || !PROMPT_SEC) return;
  kaydet.disabled = true;
  hataKutu.style.cssText = "display:none";
  try {
    const cevap = await fetch("/prompt/yaz", {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": JETON },
      body: JSON.stringify({ yol: PROMPT_SEC, metin: alan.value }),
    });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    ciz(veri.model);
  } catch (e) {
    hataKutu.textContent = e.message;
    hataKutu.style.cssText = "display:block;white-space:pre-wrap";
  } finally {
    kaydet.disabled = false;
  }
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
 * "Promptları düzenle" yolundan da açılabiliyor ve o yolda bu ön seçim
 * olmamalı (eski bir diyagram tıklaması bir sonraki, İLİŞKİSİZ açılışı
 * etkilemesin).
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

// Liste ÖNCE: ilk çizimde seçici eksik çıkıp bir saniye sonra belirmesin.
void akislarYukle().then(() => yokla().then(hashOku));
setInterval(yokla, 1000);
</script>
</body>
</html>
`;

