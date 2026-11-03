import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { killTree, spawnPortable } from "../proc/process.js";

/**
 * EKRANI GERÇEK SÜREÇ OLARAK KOŞTURAN SINAMALAR.
 *
 * `port-memory.test.ts` ve `open-browser.test.ts` birim sınıyor — enjekte
 * edilmiş sahte `ac`/`spawn` ile mantığın kendisini. Bu dosya onların
 * `cli.ts`'e DOĞRU bağlandığını sınıyor: argüman ayrıştırma, `--port`
 * önceliği ve `.skein/ekran.json` ile gerçek dosya sistemi üzerinden.
 *
 * `cli.ts` modül düzeyinde kendini çağırıyor (bkz. `card/cli.test.ts`'teki
 * aynı not), yani import edilemiyor — sınama GERÇEK bir `tsx` süreci
 * başlatıp "ekran açık: <url>" satırını bekliyor.
 */
const FLOW = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-uicli-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface CalisanEkran {
  port: number;
  url: string;
  /** O ana kadar biriken stdout+stderr — CANLI: her çağrıda güncel hâlini verir. */
  metni: () => string;
  durdur: () => Promise<void>;
}

/**
 * Ekranı gerçek süreç olarak başlatır; "ekran açık: <url>" satırını bekler.
 *
 * `killTree` ile durduruyoruz, `child.kill()` ile DEĞİL: `tsx` asıl süreci
 * TORUN olarak koşturuyor (bkz. `ui/server.ts`'teki `gercekSpawn` yorumu,
 * aynı ölçülmüş kusur) — yalnızca doğrudan çocuğa sinyal göndermek portu
 * serbest bırakmadan döner ve bir sonraki sınama aynı portu bulamaz.
 */
/**
 * `tsx`'i `npx` ÜZERİNDEN DEĞİL, DOĞRUDAN çağırıyoruz — bu depodaki gözcü
 * başlatma koduyla (`ui/cli.ts`'in `gercekSpawn`'ı) aynı desen.
 *
 * Fark burada ÖNEMLİ: bir sınama `PATH`i boşaltarak çocuğun İÇİNDEKİ
 * `xdg-open` aramasını deterministik olarak başarısız kılmak istiyor.
 * `npx` KENDİSİ PATH'te bir ad olduğu için `PATH=""` ile dışarıdan hiç
 * BULUNAMAZDI — mutlak yola gidince dış süreç PATH'e bağımlı olmuyor, yalnız
 * `cli.ts`'in İÇİNDE arandığı `xdg-open` bağımlı kalıyor.
 */
function tsxYolu(): string {
  return join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
}

function ekraniBaslat(
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<CalisanEkran> {
  return new Promise((resolve, reject) => {
    const child = spawnPortable(
      process.execPath,
      [tsxYolu(), join(process.cwd(), "src", "ui", "cli.ts"), ...args],
      { cwd: root, ...(options.env === undefined ? {} : { env: options.env }) },
    );
    let cikti = "";
    let settled = false;
    const zamanAsimi = setTimeout(() => {
      if (settled) return;
      settled = true;
      killTree(child.pid);
      reject(new Error(`ekran açılmadı (20s), çıktı:\n${cikti}`));
    }, 20_000);
    const bak = (chunk: Buffer): void => {
      cikti += chunk.toString();
      const m = /ekran açık: (http:\S+)/.exec(cikti);
      if (m === null || settled) return;
      settled = true;
      clearTimeout(zamanAsimi);
      const url = m[1] as string;
      resolve({
        port: Number(new URL(url).port),
        url,
        // CANLI: dışarıdan her çağrıda o anki `cikti`'yi okur — "ekran açık"
        // satırından SONRA gelen (ör. tarayıcı uyarısı gibi) çıktıyı da
        // yakalayabilmek için bir anlık kopya yetmiyordu.
        metni: () => cikti,
        durdur: () =>
          new Promise<void>((res) => {
            child.on("close", () => res());
            killTree(child.pid);
          }),
      });
    };
    child.stdout.on("data", bak);
    child.stderr.on("data", bak);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(zamanAsimi);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(zamanAsimi);
      reject(new Error(`ekran erken çıktı (kod ${code}), çıktı:\n${cikti}`));
    });
  });
}

