#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { CardQueue } from "../card/queue.js";
import { FlowError, loadFlow, type LoadOptions } from "../flow/load.js";
import { LiveFlow } from "../flow/live.js";
import { tsxCliYolu } from "../proc/process.js";
import { tarayiciyiAc } from "./open-browser.js";
import { portuHatirlayarakAc, sonAkisiOku, sonAkisiYaz } from "./port-memory.js";
import { serveUi, type CanliAkis } from "./server.js";

/** Akış argümanı verilmediğinde, hatırlanan kayıt da yoksa/bozuksa düşülecek akış. */
const GUNLUK_TEK = "gunluk-tek";

const USAGE = `Kullanım:
  npm start [-- [akış] [--port <n>]]
  npx skein [akış] [--port <n>]
  npx tsx src/ui/cli.ts [akış] [--port <n>]

Üçü de aynı ekranı açar; \`npm start\` ve \`npx skein\` bu depoda \`tsx\`
kurulumuyla ilgilenmeden çalışır.

AKIŞ VERİLMEZSE, sırayla:
  1. SON AÇILAN akış (\`.skein/ekran.json\`da hatırlanır; ekrandaki seçiciden
     akış değiştirmek de bu kaydı günceller).
  2. Hatırlanan yoksa, artık yoksa ya da bozuksa \`gunluk-tek\` — deponun
     günlük sürücüsü.
  3. O da yoksa/bozuksa, \`hub/flows/\` altındaki ilk akış (ada göre sıralı).
Hiçbiri engel değil: bir adım bozuksa (geçersiz YAML, kural ihlali)
sıradakine düşülür, ekran AÇILMAMA değil.

Ekrandaki seçiciden başka bir akışa her an geçilebilir.

Ekranı açar. KARTLARA VE OLAY GÜNLÜĞÜNE DOKUNMAZ: kartların yerini
\`.skein/\` dizininden, ne olduğunu \`.skein/olaylar.jsonl\` dosyasından,
gözcünün açık olup olmadığını \`.skein/daemon.json\` kilidinden YALNIZCA
OKUR. Tek yazdığı şey kendi penceresinin hafızası (\`.skein/ekran.json\`,
aşağıda) — ölçüme giren hiçbir kaydı üretmez ya da değiştirmez.

Açılınca bastığı adresi TARAYICIDA KENDİLİĞİNDEN açar (\`--tarayici-yok\` ile
kapatılır — uzaktan/konteyner koşumunda açacak tarayıcı yoktur). Dinlenen
port \`.skein/ekran.json\`da hatırlanır: bir sonraki açılış önce onu dener,
doluysa boş bir porta düşer. \`--port\` AÇIK bir istektir, hatırlanan portu
yok sayar ve yeni port hatırlanan kaydı ezer.

GÖZCÜYÜ EKRANDAN yönetmek için, gözcü bayraklarını ekranı açarken ver:
  npx tsx src/ui/cli.ts <akış> --model claude:<model> --allow-tool "Bash(git add:*)"

O zaman ekranda "Gözcüyü başlat / durdur" düğmesi çıkar ve TAM OLARAK bu
bayraklarla koşar. Düğme bayrak SEÇEMEZ: model ve araç listesi para
harcatan parametreler, onları ekranı açan komut belirler.

Bayrak vermezsen gözcü düğmesi çıkmaz; ayrı bir kabukta koşturursun:
  npx tsx src/watch/cli.ts <akış> --serve --model claude:<model>

Seçenekler:
  --port <n>      dinlenecek port (varsayılan: hatırlanan port, yoksa/doluysa boş port)
  --host <h>      dinlenecek arayüz (varsayılan 127.0.0.1 — yerel araç)
  --salt-okunur   akış düzenlemeyi kapat
  --tarayici-yok  tarayıcıyı kendiliğinden AÇMA (uzaktan/konteyner koşumu için)
  --help, -h      bu metni bas ve çık (ARGÜMANSIZ çağrı ekranı AÇAR, bunu basmaz)

Gözcüye geçirilen bayraklar (verilirse düğme açılır):
  --model <spec>         zorunlu, ör. claude:claude-sonnet-5
  --allow-tool <t>       birden fazla kez verilebilir
  --permission-mode <m>  varsayılan gözcünün kendi varsayılanı
  --bin <p=yol>          sağlayıcının çalıştırılabilirini değiştir
  --poll <ms>            yoklama aralığı`;

