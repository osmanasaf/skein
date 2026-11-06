import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { killTree, spawnPortable, tsxCliPath } from "../proc/process.js";

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

interface RunningScreen {
  port: number;
  url: string;
  /** O ana kadar biriken stdout+stderr — CANLI: her çağrıda güncel hâlini verir. */
  textOf: () => string;
  stop: () => Promise<void>;
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
 * başlatma koduyla (`ui/cli.ts`'in `komut` dizisi, `../proc/process.js`'teki
 * `tsxCliYolu`) aynı desen.
 *
 * Fark burada ÖNEMLİ: bir sınama `PATH`i boşaltarak çocuğun İÇİNDEKİ
 * `xdg-open` aramasını deterministik olarak başarısız kılmak istiyor.
 * `npx` KENDİSİ PATH'te bir ad olduğu için `PATH=""` ile dışarıdan hiç
 * BULUNAMAZDI — mutlak yola gidince dış süreç PATH'e bağımlı olmuyor, yalnız
 * `cli.ts`'in İÇİNDE arandığı `xdg-open` bağımlı kalıyor.
 *
 * ÖNCEKİ tur burada `join(process.cwd(), "node_modules", "tsx", ...)` diye
 * ELLE birleştiriyordu — bu, orkestratörün rolleri çalıştırdığı asıl ortamda
 * (`git worktree add` ile açılan bir çalışma ağacı, KENDİ `node_modules`'ü
 * YOK) "modül yok" diye patlıyordu ve reviewer'ı bu turu geri göndermeye
 * götürdü. `tsxCliYolu` Node'un kendi modül çözümlemesiyle ÜST dizinlere
 * doğru arıyor, tam `npx tsx` gibi — ama `npx`i PATH üzerinden ÇAĞIRMADAN
 * (yukarıdaki `PATH=""` ihtiyacıyla çakışmadan).
 */
function tsxPath(): string {
  return tsxCliPath(process.cwd());
}

function startScreen(
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<RunningScreen> {
  return new Promise((resolve, reject) => {
    const child = spawnPortable(
      process.execPath,
      [tsxPath(), join(process.cwd(), "src", "ui", "cli.ts"), ...args],
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
    const inspect = (chunk: Buffer): void => {
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
        textOf: () => cikti,
        stop: () =>
          new Promise<void>((res) => {
            child.on("close", () => res());
            killTree(child.pid);
          }),
      });
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
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
  const NO_COMMAND_ENV = { ...process.env, PATH: "" };

  it("--port verilen açılış o portta açılır ve hatırlanan hâle gelir", async () => {
    const e = await startScreen(["test", "--tarayici-yok", "--port", "18391"]);
    try {
      expect(e.port).toBe(18391);
      const record = JSON.parse(
        await readFile(join(root, ".skein", "ekran.json"), "utf8"),
      ) as { port: number };
      expect(record.port).toBe(18391);
    } finally {
      await e.stop();
    }
  });

  it("--port vermeden ikinci açılış ÖNCEKİ hatırlanan portu kullanır", async () => {
    const e1 = await startScreen(["test", "--tarayici-yok", "--port", "18392"]);
    await e1.stop();

    const e2 = await startScreen(["test", "--tarayici-yok"]);
    try {
      expect(e2.port).toBe(18392);
    } finally {
      await e2.stop();
    }
  });

  it("--port AÇIK isteği hatırlanan kaydı EZER", async () => {
    const e1 = await startScreen(["test", "--tarayici-yok", "--port", "18393"]);
    await e1.stop();

    const e2 = await startScreen(["test", "--tarayici-yok", "--port", "18394"]);
    try {
      expect(e2.port).toBe(18394);
      const record = JSON.parse(
        await readFile(join(root, ".skein", "ekran.json"), "utf8"),
      ) as { port: number };
      // Ezilen kayıt artık İKİNCİ (açık) isteği taşıyor, birinciyi değil.
      expect(record.port).toBe(18394);
    } finally {
      await e2.stop();
    }
  });

  it("argümansız çağrı (GERÇEK `npm start` senaryosu) ekranı AÇAR, USAGE basmayıp çıkmaz", async () => {
    // `npm start` (package.json) hiçbir ek argüman geçirmiyor — yani
    // `process.argv.slice(2)` burada da tam olarak `[]` olmalı. Bu dal
    // eskiden (reddedilen turda) `argv.length === 0` özel durumuna düşüp
    // yalnızca USAGE basıp 0 ile çıkıyordu; ekran HİÇ AÇILMIYORDU. Akış adı
    // da VERİLMİYOR: `hub/flows` altındaki tek akış (`test`) varsayılan
    // olarak seçilmeli.
    const e = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(e.port).toBeGreaterThan(0);
      expect(e.textOf()).not.toContain("Kullanım:");
    } finally {
      await e.stop();
    }
  });

  it("`--help` kullanım metnini basar ve ekranı AÇMADAN 0 ile çıkar", async () => {
    const child = spawnPortable(
      process.execPath,
      [tsxPath(), join(process.cwd(), "src", "ui", "cli.ts"), "--help"],
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

  /**
   * TANIMADIĞIN BAYRAĞI SESSİZCE YUTMA.
   *
   * Gerçekte şöyle patladı: ekranı `--timeout 50` ile açtım ve 50
   * dakikalık bir koşu başlattığımı sandım. Bayrak ekran CLI'ının
   * listesinde yoktu, hiçbir yere kaydedilmeden düştü, ve turlar yine
   * 20 dakikada kesilecekti. İkinci tuzak: bayrak yutulunca DEĞERİ de
   * ("50") ortada kalıyor ve akış adı sanılabiliyor.
   */
  it("bilinmeyen bayrak ekranı AÇMAZ, 1 ile çıkar ve hangisi olduğunu söyler", async () => {
    const child = spawnPortable(
      process.execPath,
      [tsxPath(), join(process.cwd(), "src", "ui", "cli.ts"), "test", "--zamanasimi", "50"],
      { cwd: root },
    );
    let cikti = "";
    child.stdout.on("data", (c: Buffer) => { cikti += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { cikti += c.toString(); });
    const kod = await new Promise<number | null>((res) => child.on("close", res));

    expect(kod).toBe(1);
    expect(cikti).toContain("--zamanasimi");
    expect(cikti).not.toContain("ekran açık");
  });

  // `--timeout` gözcünün bayrağı; ekran onu YORUMLAMIYOR, taşıyor. Taşıma
  // listesinde olmadığı sürece sessizce düşüyordu — yukarıdaki sınama
  // artık bilinmeyeni yakalıyor, bu sınama da TANINDIĞINI yakalıyor.
  // İkisi birden olmazsa bayrağı listeden çıkaran mutasyon ayakta kalır.
  it("`--timeout` GÖZCÜ bayrağı sayılıyor — bilinmeyen muamelesi görmüyor", async () => {
    // `--timeout` tek başına verilince ekran "gözcü bayrağı var ama
    // --model yok" diye reddediyor. İDDİA tam bu ayrımda: red sebebi
    // "bilinmeyen bayrak" OLMAMALI. Böylece hem tanındığını hem gözcüye
    // taşınanlar arasında sayıldığını, gerçek bir gözcü komutu
    // çözümlemeye gerek kalmadan pinliyoruz.
    const child = spawnPortable(
      process.execPath,
      [tsxPath(), join(process.cwd(), "src", "ui", "cli.ts"), "test", "--timeout", "45"],
      { cwd: root },
    );
    let cikti = "";
    child.stdout.on("data", (c: Buffer) => { cikti += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { cikti += c.toString(); });
    const kod = await new Promise<number | null>((res) => child.on("close", res));

    expect(kod).toBe(1);
    expect(cikti).toContain("--model");
    expect(cikti).not.toContain("bilinmeyen bayrak");
  });

  it("bozuk `.skein/ekran.json` açılışı ENGELLEMİYOR", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), "{ bu json degil", "utf8");
    const e = await startScreen(["test", "--tarayici-yok"]);
    try {
      expect(e.port).toBeGreaterThan(0);
    } finally {
      await e.stop();
    }
  });

  // `KOMUTSUZ_ORTAM` yukarıda tanımlı (`describe` kapsamı) — açacak komutu
  // BULUNAMAZ hâle getirip tarayıcı açma denemesini DETERMİNİSTİK başarısız
  // kılıyor. Sahte bir spawn enjekte etmiyoruz: `tarayiciyiAc` birim
  // sınamasında (`open-browser.test.ts`) o yapıldı, burada asıl soru
  // `cli.ts`'in gerçek hatayı GERÇEKTEN yutup yutmadığı.
  it("tarayıcı açma başarısız olsa da ekran çalışır durumda kalır", async () => {
    // `--tarayici-yok` KASITLI verilmiyor: gerçek açma yolu koşuyor.
    const e = await startScreen(["test", "--port", "18395"], { env: NO_COMMAND_ENV });
    try {
      const answer = await fetch(`${e.url}durum`);
      expect(answer.status).toBe(200);
      // Hata yutulmuyor da — bir satır basılıyor, ekran yine çalışıyor.
      await new Promise((r) => setTimeout(r, 1_000));
      expect(e.textOf()).toContain("tarayıcı açılamadı");
    } finally {
      await e.stop();
    }
  });

  it("--tarayici-yok verilince açma denemesi hiç yapılmıyor, uyarı basılmıyor", async () => {
    const e = await startScreen(["test", "--tarayici-yok", "--port", "18396"], {
      env: NO_COMMAND_ENV,
    });
    try {
      // Yukarıdaki sınama AYNI komutsuz ortamda 1 saniye içinde uyarıyı
      // bastırıyor — burada bastırmaması, denemenin hiç yapılmadığının
      // kanıtı (`--tarayici-yok` bayrağı olmasaydı aynı ortam aynı uyarıyı
      // üretirdi).
      await new Promise((r) => setTimeout(r, 1_000));
      expect(e.textOf()).not.toContain("tarayıcı açılamadı");
    } finally {
      await e.stop();
    }
  });
}, 60_000);

/**
 * VARSAYILAN AKIŞ SEÇİMİ — gerçek süreç.
 *
 * `npm start` akış adı verilmeden çalıştırılınca `hub/flows/` altındaki ADA
 * GÖRE İLK akış açılıyordu — "ada göre ilk" bir varsayılan değil, bir kaza.
 * Kart şu önceliği istiyor: komut satırı argümanı > SON AÇILAN akış
 * (`.skein/ekran.json`) > `gunluk-tek` > ada göre ilk (son çare). Her adım
 * KENDİSİ YOKSA ya da BOZUKSA (geçersiz YAML, kural ihlali) engel olmuyor,
 * sıradaki adıma düşülüyor.
 *
 * Birim sınamaları yok: seçim mantığı (`varsayilanAkisAdi`) `cli.ts`'in
 * modül düzeyinde kendini çağırdığı için import edilemiyor (dosyanın
 * başındaki not) — bu yüzden her karar noktası GERÇEK bir süreç açıp
 * `GET /durum`un döndürdüğü `flow.name`e bakarak sınanıyor.
 */
describe("ui cli — varsayılan akış seçimi (gerçek süreç)", () => {
  const NO_COMMAND_ENV = { ...process.env, PATH: "" };

  /** Tek rollü, geçerli bir akış dosyası metni — ad ve rol id'si parametreli. */
  function flowYaml(ad: string, rol: string): string {
    return `
name: ${ad}
constitution:
  - ../prompts/base.md
roles:
  - id: ${rol}
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;
  }

  async function createFlow(ad: string, rol: string): Promise<void> {
    await writeFile(join(root, "hub", "flows", `${ad}.yaml`), flowYaml(ad, rol));
  }

  async function writeRemembered(ad: string): Promise<void> {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(join(root, ".skein", "ekran.json"), JSON.stringify({ akis: ad }), "utf8");
  }

  async function activeFlowName(e: RunningScreen): Promise<string> {
    const model = (await (await fetch(`${e.url}durum`)).json()) as { flow: { name: string } };
    return model.flow.name;
  }

  // Sayfaya gömülü yazma jetonunu GERÇEK bir HTTP yanıtından çıkarıyoruz —
  // bu sınama gerçek bir süreçle konuşuyor, `serveUi`nin döndürdüğü
  // `token`a doğrudan erişimi yok (bkz. `server.test.ts`'teki o erişim).
  async function takeToken(url: string): Promise<string> {
    const html = await (await fetch(url)).text();
    const m = /const JETON = "([^"]+)"/.exec(html);
    if (m === null) throw new Error("sayfada jeton bulunamadı");
    return m[1] as string;
  }

  // `beforeEach` zaten `test.yaml` (rol: coder) yaratıyor; alfabetik sırada
  // kasıtlı olarak ARADA bir yere düşüyor, bazı sınamalarda devre dışı
  // bırakmamak için kullanılmıyor, sadece orada duruyor.

  it("hafıza boşken ve gunluk-tek alfabetik İLK olmasa da gunluk-tek açılır", async () => {
    // "aaa" alfabetik olarak gunluk-tek'ten ÖNCE — "ada göre ilk" kuralı
    // yanlışlıkla hâlâ birincil olsaydı bu sınama "aaa" görürdü.
    await createFlow("aaa", "aaarol");
    await createFlow("gunluk-tek", "guntol");
    const e = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(await activeFlowName(e)).toBe("gunluk-tek");
    } finally {
      await e.stop();
    }
  });

  it("hatırlanan akış VARSA gunluk-tek'TEN ÖNCELİKLİ", async () => {
    await createFlow("ikinci", "ikincirol");
    await createFlow("gunluk-tek", "guntol");
    await writeRemembered("ikinci");
    const e = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(await activeFlowName(e)).toBe("ikinci");
    } finally {
      await e.stop();
    }
  });

  it("hatırlanan akış ARTIK YOKSA engel olmuyor, gunluk-tek'e düşülüyor", async () => {
    await createFlow("gunluk-tek", "guntol");
    await writeRemembered("boyle-bir-akis-yok");
    const e = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(await activeFlowName(e)).toBe("gunluk-tek");
    } finally {
      await e.stop();
    }
  });

  it("hatırlanan akış dosyası VAR AMA BOZUK, engel olmuyor, gunluk-tek'e düşülüyor", async () => {
    await writeFile(join(root, "hub", "flows", "kirik.yaml"), "{ gecerli yaml degil : : :");
    await createFlow("gunluk-tek", "guntol");
    await writeRemembered("kirik");
    const e = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(await activeFlowName(e)).toBe("gunluk-tek");
    } finally {
      await e.stop();
    }
  });

  it("hatırlanan da gunluk-tek de yoksa ADA GÖRE İLK akış açılır (son çare)", async () => {
    await createFlow("bbb", "bbbrol");
    await createFlow("aaa", "aaarol");
    // `test.yaml` de var ("test" > "bbb" > "aaa" alfabetik) — en önce "aaa".
    const e = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(await activeFlowName(e)).toBe("aaa");
    } finally {
      await e.stop();
    }
  });

  it("komut satırı argümanı hatırlananı VE gunluk-tek'i EZER", async () => {
    await createFlow("gunluk-tek", "guntol");
    await createFlow("ucuncu", "ucuncurol");
    await writeRemembered("gunluk-tek");
    const e = await startScreen(["ucuncu", "--tarayici-yok"]);
    try {
      expect(await activeFlowName(e)).toBe("ucuncu");
    } finally {
      await e.stop();
    }
  });

  it("ekrandaki seçiciden akış değiştirmek 'son açılan' hafızasını da günceller", async () => {
    await createFlow("ikinci", "ikincirol");
    const e1 = await startScreen(["test", "--tarayici-yok"]);
    try {
      const token = await takeToken(e1.url);
      const res = await fetch(`${e1.url}akis/sec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": token },
        body: JSON.stringify({ name: "ikinci" }),
      });
      expect(res.status).toBe(200);
    } finally {
      await e1.stop();
    }

    // İKİNCİ açılış argümansız — hafızada şimdi "ikinci" olmalı.
    const e2 = await startScreen([], { env: NO_COMMAND_ENV });
    try {
      expect(await activeFlowName(e2)).toBe("ikinci");
    } finally {
      await e2.stop();
    }
  });
}, 60_000);