describe("ui cli — port hafızası (gerçek süreç)", () => {
  /**
   * `PATH=""` ile çocuk sürece açacak komutu BULUNAMAZ hâle getiriyoruz —
   * ortamda `xdg-open`/`open` kurulu olsun ya da olmasın, tarayıcı açma
   * denemesi DETERMİNİSTİK başarısız olur ve testler gerçek bir pencere
   * açmaz.
   */
  const KOMUTSUZ_ORTAM = { ...process.env, PATH: "" };

  it("--port verilen açılış o portta açılır ve hatırlanan hâle gelir", async () => {
    const e = await ekraniBaslat(["test", "--tarayici-yok", "--port", "18391"]);
    try {
      expect(e.port).toBe(18391);
      const kayit = JSON.parse(
        await readFile(join(root, ".skein", "ekran.json"), "utf8"),
      ) as { port: number };
      expect(kayit.port).toBe(18391);
    } finally {
      await e.durdur();
    }
  });

  it("--port vermeden ikinci açılış ÖNCEKİ hatırlanan portu kullanır", async () => {
    const e1 = await ekraniBaslat(["test", "--tarayici-yok", "--port", "18392"]);
    await e1.durdur();

    const e2 = await ekraniBaslat(["test", "--tarayici-yok"]);
    try {
      expect(e2.port).toBe(18392);
    } finally {
      await e2.durdur();
    }
  });

  it("--port AÇIK isteği hatırlanan kaydı EZER", async () => {
    const e1 = await ekraniBaslat(["test", "--tarayici-yok", "--port", "18393"]);
    await e1.durdur();

    const e2 = await ekraniBaslat(["test", "--tarayici-yok", "--port", "18394"]);
    try {
      expect(e2.port).toBe(18394);
      const kayit = JSON.parse(
        await readFile(join(root, ".skein", "ekran.json"), "utf8"),
      ) as { port: number };
      // Ezilen kayıt artık İKİNCİ (açık) isteği taşıyor, birinciyi değil.
      expect(kayit.port).toBe(18394);
    } finally {
      await e2.durdur();
    }
  });

  it("argümansız çağrı (GERÇEK `npm start` senaryosu) ekranı AÇAR, USAGE basmayıp çıkmaz", async () => {
    // `npm start` (package.json) hiçbir ek argüman geçirmiyor — yani
    // `process.argv.slice(2)` burada da tam olarak `[]` olmalı. Bu dal
    // eskiden (reddedilen turda) `argv.length === 0` özel durumuna düşüp
    // yalnızca USAGE basıp 0 ile çıkıyordu; ekran HİÇ AÇILMIYORDU. Akış adı
    // da VERİLMİYOR: `hub/flows` altındaki tek akış (`test`) varsayılan
    // olarak seçilmeli.
    const e = await ekraniBaslat([], { env: KOMUTSUZ_ORTAM });
    try {
      expect(e.port).toBeGreaterThan(0);
      expect(e.metni()).not.toContain("Kullanım:");
    } finally {
      await e.durdur();
    }
  });

  it("`--help` kullanım metnini basar ve ekranı AÇMADAN 0 ile çıkar", async () => {
    const child = spawnPortable(
      process.execPath,
      [tsxYolu(), join(process.cwd(), "src", "ui", "cli.ts"), "--help"],
      { cwd: root },
    );
    let cikti = "";
    child.stdout.on("data", (chunk: Buffer) => {
      cikti += chunk.toString();
    });
    const kod = await new Promise<number | null>((res) => {
      child.on("close", (code) => res(code));
    });
    expect(kod).toBe(0);
    expect(cikti).toContain("Kullanım:");
    expect(cikti).not.toContain("ekran açık");
  });

  it("bozuk `.skein/ekran.json` açılışı ENGELLEMİYOR", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), "{ bu json degil", "utf8");
    const e = await ekraniBaslat(["test", "--tarayici-yok"]);
    try {
      expect(e.port).toBeGreaterThan(0);
    } finally {
      await e.durdur();
    }
  });

  // `KOMUTSUZ_ORTAM` yukarıda tanımlı (`describe` kapsamı) — açacak komutu
  // BULUNAMAZ hâle getirip tarayıcı açma denemesini DETERMİNİSTİK başarısız
  // kılıyor. Sahte bir spawn enjekte etmiyoruz: `tarayiciyiAc` birim
  // sınamasında (`open-browser.test.ts`) o yapıldı, burada asıl soru
  // `cli.ts`'in gerçek hatayı GERÇEKTEN yutup yutmadığı.
  it("tarayıcı açma başarısız olsa da ekran çalışır durumda kalır", async () => {
    // `--tarayici-yok` KASITLI verilmiyor: gerçek açma yolu koşuyor.
    const e = await ekraniBaslat(["test", "--port", "18395"], { env: KOMUTSUZ_ORTAM });
    try {
      const cevap = await fetch(`${e.url}durum`);
      expect(cevap.status).toBe(200);
      // Hata yutulmuyor da — bir satır basılıyor, ekran yine çalışıyor.
      await new Promise((r) => setTimeout(r, 1_000));
      expect(e.metni()).toContain("tarayıcı açılamadı");
    } finally {
      await e.durdur();
    }
  });

  it("--tarayici-yok verilince açma denemesi hiç yapılmıyor, uyarı basılmıyor", async () => {
    const e = await ekraniBaslat(["test", "--tarayici-yok", "--port", "18396"], {
      env: KOMUTSUZ_ORTAM,
    });
    try {
      // Yukarıdaki sınama AYNI komutsuz ortamda 1 saniye içinde uyarıyı
      // bastırıyor — burada bastırmaması, denemenin hiç yapılmadığının
      // kanıtı (`--tarayici-yok` bayrağı olmasaydı aynı ortam aynı uyarıyı
      // üretirdi).
      await new Promise((r) => setTimeout(r, 1_000));
      expect(e.metni()).not.toContain("tarayıcı açılamadı");
    } finally {
      await e.durdur();
    }
  });
}, 60_000);