/**
 * `hub/flows/*.yaml` adları, uzantısız ve sıralı.
 *
 * Sıralı: akış argümanı verilmediğinde "ilkini aç" tekrarlanabilir olmalı
 * — her açılışta rastgele bir akışa düşmek, ekranın hangi akışı açacağını
 * tahmin edilemez kılardı.
 */
async function listFlowNames(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(join(root, "hub", "flows"));
  } catch {
    // Dizin yoksa akış yok — çağıran taraf bunu "hiç akış yok" olarak okur.
    return [];
  }
  return entries
    .filter((e) => e.endsWith(".yaml"))
    .map((e) => e.slice(0, -".yaml".length))
    .sort();
}

/**
 * Akış argümanı verilmediğinde hangi akış açılır — ÖNCELİK SIRASI:
 *
 * 1. SON AÇILAN akış (`.skein/ekran.json`, `sonAkisiOku`) — ekranı en son
 *    hangi akışla açtıysak (ya da ekrandaki seçiciden hangisine geçtiysek)
 *    onu hatırlar.
 * 2. `gunluk-tek` — deponun günlük sürücüsü (bkz. `gunluk-tek.yaml`'ın
 *    kendi yorumu).
 * 3. ADA GÖRE İLK — son çare, DEĞİŞMEYEN eski davranış.
 *
 * KISIT (kart bunu açıkça istiyor): hatırlanan akış ya da `gunluk-tek`
 * artık YOKSA ya da BOZUKSA (geçersiz YAML, kural ihlali) bu açılışı
 * ENGELLEMEZ — sıradaki kurala düşülür. `port-memory.ts`'teki "bozuk kayıt
 * kilitlemez" kuralının aynısı, burada akış seçimine uygulanmış hâli.
 *
 * Son çare DOĞRULANMIYOR: `akislar` zaten boş değil (çağıran taraf bunu
 * önce denetliyor), yani bir ad her zaman döner — o ad da bozuksa bunu
 * `LiveFlow.open` kendi hata mesajıyla bildirir, bugünkü (değişmeyen)
 * davranışın aynısı.
 */
async function varsayilanAkisAdi(
  root: string, akislar: readonly string[], loadOptions: LoadOptions,
): Promise<string> {
  const adaylar: string[] = [];
  const hatirlanan = await sonAkisiOku(root);
  if (hatirlanan !== undefined) adaylar.push(hatirlanan);
  adaylar.push(GUNLUK_TEK);

  for (const ad of adaylar) {
    // YOKSA bu adım hiç denenmiyor — "bozuk" ile "hiç yok" burada aynı
    // kapıdan geçiyor, ikisi de sıradaki kurala düşüyor.
    if (!akislar.includes(ad)) continue;
    try {
      await loadFlow(join(root, "hub", "flows", `${ad}.yaml`), loadOptions);
      return ad;
    } catch {
      // BOZUKSA sıradaki kurala düş — bu adım hiç ENGEL olmuyor.
    }
  }

  // Son çare: ada göre ilk, DOĞRULANMADAN — bugünkü (eski) davranış.
  return akislar[0] as string;
}

