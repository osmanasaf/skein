#!/usr/bin/env node
import { join, resolve } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { CardQueue } from "../card/queue.js";
import { FlowError } from "../flow/load.js";
import { LiveFlow } from "../flow/live.js";
import { serveUi } from "./server.js";

const USAGE = `Kullanım:
  npx tsx src/ui/cli.ts <akış> [--port <n>]

Ekranı açar. YALNIZCA OKUR: kartların yerini \`.skein/\` dizininden, ne
olduğunu \`.skein/olaylar.jsonl\` dosyasından, gözcünün açık olup olmadığını
\`.skein/daemon.json\` kilidinden okur. Hiçbir şey yazmaz.

GÖZCÜYÜ EKRANDAN yönetmek için, gözcü bayraklarını ekranı açarken ver:
  npx tsx src/ui/cli.ts <akış> --model claude:<model> --allow-tool "Bash(git add:*)"

O zaman ekranda "Gözcüyü başlat / durdur" düğmesi çıkar ve TAM OLARAK bu
bayraklarla koşar. Düğme bayrak SEÇEMEZ: model ve araç listesi para
harcatan parametreler, onları ekranı açan komut belirler.

Bayrak vermezsen gözcü düğmesi çıkmaz; ayrı bir kabukta koşturursun:
  npx tsx src/watch/cli.ts <akış> --serve --model claude:<model>

Seçenekler:
  --port <n>   dinlenecek port (varsayılan: boş bir port seçilir)
  --host <h>   dinlenecek arayüz (varsayılan 127.0.0.1 — yerel araç)
  --salt-okunur  akış düzenlemeyi kapat

Gözcüye geçirilen bayraklar (verilirse düğme açılır):
  --model <spec>         zorunlu, ör. claude:claude-sonnet-5
  --allow-tool <t>       birden fazla kez verilebilir
  --permission-mode <m>  varsayılan gözcünün kendi varsayılanı
  --bin <p=yol>          sağlayıcının çalıştırılabilirini değiştir
  --poll <ms>            yoklama aralığı`;

async function main(argv: string[]): Promise<number> {
  let flowName: string | undefined;
  let port: number | undefined;
  let host: string | undefined;
  let saltOkunur = false;
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

  if (flowName === undefined) {
    console.log(USAGE);
    return argv.length === 0 ? 0 : 1;
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    console.error("✗ --port 0-65535 arası bir tamsayı olmalı");
    return 1;
  }

  const root = resolve(process.cwd());
  // Akış yaşayan: her okumadan önce yoklanıyor. Dosya değişirse ekran yeni
  // sütunları çiziyor; geçersizse eskisiyle çizip gerekçeyi gösteriyor.
  const live = await LiveFlow.open(join(root, "hub", "flows", `${flowName}.yaml`), {
    root,
    providers: knownProviderSet(),
  });
  const flow = live.flow;
  const topology = live.topology;

  const queue = new CardQueue(join(root, ".skein"));
  // `init` yalnızca eksik dizinleri yaratır — kuyruğa dokunmaz. `recover()`
  // KASITLI olarak çağrılmıyor: o yazan bir işlem ve gözcünün işi.
  await queue.init();

  const server = await serveUi({
    root,
    queue,
    topology,
    flowName: flow.name,
    flowHash: flow.hash,
    live,
    // Akış düzenleme açık: ekranın ürettiği dosya tam olarak bu yol.
    ...(saltOkunur
      ? {}
      : {
          flowPath: flow.path,
          loadOptions: { root, providers: knownProviderSet() },
          providerIds: knownProviderSet().ids(),
        }),
    ...(port === undefined ? {} : { port }),
    ...(host === undefined ? {} : { host }),
    // Gözcü düğmesi YALNIZCA bayrak verildiyse açılıyor; verilmediyse uç
    // 404 dönüyor ve ekran bugünkü hâlinde kalıyor.
    ...(gozcuBayraklari.length === 0
      ? {}
      : {
          gozcu: {
            argv: [
              process.execPath,
              join(root, "node_modules", "tsx", "dist", "cli.mjs"),
              join(root, "src", "watch", "cli.ts"),
              flowName,
              "--serve",
              ...gozcuBayraklari,
            ],
          },
        }),
  });

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
