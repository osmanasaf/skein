import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnPortable, tsxCliPath } from "../proc/process.js";
import { parseArgs, zamanAsimiSecenegi } from "./cli.js";

/**
 * ZAMAN AŞIMI AYARLANABİLİR OLMALI.
 *
 * Sabit 20 dakika gerçek bir koşuda üç büyük kartı üst üste kesti: her
 * kesilen tur kartı kapıya çıkarıyor, parası ödeniyor ve ağaçta
 * işlenmemiş iş bırakıyor. Biri tek başına 35,6 milyon token'dı.
 */
describe("parseArgs — --timeout", () => {
  it("dakikayı milisaniyeye çevirir", () => {
    expect(parseArgs(["akis", "--timeout", "45"]).timeoutMs).toBe(45 * 60_000);
  });

  it("verilmezse BOŞ kalır — çekirdeğin varsayılanı uygulanır", () => {
    const args = parseArgs(["akis"]);
    expect(args.timeoutMs).toBeUndefined();
    // İkinci bir varsayılan yazmak iki ayrı gerçek olurdu: varsayılan
    // tek yerde, `tick.ts` içinde.
    expect("timeoutMs" in args && args.timeoutMs !== undefined).toBe(false);
  });

  // ASIL SINAV. `Number("abc")` NaN verir ve `setTimeout(_, NaN)`
  // beklemeyi SIFIR sayar: yazım hatası yapan operatör, her turu anında
  // kesilen bir gözcü elde eder ve sebebi hiçbir yerde yazmaz.
  it("sayı olmayan değeri REDDEDER, sessizce yok saymaz", () => {
    expect(() => parseArgs(["akis", "--timeout", "abc"])).toThrow(/--timeout/);
  });

  it("sıfırı ve negatifi reddeder", () => {
    expect(() => parseArgs(["akis", "--timeout", "0"])).toThrow(/--timeout/);
    expect(() => parseArgs(["akis", "--timeout", "-5"])).toThrow(/--timeout/);
  });

  // Kesirli dakika meşru: 0.5 = 30 saniye, kısa sınama koşuları için.
  it("kesirli dakikayı kabul eder", () => {
    expect(parseArgs(["akis", "--timeout", "0.5"]).timeoutMs).toBe(30_000);
  });

  // `--poll` ile karışmamalı: ikisi de sayı alıyor ve ikisi de ayrı şey.
  it("--poll ile --timeout birbirine karışmaz", () => {
    const args = parseArgs(["akis", "--poll", "250", "--timeout", "30"]);
    expect(args.pollMs).toBe(250);
    expect(args.timeoutMs).toBe(30 * 60_000);
  });
});

/**
 * VARSAYILAN TEK YERDE.
 *
 * `tick.ts` içindeki `DEFAULT_TIMEOUT_MS` biricik kaynak. CLI kendi
 * varsayılanını yazarsa iki gerçek olur ve biri bir gün sessizce
 * bayatlar — bu depodaki yinelenen kusur sınıfı.
 */
describe("zamanAsimiSecenegi", () => {
  it("bayrak verilmediyse alanı HİÇ yazmaz", () => {
    const secenek = zamanAsimiSecenegi(parseArgs(["akis"]));
    expect(secenek).toEqual({});
    // `{ timeoutMs: undefined }` yetmez: `exactOptionalPropertyTypes`
    // altında bile nesne yayılınca alan VAR sayılabilir.
    expect("timeoutMs" in secenek).toBe(false);
  });

  it("bayrak verildiyse aynen taşır", () => {
    expect(zamanAsimiSecenegi(parseArgs(["akis", "--timeout", "45"])))
      .toEqual({ timeoutMs: 45 * 60_000 });
  });
});

/**
 * TANIMADIĞIN BAYRAĞI SESSİZCE YUTMA.
 *
 * Bu kusur gerçekte şöyle patladı: ekranı `--timeout 50` ile açtım ve 50
 * dakikalık bir koşu başlattığımı sandım. Bayrak tanınmıyordu, hiçbir
 * yere kaydedilmeden düştü, ve turlar yine 20 dakikada kesilecekti.
 * Yazım hatası yapan operatöre "anlamadım" demek, ona sessizce başka bir
 * şey yapmaktan her zaman ucuzdur.
 */