async function main(argv: string[]): Promise<number> {
  // `--help`/`-h` AÇIK bir istektir — kullanım metnini basar ve çıkar.
  // ARGÜMANSIZ çağrı (ör. `npm start`) bununla KARIŞTIRILMAZ: akış artık
  // zorunlu değil, verilmezse `hub/flows` altındaki ilk akış açılır. Eskiden
  // `argv.length === 0` de bu dala düşüyordu — bu, `npm start`ın (ek argüman
  // geçirmeyen betik) ekranı HİÇ AÇMAMASI anlamına geliyordu; kartın birinci
  // gereksinimiyle (tek komutla ekran açılsın) doğrudan çelişiyordu.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }

  let flowName: string | undefined;
  let port: number | undefined;
  let host: string | undefined;
  let saltOkunur = false;
  let tarayiciYok = false;
  // Gözcüye AYNEN geçirilecek bayraklar. Ekran onları yorumlamıyor,
  // yalnızca taşıyor: hangi modelin hangi araçlarla koşacağına karar veren
  // yer `watch/cli.ts` olmalı, ekran değil.
  const gozcuBayraklari: string[] = [];
  let modelVar = false;
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i] as string;
    if (value === "--port") port = Number(argv[++i]);
    else if (value === "--host") host = argv[++i];
    else if (value === "--salt-okunur") saltOkunur = true;
    else if (value === "--tarayici-yok") tarayiciYok = true;
    else if (
      value === "--model" || value === "--allow-tool" ||
      value === "--permission-mode" || value === "--bin" || value === "--poll"
    ) {
      const deger = argv[++i];
      if (deger === undefined) {
        console.error(`✗ ${value} bir değer istiyor`);
        return 1;
      }
      if (value === "--model") modelVar = true;
      gozcuBayraklari.push(value, deger);
    } else if (!value.startsWith("--") && flowName === undefined) flowName = value;
  }

  // `--model` olmadan gözcü koşmuyor (akış dosyası model taşımıyor), yani
  // düğme kurulsaydı her basışta aynı hatayı verirdi. Yarım kurulmuş bir
  // düğme sunmaktansa sebebini söyleyip hiç sunmamak doğru.
  if (gozcuBayraklari.length > 0 && !modelVar) {
    console.error("✗ gözcü bayrakları verildi ama --model yok; gözcü modelsiz koşamaz");
    return 1;
  }

  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    console.error("✗ --port 0-65535 arası bir tamsayı olmalı");
    return 1;
  }

  const root = resolve(process.cwd());
  const loadOptions = { root, providers: knownProviderSet() };

  // Komut satırı argümanı AÇIK bir istek: aşağıdaki öncelik sırası hiç
  // devreye girmiyor — `flowName` burada zaten tanımlıysa bu dalın tamamı
  // atlanıyor.
  if (flowName === undefined) {
    const akislar = await listFlowNames(root);
    if (akislar.length === 0) {
      console.error(`✗ hub/flows altında hiç akış yok: ${join(root, "hub", "flows")}`);
      return 1;
    }
    flowName = await varsayilanAkisAdi(root, akislar, loadOptions);
  }

  // Akış yaşayan: her okumadan önce yoklanıyor. Dosya değişirse ekran yeni
  // sütunları çiziyor; geçersizse eskisiyle çizip gerekçeyi gösteriyor.
  const live = await LiveFlow.open(join(root, "hub", "flows", `${flowName}.yaml`), loadOptions);
  const flow = live.flow;
  const topology = live.topology;

  // Gerçekten AÇILAN akış "son açılan" hâline geliyor — nasıl seçildiğine
  // bakılmadan (argüman, hatırlanan, varsayılan ya da son çare). Açılış
  // BAŞARISIZSA (yukarıdaki satır fırlatır) buraya hiç ulaşılmıyor, yani
  // bozuk bir akış hiçbir zaman "son açılan" olarak kaydedilmiyor.
  await sonAkisiYaz(root, flowName);

  const queue = new CardQueue(join(root, ".skein"));
  // `init` yalnızca eksik dizinleri yaratır — kuyruğa dokunmaz. `recover()`
  // KASITLI olarak çağrılmıyor: o yazan bir işlem ve gözcünün işi.
  await queue.init();

  // Dinlenecek port, yazılması gereken tek yerde: `serverOptions`e göre
  // `serveUi`yi KAÇ port adayıyla çağıracağına `portuHatirlayarakAc` karar
  // veriyor, bu fonksiyon yalnızca "hangi seçeneklerle" sorusuna cevap.
  const serverOptions = {
    root,
    queue,
    topology,
    flowName: flow.name,
    flowHash: flow.hash,
    live,
    // Akış seçimi SALT OKUNURLUĞA bağlı değil: başka bir akışa bakmak
    // yazmak değil, panonun hangi dosyayı okuduğunu değiştirmek. `ac`
    // başarısızsa (bozuk YAML, kural ihlali) fırlatıyor ve ekran o anda
    // baktığı akışta aynen kalıyor — `LiveFlow.open` zaten bu kuralı
    // taşıyor, burada tekrar uygulanmıyor.
    akisSecimi: {
      listele: () => listFlowNames(root),
      ac: async (ad: string): Promise<{ live: CanliAkis; flowPath: string }> => {
        const yeniYol = join(root, "hub", "flows", `${ad}.yaml`);
        const yeniLive = await LiveFlow.open(yeniYol, loadOptions);
        // Kayıt YALNIZCA açılış BAŞARILIYSA güncelleniyor — yukarıdaki satır
        // fırlasa buraya hiç ulaşılmaz. Bu, ekrandaki seçiciden akış
        // değiştirmenin "son açılan" hafızasını da güncellediği tek yer:
        // yapmazsak seçiciyle geçilen akış ekranda görünür ama bir sonraki
        // `npm start` hâlâ eski kaydı okur — "son açılan" yalan olurdu.
        await sonAkisiYaz(root, ad);
        return { live: yeniLive, flowPath: yeniYol };
      },
    },
    // Akış düzenleme açık: ekranın ürettiği dosya tam olarak bu yol.
    ...(saltOkunur
      ? {}
      : {
          flowPath: flow.path,
          loadOptions,
          providerIds: knownProviderSet().ids(),
        }),
    ...(host === undefined ? {} : { host }),
    // Gözcü düğmesi YALNIZCA bayrak verildiyse açılıyor; verilmediyse uç
    // 404 dönüyor ve ekran bugünkü hâlinde kalıyor.
    ...(gozcuBayraklari.length === 0
      ? {}
      : {
          gozcu: {
            // Akış adı BURADA YOK: ekran hangi akışa bakıyorsa gözcü onu
            // koşuyor. Yoksa ekrandan akış değiştirince düğme hâlâ
            // eskisini başlatırdı.
            komut: [
              process.execPath,
              tsxCliYolu(root),
              join(root, "src", "watch", "cli.ts"),
            ],
            bayraklar: gozcuBayraklari,
          },
        }),
  };

  // `--port` AÇIK bir istek: hatırlanan port hiç okunmuyor ve bu sonuç onu
  // EZİYOR. Verilmediyse önce hatırlanan port denenir (`.skein/ekran.json`);
  // doluysa (`EADDRINUSE`) sessizce boş bir porta düşülür — tarayıcı sekmesi
  // açılışlar arasında aynı adreste çalışmaya devam eder, ama ekranın
  // açılması o portun o anki durumuna BAĞLI olamaz.
  const server = await portuHatirlayarakAc(root, port, (p) =>
    serveUi(p === undefined ? serverOptions : { ...serverOptions, port: p }));

  console.log(`ekran açık: ${server.url}`);
  console.log(`akış: ${flow.name} (${flow.hash.slice(0, 12)}…) · ${topology.roles.length} rol`);
  console.log(
    saltOkunur
      ? `\nSalt okunur. Durdurmak için Ctrl-C.`
      : `\nKapı kararı ve akış düzenleme açık. Durdurmak için Ctrl-C.`,
  );
  if (gozcuBayraklari.length > 0) {
    console.log(`gözcü düğmesi AÇIK — bayraklar: ${gozcuBayraklari.join(" ")}`);
    console.log(`gözcü çıktısı: ${join(root, ".skein", "gozcu.log")}`);
  }

  // Tarayıcıyı KENDİLİĞİNDEN aç — "her şeyi önyüzden yönet" diyen bir
  // araçta başlamanın kendisi en zor adım olmamalı. Bu HİÇBİR KOŞULDA
  // ekranı düşürmez (`tarayiciyiAc` kendi içinde yutuyor); yalnızca
  // `--tarayici-yok` ile (uzaktan/konteyner koşumu) devre dışı.
  if (!tarayiciYok) tarayiciyiAc(server.url);

  const stop = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  return new Promise<number>(() => {
    /* süreç sinyale kadar açık kalır */
  });
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof FlowError) {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  },
);
