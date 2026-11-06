import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractJson, applyVerdicts } from "./judge.js";
import { applyFindings } from "./classify.js";

/**
 * PROMPT İLE KODUN SÖZLEŞMESİ.
 *
 * `bench/prompts/judge.md` ve `siniflandir.md` ajana JSON'un alan adlarını
 * BİREBİR söylüyor. Kod o adları okumuyorsa her alan sessizce `undefined`
 * gelir ve puanlama "bildirilmedi"yi "sıfır" sayar — bu depodaki adıyla
 * BİLDİRİLMEYEN SIFIR DEĞİLDİR.
 *
 * NİYE BU DOSYA VAR: dil geçişinin 1. partisinde `alinti -> quotation` ve
 * `gerekce -> rationale` çevrildi. Kod ajanın HİÇ yazmadığı alanları
 * okumaya başladı. O sırada 1654 sınamanın HİÇBİRİ düşmedi: judge.test.ts
 * ve classify.test.ts'in fikstürleri de birlikte çevrilmişti, yani kendi
 * içinde tutarlıydılar. Isırmayan sınama.
 *
 * Buradaki sınamalar fikstür KULLANMIYOR: promptun KENDİSİNDEKİ örneği
 * okuyup gerçek ayrıştırıcıdan geçiriyorlar. Promptla kod ayrışırsa
 * düşerler.
 */
const REPO = new URL("../../", import.meta.url).pathname;

/** Promptun içindeki ```json bloğundan ilk JSON dizisini çıkarır. */
function promptOrnegi(markdown: string): string {
  const fenced = [...markdown.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  const aday = fenced.find((f) => f.trim().startsWith("["));
  if (aday === undefined) throw new Error("promptta JSON dizisi örneği yok");
  return aday;
}

describe("prompt sözleşmesi — hakem", () => {
  it("promptun kendi örneği gerçek ayrıştırıcıdan GEÇİYOR ve alıntı/gerekçe TAŞINIYOR", async () => {
    const md = await readFile(join(REPO, "bench/prompts/judge.md"), "utf8");
    const raws = extractJson(promptOrnegi(md));
    expect(raws.length).toBeGreaterThan(0);

    // Promptun ilk örneği "yakalandi": true ve bir alıntı taşıyor.
    // Kod o alanları okumuyorsa alıntı undefined gelir ve bu sınama düşer.
    const ilk = raws[0] as Record<string, unknown>;
    const alinti = ilk["alinti"];
    expect(typeof alinti).toBe("string");

    // Alıntı raporda BULUNUYORSA karar "yakalandı" olmalı. Rapor olarak
    // alıntının kendisini veriyoruz: eşleşme kesin.
    const v = applyVerdicts(["kanca-1"], raws, String(alinti));
    expect(v[0]?.caught).toBe(true);
    expect(v[0]?.quote).toBe(alinti);
  });
});

describe("prompt sözleşmesi — sınıflandırıcı", () => {
  it("promptun kendi örneği gerçek sınıflandırıcıdan GEÇİYOR ve alıntı DOĞRULANIYOR", async () => {
    const md = await readFile(join(REPO, "bench/prompts/siniflandir.md"), "utf8");
    const ornek = promptOrnegi(md);
    const raws = JSON.parse(ornek) as Record<string, unknown>[];
    expect(raws.length).toBeGreaterThan(0);

    const alintilar = raws.map((r) => r["alinti"]).filter((a): a is string => typeof a === "string");
    expect(alintilar.length).toBeGreaterThan(0);

    // Promptun İLK örneği gerçek bir cümle; İKİNCİSİ "…" yer tutucusu ve
    // normalleştirmeden sonra boşalıyor, yani doğrulanamaz sayılması
    // DOĞRU. İddia o yüzden ilk bulgu üzerinden kuruluyor.
    //
    // Kod `alinti` alanını okumuyorsa alıntı "" olur, raporda bulunamaz ve
    // ilk bulgu da unverified'a düşer — sınama o hâlde düşer.
    const ilkAlinti = alintilar[0] as string;
    const sonuc = applyFindings(raws as never, ilkAlinti);
    expect(sonuc.findings.length).toBeGreaterThan(0);
    expect(sonuc.findings[0]?.quote).toBe(ilkAlinti);
  });
});
