/**
 * Ekranın kendisi — tek dosya, bağımlılıksız.
 *
 * Neden böyle: bu depo bir frontend yığını taşımıyor ve taşımamalı. Derleme
 * adımı, paket ağacı ve bir build çıktısı, "ekran saf okuyucudur" kısıtını
 * ilk ihlal edecek yer olurdu. Sayfa `/durum`'u yokluyor ve çiziyor; başka
 * hiçbir şey yapmıyor.
 */
export const PAGE = `<!doctype html>
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
    border-radius: 3px; cursor: not-allowed; opacity: .75;
  }
  .exits button.primary { background: var(--gate); border-color: var(--gate); color: #fff; }
  .soon { margin-top: 7px; font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); }
  .empty { color: var(--ink-3); font-size: 13px; padding: 10px 0; }
  .err {
    background: var(--gate-bg); border: 1px solid var(--gate-line); color: var(--gate-ink);
    border-radius: 4px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px;
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

  footer { margin-top: 22px; font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
</style>
</head>
<body>
<div class="wrap">
  <div class="bar" id="bar"></div>
  <div id="uyari"></div>
  <div class="board" id="board"></div>
  <footer id="foot"></footer>
</div>
<div id="panel"></div>
<script>
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
  // kod sonraki worktree'ye hiç taşınmadı.
  if (kind === "escalation") return { etiket: "kaçış kapısı", not: "kod taşınmadı", dugmeler: ["Yeniden koş", "Geri gönder"] };
  if (kind === "deadlock") return { etiket: "kilit kapısı", not: "ret limiti doldu", dugmeler: ["Üretici haklı", "Denetçi haklı"] };
  return { etiket: "onay kapısı", not: "kod taşındı", dugmeler: ["Geçir", "Geri gönder"] };
}

function kartCiz(c) {
  const kutu = el("div", "card" + (c.state === "active" ? " live" : "") + (c.gate ? " gate" : ""));

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

  if (kapi) {
    const cikis = el("div", "exits");
    kapi.dugmeler.forEach((ad, i) => {
      const b = el("button", i === 0 ? "primary" : null, ad);
      b.type = "button";
      b.disabled = true;
      cikis.append(b);
    });
    kutu.append(cikis);
    kutu.append(el("div", "soon", "↑ adım 4 — bu düğmeler çekirdeğe komut gönderecek"));
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

  const g = m.daemon;
  const pill = el("span", "pill " + (g && g.alive ? "on" : "off"));
  pill.append(el("span", "dot" + (g && g.alive ? "" : " dead")));
  pill.append(document.createTextNode(g ? (g.alive ? "gözcü açık" : "gözcü kapalı (bayat kilit)") : "gözcü yok"));
  if (g) pill.append(el("span", "mono", "pid " + g.info.pid));
  bar.append(pill);

  bar.append(el("div", "spacer"));
  [["Açık", m.totals.open], ["Bitti", m.totals.done], ["Aktivasyon", m.totals.activations], ["Maliyet", para(m.totals.costUsd)]]
    .forEach(([ad, deger]) => {
      const s = el("div", "stat");
      s.append(el("div", "eyebrow", ad));
      s.append(el("b", null, String(deger)));
      bar.append(s);
    });

  const board = document.getElementById("board");
  board.replaceChildren();
  m.roles.forEach((rol) => {
    const col = el("div", "col");
    const head = el("div", "colhead");
    head.append(el("h2", null, rol.id));
    head.append(el("span", "mono", rol.provider + " · " + rol.workspace));
    head.append(el("div", "spacer"));
    const kartlar = m.cards.filter((c) => c.role === rol.id && c.state !== "done");
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
  const uyari = document.getElementById("uyari");
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
yokla().then(hashOku);
setInterval(yokla, 1000);
</script>
</body>
</html>
`;