describe("parseArgs — bilinmeyen bayrak", () => {
  it("bilinmeyen uzun bayrağı REDDEDER", () => {
    expect(() => parseArgs(["akis", "--zamanasimi", "50"])).toThrow(/bilinmeyen bayrak/);
  });

  it("bilinmeyen kısa bayrağı da reddeder", () => {
    expect(() => parseArgs(["akis", "-x"])).toThrow(/bilinmeyen bayrak/);
  });

  // Hata mesajı HANGİ bayrak olduğunu söylemeli: "bilinmeyen bayrak"
  // tek başına, beş bayraklı bir komut satırında işe yaramaz.
  it("hata hangi bayrak olduğunu söyler", () => {
    expect(() => parseArgs(["akis", "--zamanasimi"])).toThrow(/--zamanasimi/);
  });

  it("tanınan bayraklar etkilenmez", () => {
    const args = parseArgs(["akis", "--serve", "--timeout", "30", "--model", "claude:m"]);
    expect(args.serve).toBe(true);
    expect(args.timeoutMs).toBe(30 * 60_000);
    expect(args.models).toEqual(["claude:m"]);
  });
});

/**
 * Koruma eklendikten sonra kalan tek soru: gözcü GERÇEKTEN hâlâ koşuyor mu?
 *
 * `girisNoktasiMi` her zaman false dönerse birim sınamaları yeşil kalır,
 * takım yeşil kalır ve CLI hiçbir şey yapmadan sessizce çıkar. Bu sınama
 * süreci gerçekten başlatıp `main`'in çalıştığının KANITINI arıyor:
 * bilinmeyen bayrak reddi ancak `main` koştuysa basılır.
 */
describe("giriş noktası — İÇE ALMAK gözcüyü başlatmaz", () => {
  /**
   * BU SINAMANIN VAR OLMA SEBEBİ: mutasyon turunda "korumayı kaldır, yine
   * koşulsuz `main()` çağır" mutasyonu AYAKTA KALDI. Kusurun belirtisi bir
   * assertion değil, vitest'in "unhandled rejection" satırıydı: `Tests`
   * satırı yeşil kalıyor, çıkış kodu değişmiyor ve kimse duymuyor.
   *
   * Bir belirtiyi sınamak için onu ÖLÇÜLEBİLİR hâle getirmek gerekiyordu:
   * modülü ayrı bir süreçte, giriş noktası OLMADAN içe alıyoruz. Koruma
   * yoksa `main([])` akış adı olmadan koşar, `✗` basıp 1 ile çıkar.
   * Koruma varsa hiçbir şey olmaz ve işaret basılır.
   */
  it("ayrı bir süreçte import edilince main KOŞMAZ — temiz çıkar", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skein-iceal-"));
    try {
      const modul = pathToFileURL(join(process.cwd(), "src", "watch", "cli.ts")).href;
      const script = join(dir, "iceal.mjs");
      await writeFile(
        script,
        `const m = await import(${JSON.stringify(modul)});\n` +
          `console.log("ICE_ALINDI:" + typeof m.parseArgs);\n`,
      );
      const child = spawnPortable(process.execPath, [tsxCliPath(process.cwd()), script], {
        cwd: process.cwd(),
      });
      let cikti = "";
      child.stdout.on("data", (c: Buffer) => { cikti += c.toString(); });
      child.stderr.on("data", (c: Buffer) => { cikti += c.toString(); });
      const code = await new Promise<number | null>((res) => child.on("close", res));

      // İçe almak BAŞARILI olmalı ve `main`in hiçbir izi olmamalı.
      expect(cikti).toContain("ICE_ALINDI:function");
      expect(code).toBe(0);
      expect(cikti).not.toContain("✗");
      expect(cikti).not.toContain("gözcü");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("giriş noktası — main GERÇEKTEN koşuyor", () => {
  it("süreç olarak çağrıldığında ayrıştırma çalışır (koruma doğru tarafta)", async () => {
    const child = spawnPortable(
      process.execPath,
      [tsxCliPath(process.cwd()), join(process.cwd(), "src", "watch", "cli.ts"), "akis", "--yok-boyle"],
      { cwd: process.cwd() },
    );
    let cikti = "";
    child.stdout.on("data", (c: Buffer) => { cikti += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { cikti += c.toString(); });
    const code = await new Promise<number | null>((res) => child.on("close", res));

    expect(code).toBe(1);
    expect(cikti).toContain("--yok-boyle");
  }, 60_000);
});
