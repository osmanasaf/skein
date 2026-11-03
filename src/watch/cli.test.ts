import { describe, expect, it } from "vitest";
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
