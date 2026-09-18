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
  :root {
    --bg: #EEF2F1; --surface: #FFFFFF; --surface-2: #E6ECEA;
    --ink: #141E1C; --ink-2: #48605C; --ink-3: #6E7E7B;
    --line: #D2DCD9; --line-soft: #EEF2F1;
    --accent: #0B6E63; --accent-ink: #085A51; --accent-soft: #E4F1EE; --accent-line: #9CC9C2;
    --accept: #3C7A4B; --reject: #A03636; --gate: #8A6410;
    --gate-bg: #FDF7EA; --gate-line: #D9B871; --gate-ink: #4A3A18;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0D1413; --surface: #141D1B; --surface-2: #1B2624;
      --ink: #E7EEEC; --ink-2: #A2B2AF; --ink-3: #7E8E8B;
      --line: #293533; --line-soft: #1F2A28;
      --accent: #4FB3A5; --accent-ink: #7ECBBF; --accent-soft: #10312D; --accent-line: #2C5A54;
      --accept: #6FA97C; --reject: #D58080; --gate: #C39B45;
      --gate-bg: #241E10; --gate-line: #5C4A22; --gate-ink: #E3D3AC;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1500px; margin: 0 auto; padding: 20px 16px 48px; }
  .mono { font-family: var(--mono); }
  .eyebrow {
    font-size: 10px; font-weight: 600; letter-spacing: .1em;
    text-transform: uppercase; color: var(--ink-3);
  }

  /* koşu şeridi */
  .bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 4px;
    padding: 12px 18px; margin-bottom: 18px;
  }
  .brand { font-size: 19px; font-weight: 700; letter-spacing: -.02em; }
  .pill {
    display: inline-flex; align-items: center; gap: 8px;
    border: 1px solid var(--line); border-radius: 3px; padding: 5px 11px; font-size: 13px;
  }
  .pill.on { background: var(--accent-soft); border-color: var(--accent-line); }
  .pill.off { background: var(--surface-2); color: var(--ink-2); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: 0 0 auto; }
  .dot.dead { background: var(--ink-3); }
  .spacer { flex: 1 1 auto; }
  .stat { text-align: right; }
  .stat b { display: block; font-family: var(--mono); font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; }

  /* pano */
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(252px, 1fr)); gap: 14px 12px; align-items: start; }
  .col { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .colhead {
    display: flex; align-items: baseline; gap: 8px;
    padding-bottom: 7px; border-bottom: 2px solid var(--ink);
  }
  .colhead.muted { border-bottom-color: var(--line); color: var(--ink-2); }
  .colhead h2 { margin: 0; font-size: 15px; font-weight: 700; }
  .card {
    background: var(--surface); border: 1px solid var(--line);
    border-radius: 4px; padding: 13px 14px;
  }
  .card.live { border: 2px solid var(--accent); padding: 12px 13px; }
  .card.gate { background: var(--gate-bg); border-color: var(--gate-line); }
  .card.orphan { border-color: var(--reject); border-style: dashed; }
  .band {
    border: 1px dashed var(--reject); border-radius: 4px; padding: 14px 16px; margin-bottom: 16px;
  }
  .band h2 { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--reject); }
  .band p { margin: 0 0 12px; font-size: 12.5px; line-height: 1.5; color: var(--ink-2); max-width: 70ch; }
  .band .kartlar { display: grid; grid-template-columns: repeat(auto-fit, minmax(252px, 1fr)); gap: 12px; }
  .card h3 { margin: 0; font-size: 14.5px; font-weight: 600; line-height: 1.3; }
  .cid { font-family: var(--mono); font-size: 11px; color: var(--ink-3); margin-top: 3px; }
  .tag {
    font-size: 10.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .tag.run { color: var(--accent-ink); }
  .tag.gate { color: var(--gate); }
  .tag.queued { color: var(--ink-3); }
  .reason {
    margin-top: 9px; font-size: 12.5px; line-height: 1.45; color: var(--gate-ink);
    overflow-wrap: anywhere;
  }
  .step {
    margin-top: 11px; padding-top: 9px; border-top: 1px dashed var(--line);
    display: flex; align-items: center; gap: 8px;
    font-family: var(--mono); font-size: 11.5px; color: var(--ink-2);
  }
  .step .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .step .seq { margin-left: auto; color: var(--ink-3); flex: 0 0 auto; }
  .meta {
    display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px;
    font-family: var(--mono); font-size: 11px; color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .meta .bad { color: var(--reject); }
  .trail { display: flex; align-items: center; gap: 3px; margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .trail i { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
  .trail s { flex: 1 1 auto; height: 1px; background: var(--line); }
  .exits { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px; }
  .exits button {
    font: inherit; font-size: 13px; font-weight: 500; min-height: 44px; padding: 0 14px;
    border: 1px solid var(--gate-line); background: transparent; color: var(--gate-ink);
    border-radius: 3px; cursor: pointer;
  }
  .exits button:hover:not(:disabled) { border-color: var(--gate); }
  .exits button:disabled { cursor: progress; opacity: .6; }
  .redd {
    margin-top: 10px; padding: 10px 12px; border: 1px solid var(--reject);
    border-radius: 3px; font-size: 12.5px; line-height: 1.5; color: var(--ink);
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .exits button.primary { background: var(--gate); border-color: var(--gate); color: #fff; }
  .soon { margin-top: 7px; font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); }
  .empty { color: var(--ink-3); font-size: 13px; padding: 10px 0; }
  .err {
    background: var(--gate-bg); border: 1px solid var(--gate-line); color: var(--gate-ink);
    border-radius: 4px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px;
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  /* detay paneli */
  .ust { position: fixed; inset: 0; background: rgba(10,20,18,.42); display: flex; justify-content: flex-end; z-index: 9; }
  .panel {
    width: min(620px, 100%); height: 100%; overflow-y: auto; background: var(--surface);
    border-left: 1px solid var(--line); padding: 20px 22px 40px;
  }
  .panel h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
  .panel .kapat {
    position: sticky; top: 0; float: right; font: inherit; font-size: 13px; min-height: 44px;
    padding: 0 14px; border: 1px solid var(--line); background: var(--surface);
    color: var(--ink-2); border-radius: 3px; cursor: pointer;
  }
  .iz { display: flex; gap: 11px; }
  .iz .t { width: 54px; flex: 0 0 auto; font-family: var(--mono); font-size: 11px; color: var(--ink-3); padding-top: 2px; font-variant-numeric: tabular-nums; }
  .iz .rail { width: 11px; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; }
  .iz .rail i { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; flex: 0 0 auto; }
  .iz .rail s { width: 1px; flex: 1 1 auto; background: var(--line); min-height: 12px; }
  .iz .gov { flex: 1 1 auto; min-width: 0; padding-bottom: 13px; }
  .iz .gov b { font-size: 13.5px; }
  .iz .gov em { font-family: var(--mono); font-size: 11px; color: var(--ink-3); font-style: normal; margin-left: 6px; }
  .iz .gov p { margin: 3px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--ink-2); overflow-wrap: anywhere; }
  .dosya { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
  .dosya .p { flex: 1 1 auto; min-width: 0; font-family: var(--mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dosya .a { font-family: var(--mono); font-size: 11.5px; color: var(--accept); width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
  .dosya .d { font-family: var(--mono); font-size: 11.5px; color: var(--reject); width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
  .cizgi { display: flex; gap: 2px; width: 90px; flex: 0 0 auto; }
  .cizgi i { height: 8px; border-radius: 1px; }
  .kutu { border-top: 1px solid var(--line); margin-top: 18px; padding-top: 14px; }
  .card { cursor: pointer; }
  .card:hover { border-color: var(--accent-line); }

  /* akış düzenleyici */
  .ed { display: flex; flex-direction: column; gap: 12px; }
  .rol {
    border: 1px solid var(--line); border-radius: 4px; padding: 12px; background: var(--surface);
    display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 9px 10px;
  }
  .rol label { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; color: var(--ink-3); }
  .rol input, .rol select {
    font: inherit; font-size: 12.5px; font-family: var(--mono); min-height: 34px;
    padding: 0 7px; border: 1px solid var(--line); border-radius: 3px;
    background: var(--bg); color: var(--ink); min-width: 0;
  }
  .rol .genis { grid-column: 1 / -1; }
  .rolust { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
  .rolust b { font-family: var(--mono); font-size: 12px; }
  .mini {
    font: inherit; font-size: 12px; min-height: 34px; padding: 0 10px; cursor: pointer;
    border: 1px solid var(--line); background: transparent; color: var(--ink-2); border-radius: 3px;
  }
  .mini:hover { border-color: var(--accent); color: var(--accent-ink); }
  .mini.sil:hover { border-color: var(--reject); color: var(--reject); }
  .onizle {
    font-family: var(--mono); font-size: 11.5px; line-height: 1.6; white-space: pre;
    overflow-x: auto; background: var(--surface-2); border: 1px solid var(--line);
    border-radius: 3px; padding: 10px 12px; max-height: 260px; overflow-y: auto;
  }
  .maliyet { display: flex; gap: 18px; flex-wrap: wrap; font-family: var(--mono); font-size: 12.5px; }
  .kaydet {
    font: inherit; font-size: 13px; font-weight: 500; min-height: 44px; padding: 0 18px;
    border: 1px solid var(--accent); background: var(--accent); color: #fff;
    border-radius: 3px; cursor: pointer;
  }
  .kaydet:disabled { opacity: .5; cursor: not-allowed; }

  footer { margin-top: 22px; font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
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
const DOT = { accepted: "var(--accept)", rejected: "var(--reject)", gate: "var(--gate)", released: "var(--gate)", done: "var(--accept)" };
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

function kapiCikislari(kind) {
  // Üç kapı, üç ayrı çıkış kümesi. Kaçışta "Geçir" YOK: tur tamamlanmadı,
  // kod sonraki worktree'ye hiç taşınmadı ve çekirdek zaten reddeder.
  if (kind === "escalation") {
    return { etiket: "kaçış kapısı", not: "kod taşınmadı",
      dugmeler: [["Yeniden koş", "retry"], ["Geri gönder", "back"]] };
  }
  if (kind === "deadlock") {
    return { etiket: "kilit kapısı", not: "ret limiti doldu",
      dugmeler: [["Üretici haklı", "forward"], ["Denetçi haklı", "back"]] };
  }
  return { etiket: "onay kapısı", not: "kod taşındı",
    dugmeler: [["Geçir", "forward"], ["Geri gönder", "back"]] };
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

function kartCiz(c) {
  const kutu = el("div", "card" + (c.state === "active" ? " live" : "") + (c.gate ? " gate" : "") + (c.orphan ? " orphan" : ""));

  const ust = el("div", "tag " + (c.gate ? "gate" : c.state === "active" ? "run" : "queued"));
  if (c.state === "active") ust.append(el("span", "dot"));
  const kapi = c.gate ? kapiCikislari(c.gate) : null;
  ust.append(document.createTextNode(
    c.gate ? kapi.etiket : c.state === "active" ? "çalışıyor" : c.state === "done" ? "bitti" : "kuyrukta"
  ));
  if (kapi) {
    const not = el("span", "mono", kapi.not);
    not.style.cssText = "margin-left:auto;font-size:10px;text-transform:none;letter-spacing:0";
    ust.style.display = "flex";
    ust.append(not);
  }
  kutu.append(ust);

  kutu.append(el("h3", null, c.title));
  kutu.append(el("div", "cid", c.id + " · " + c.role));

  if (c.gateReason) kutu.append(el("div", "reason", c.gateReason));
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
  if (c.costUsd) meta.append(el("span", null, para(c.costUsd)));
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
  kutu.tabIndex = 0;
  kutu.setAttribute("role", "button");
  kutu.setAttribute("aria-label", c.title + " — detay");
  // Panel adreslenebilir: bir karta bakarken URL'yi paylaşabilmek,
  // "hangi kart" sorusunu konuşmanın en kısa yolu.
  const ac = () => { location.hash = "kart/" + c.id; };
  kutu.addEventListener("click", ac);
  kutu.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ac(); } });
  return kutu;
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
  }

  const m = el("div", "meta");
  if (d.card.rejects) m.append(el("span", "bad", d.card.rejects + " ret"));
  m.append(el("span", null, d.card.turns + " tur"));
  if (d.card.durationMs) m.append(el("span", null, sure(d.card.durationMs)));
  if (d.card.costUsd) m.append(el("span", null, para(d.card.costUsd)));
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
      // Alışverişin kendi sayıları — kaydın taşımadığı (`null`) alanlar hiç
      // basılmaz, "0" ile "hiç ölçülmedi" karışmasın.
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
  else document.getElementById("panel").replaceChildren();
}
window.addEventListener("hashchange", hashOku);

function ciz(m) {
  const bar = document.getElementById("bar");
  bar.replaceChildren();
  bar.append(el("div", "brand", "Skein"));
  const akis = el("div");
  akis.append(el("div", "eyebrow", "Akış"));
  akis.append(el("div", "mono", m.flow.name + "  " + m.flow.hash.slice(0, 12) + "…"));
  bar.append(akis);

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

  bar.append(el("div", "spacer"));
  const duzenle = el("button", "mini", "Akışı düzenle");
  duzenle.type = "button";
  duzenle.addEventListener("click", () => { location.hash = "akis"; });
  bar.append(duzenle);
  [["Açık", m.totals.open], ["Bitti", m.totals.done], ["Aktivasyon", m.totals.activations], ["Maliyet", para(m.totals.costUsd)]]
    .forEach(([ad, deger]) => {
      const s = el("div", "stat");
      s.append(el("div", "eyebrow", ad));
      s.append(el("b", null, String(deger)));
      bar.append(s);
    });

  // Hiçbir kart ekrandan düşmemeli. Rolü yaşayan akışta olmayan kart
  // hiçbir sütuna uymuyor; kendi şeridinde, sebebiyle birlikte duruyor.
  const uyari = document.getElementById("uyari");
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
    uyari.replaceChildren(band);
  } else {
    uyari.replaceChildren();
  }

  const board = document.getElementById("board");
  board.replaceChildren();
  m.roles.forEach((rol) => {
    const col = el("div", "col");
    const head = el("div", "colhead");
    head.append(el("h2", null, rol.id));
    head.append(el("span", "mono", rol.provider + " · " + rol.workspace));
    head.append(el("div", "spacer"));
    const kartlar = m.cards.filter((c) => c.role === rol.id && c.state !== "done" && !c.orphan);
    // Sayı SÜTUNDAKİ kart sayısı, kuyruk derinliği değil: kapıda bekleyen
    // kart kuyrukta durmuyor ve "0" yazan bir başlık yalan söylüyordu.
    head.append(el("span", "mono", String(kartlar.length)));
    if (rol.depth !== kartlar.length) {
      const k = el("span", "mono", rol.depth + " kuyrukta");
      k.style.cssText = "font-size:10px;color:var(--ink-3)";
      head.append(k);
    }
    col.append(head);
    if (!kartlar.length) col.append(el("div", "empty", "—"));
    kartlar.forEach((c) => col.append(kartCiz(c)));
    board.append(col);
  });

  const bitti = m.cards.filter((c) => c.state === "done");
  const col = el("div", "col");
  const head = el("div", "colhead muted");
  head.append(el("h2", null, "bitti"));
  head.append(el("div", "spacer"));
  head.append(el("span", "mono", String(bitti.length)));
  col.append(head);
  if (!bitti.length) col.append(el("div", "empty", "—"));
  bitti.forEach((c) => col.append(kartCiz(c)));
  board.append(col);

  document.getElementById("foot").textContent =
    "okundu " + new Date(m.at).toLocaleTimeString("tr-TR") + " · .skein/ dizini + olaylar.jsonl · bu yüzey yalnızca okur";
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

async function akisAc() {
  const kap = document.getElementById("panel");
  try {
    const cevap = await fetch("/akis", { cache: "no-store" });
    const veri = await cevap.json();
    if (!cevap.ok) throw new Error(veri.hata || cevap.status);
    if (!veri.draft) throw new Error("Bu ekran akış düzenlemeye açık değil.");
    TASLAK = veri.draft;
    SAGLAYICILAR = veri.providers || [];
    kap.replaceChildren(editorCiz());
    void onizle();
  } catch (e) {
    kap.replaceChildren(el("div", "err", "Akış okunamadı: " + e.message));
  }
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

function yenile() {
  document.getElementById("panel").replaceChildren(editorCiz());
  void onizle();
}

function editorCiz() {
  const ust = el("div", "ust");
  ust.addEventListener("click", (e) => { if (e.target === ust) kapat(); });
  const p = el("div", "panel");

  const kapatDugme = el("button", "kapat", "Kapat");
  kapatDugme.type = "button";
  kapatDugme.addEventListener("click", kapat);
  p.append(kapatDugme);

  p.append(el("h2", null, "Akış: " + TASLAK.name));
  p.append(el("div", "cid", TASLAK.roles.length + " rol · kaydetmek dosyayı YENİDEN YAZAR"));

  const ed = el("div", "ed");
  TASLAK.roles.forEach((rol, i) => ed.append(rolCiz(rol, i)));
  p.append(ed);

  const sonuc = el("div", "kutu");
  sonuc.id = "onizleme";
  p.append(sonuc);

  const alt = el("div", "exits");
  const kaydet = el("button", "kaydet", "Dosyaya yaz");
  kaydet.type = "button";
  kaydet.id = "kaydet";
  kaydet.disabled = true;
  kaydet.addEventListener("click", () => { void yaz(); });
  alt.append(kaydet);
  p.append(alt);
  p.append(el("div", "soon",
    "Kaydetmek akış dosyasını yeniden yazar: YORUMLAR KAYBOLUR. Dosya git'te, " +
    "diff'e bakabilirsin. Kapı metinleri, anayasa ve audit ayarları aynen korunur."));

  ust.append(p);
  return ust;
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

yokla().then(hashOku);
setInterval(yokla, 1000);
</script>
</body>
</html>
`;

