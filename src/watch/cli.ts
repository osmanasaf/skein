#!/usr/bin/env node
import { join, resolve } from "node:path";
import type { Adapter } from "../adapters/contract.js";
import { adapterFor, knownProviderSet } from "../adapters/factory.js";
import { CardQueue } from "../card/queue.js";
import { EventLog } from "../events/log.js";
import { FlowError, loadFlow } from "../flow/load.js";
import { LiveFlow } from "../flow/live.js";
import { acquireLock, releaseLock, type LockInfo } from "./lock.js";
import { runUntilIdle, sweep } from "./loop.js";
import type { TickOptions } from "./tick.js";
import type { SweepResult } from "./loop.js";
import { serve } from "./serve.js";
import type { TickResult } from "./tick.js";
import { resolveWorkspace, WorkspaceError, workspacePath } from "./workspace.js";

const USAGE = `Kullanım:
  npx tsx src/watch/cli.ts <akış> [seçenekler]

Kuyruktaki kartları rollerden geçirir. Önce kart açman gerekir:
  npx tsx src/card/cli.ts new <akış> "<başlık>" "<iş>"

\`npm run watch -- <akış> --bayrak\` de çalışır, AMA bazı npm sürümleri
\`--\` sonrasındaki bayrakları kendi seçeneği sanıp yutuyor. Bayrak
veriyorsan yukarıdaki doğrudan biçimi kullan.

Seçenekler:
  --serve         kuyruk boşalınca ÇIKMA, bekle — kart açıldığında kendisi
                  uyanır; durdurmak için Ctrl-C
  --poll <ms>     beklerken yoklama aralığı (varsayılan 1000)
  --once          tek geçiş yap, dur (varsayılan: kart kalmayana kadar)
  --model <spec>  bir sağlayıcının modelini pinle, örn. --model codex:gpt-5.5
                  (birden fazla kez verilebilir)
  --bin <p=yol>   sağlayıcının çalıştırılabilirini değiştir, örn.
                  --bin codex=/opt/codex/bin/codex
  --permission-mode <m>  sağlayıcıya iletilecek izin modu (varsayılan
                  bypassPermissions; root altında acceptEdits gerekir)
  --allow-tool <t>  açıkça izin verilen araç, ör. --allow-tool "Bash(git:*)"
                  (birden fazla kez verilebilir)
  --log <yol>     olay günlüğü dosyası (varsayılan: .skein/olaylar.jsonl)
  --plan          hiçbir ajan çağırmadan ne yapılacağını yaz

Her sağlayıcı için \`--model\` zorunludur; akış dosyası model taşımaz.`;

const MARK: Record<TickResult["status"], string> = {
  idle: " ",
  accepted: "→",
  rejected: "←",
  escalated: "⏸",
};

interface Args {
  flow?: string;
  once: boolean;
  serve: boolean;
  pollMs?: number;
  plan: boolean;
  models: string[];
  bins: string[];
  allowTools: string[];
  permissionMode?: string;
  log?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { once: false, serve: false, plan: false, models: [], bins: [], allowTools: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i] as string;
    if (value === "--once") args.once = true;
    else if (value === "--serve") args.serve = true;
    else if (value === "--poll") {
      const ms = Number(argv[++i]);
      if (!Number.isFinite(ms) || ms <= 0) throw new ConfigError(`--poll pozitif bir sayı olmalı (verilen: ${String(argv[i])})`);
      args.pollMs = ms;
    }
    else if (value === "--plan") args.plan = true;
    else if (value === "--model") args.models.push(argv[++i] as string);
    else if (value === "--bin") args.bins.push(argv[++i] as string);
    else if (value === "--allow-tool") args.allowTools.push(argv[++i] as string);
    else if (value === "--permission-mode") {
      const mode = argv[++i];
      if (mode !== undefined) args.permissionMode = mode;
    }
    else if (value === "--log") {
      const path = argv[++i];
      if (path !== undefined) args.log = path;
    }
    else if (!value.startsWith("--") && args.flow === undefined) args.flow = value;
  }
  return args;
}

/** Kullanıcının düzeltebileceği yapılandırma hatası — yığın izi gösterilmez. */
class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Örnek model kimlikleri; eksik pin hatasında kullanıcıya gösterilir. */
const MODEL_HINT: Record<string, string> = {
  claude: "claude-opus-5",
  codex: "gpt-5.5",
};

/**
 * Sağlayıcı id'sinden adaptöre.
 *
 * Akış `provider: codex` der, model YAZMAZ — topoloji ile model ayrı
 * kararlar ve modelin akış dosyasına girmesi, model değiştiğinde yolda olan
 * kartların topoloji hash'ini kırardı. Model koşum anında pinlenir.
 *
 * Bu yüzden her sağlayıcı için `--model` ZORUNLU. Eskiden pin yoksa
 * sağlayıcı adı model diye geçiliyordu: `claude` sağlayıcısı için modele
 * `"claude"` gidiyor ve CLI `unrecognized_model` ile ölüyordu — ajan
 * çağrıldıktan, yani para harcandıktan sonra. Pin yokluğu artık koşu
 * başlamadan yakalanır.
 */
function buildAdapters(
  providers: string[],
  pins: string[],
  bins: string[],
  extra: { permissionMode?: string; allowedTools?: string[] },
): Map<string, Adapter> {
  const pinned = new Map<string, string>();
  for (const spec of pins) {
    const at = spec.indexOf(":");
    if (at === -1) {
      throw new ConfigError(`--model biçimi: sağlayıcı:model (verilen: ${spec})`);
    }
    pinned.set(spec.slice(0, at), spec);
  }

  const missing = providers.filter((p) => !pinned.has(p));
  if (missing.length > 0) {
    const example = providers
      .map((p) => `--model ${p}:${pinned.get(p)?.split(":")[1] ?? MODEL_HINT[p] ?? "<model>"}`)
      .join(" ");
    throw new ConfigError(
      `Şu sağlayıcı(lar) için model pinlenmedi: ${missing.join(", ")}.\n\n` +
        `  Model akış dosyasına yazılmaz — topoloji ile model ayrı kararlar ve\n` +
        `  modeli akışa gömmek, model değiştiğinde yolda olan kartların\n` +
        `  topoloji hash'ini kırardı. Koşarken pinlenir:\n\n` +
        `  ${example}\n`,
    );
  }

  const binOf = new Map<string, string>();
  for (const entry of bins) {
    const at = entry.indexOf("=");
    if (at === -1) throw new ConfigError(`--bin biçimi: sağlayıcı=yol (verilen: ${entry})`);
    binOf.set(entry.slice(0, at), entry.slice(at + 1));
  }

  const adapters = new Map<string, Adapter>();
  for (const provider of providers) {
    const bin = binOf.get(provider);
    adapters.set(
      provider,
      adapterFor(pinned.get(provider) as string, {
        ...(bin === undefined ? {} : { bin }),
        ...extra,
      }),
    );
  }
  return adapters;
}

function describe(role: string, result: TickResult): string {
  const head = `${MARK[result.status]} ${role.padEnd(10)}`;
  switch (result.status) {
    case "idle":
      return `${head} —`;
    case "accepted":
      return `${head} kabul → ${result.card.state === "done" ? "bitti" : result.card.role}` +
        (result.summary === undefined ? "" : `  (${result.summary})`) +
        (result.warnings === undefined
          ? ""
          : result.warnings.map((w) => `\n             ⚠ ${w}`).join(""));
    case "rejected":
      return `${head} RET → ${result.card.role}\n             ${result.reason}`;
    case "escalated":
      return `${head} ⏸ insan kapısı\n             ${result.reason}`;
  }
}

/**
 * Uzun ömürlü gözcü.
 *
 * Toplu koşudan tek farkı ömür: aynı döngü, ama kuyruk boşalınca çıkmak
 * yerine bekliyor. Bir depo DEĞİL — durdurulduğunda `npx tsx src/watch/cli.ts`
 * kaldığı yerden devam eder.
 *
 * Kilidi çağıran tutar: kilit `recover()`'dan ÖNCE alınmak zorunda, o da
 * buradan önce koşuyor.
 */
async function runServer(
  root: string,
  live: LiveFlow,
  options: TickOptions,
  onSweep: (s: SweepResult, i: number) => void,
  pollMs?: number,
): Promise<number> {
  const stop = new AbortController();
  let asked = 0;
  const onSignal = (): void => {
    asked += 1;
    if (asked === 1) {
      // Turu yarıda kesmek, parası ödenmiş bir ajan çağrısını çöpe atmak
      // demek. İkinci sinyal acele edenler için.
      console.log("\ndurduruluyor — koşan tur bitince çıkılacak (tekrar Ctrl-C: hemen)");
      stop.abort();
      return;
    }
    console.log("\nhemen çıkılıyor; koşan ajan yarıda kalabilir");
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  console.log(`gözcü açık · pid ${process.pid} · durdurmak için Ctrl-C\n`);

  try {
    const summary = await serve(live, {
      ...options,
      signal: stop.signal,
      watchDir: join(root, ".skein", "queue"),
      ...(pollMs === undefined ? {} : { pollMs }),
      onSweep,
      onIdle: () => console.log("· kuyruk boş, bekleniyor"),
      refresh: () => live.refresh(),
      onReload: (r) => {
        if (r.kind === "reloaded") {
          console.log(
            `\n↻ akış yeniden yüklendi: ${r.from.slice(0, 12)}… → ${r.to.slice(0, 12)}…\n` +
              `  Yoldaki kartlar kendi topolojileriyle devam ediyor.\n`,
          );
        } else if (r.kind === "failed") {
          console.log(
            `\n⚠ akış dosyası şu an geçersiz, ESKİSİYLE devam ediliyor:\n  ${r.message}\n`,
          );
        }
      },
      onOrphan: (card) =>
        console.log(
          `\n⚠ \`${card.id}\` (${card.title}) \`${card.role}\` rolünde bekliyor ama bu akışta\n` +
            `  öyle bir rol yok — gözcü o kuyruğu HİÇ açmıyor. Akış dosyası değiştiyse\n` +
            `  gözcüyü yeniden başlat; rol gerçekten silindiyse kartı kapat:\n` +
            `    npx tsx src/card/cli.ts kapat ${card.id}\n`,
        ),
    });

    if (summary.stopped === "runaway") {
      console.error(
        `\n✗ kaçak döngü: kuyruk hiç boşalmadan ${summary.sweeps} geçiş yapıldı.\n` +
          `  Gözcü durduruldu. Kartların durumu için: npx tsx src/card/cli.ts ls`,
      );
      return 1;
    }
    console.log(`\ngözcü kapandı · ${summary.sweeps} geçiş · ${summary.naps} bekleme`);
    return 0;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}

/** Kilit alınamadığında kullanıcıya ne olduğunu ve ne yapacağını söyler. */
function busyMessage(holder: LockInfo, lockPath: string): string {
  const who =
    holder.mode === "serve"
      ? `Bu depoda zaten bir gözcü açık: pid ${holder.pid}, akış ${holder.flow}.`
      : `Bu depoda başka bir koşu sürüyor: pid ${holder.pid}, akış ${holder.flow}.`;
  return (
    `${who}\n\n` +
    `  Kuyruğa yazan tek süreç olmalı. İkinci koşu, birincinin ELİNDEKİ kartı\n` +
    `  çökmüş sanıp kuyruğa geri atar — ve aynı iş ikinci kez, para harcayarak\n` +
    `  yapılır.\n\n` +
    `  O süreci durdur; gerçekten yoksa kilidi sil:\n` +
    `    ${lockPath}\n`
  );
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.flow === undefined) {
    console.log(USAGE);
    return argv.length === 0 ? 0 : 1;
  }

  const root = resolve(process.cwd());
  // Akış açılışta doğrulanıyor; `--serve` ise onu yaşayan tutuyor ve her
  // geçiş arasında yeniden yokluyor.
  const live = await LiveFlow.open(join(root, "hub", "flows", `${args.flow}.yaml`), {
    root,
    providers: knownProviderSet(),
  });
  const flow = live.flow;
  const topology = live.topology;

  const queue = new CardQueue(join(root, ".skein"));
  await queue.init();

  if (args.plan) {
    console.log(`akış: ${flow.name} (${flow.hash.slice(0, 12)}…)\n`);
    for (const role of topology.roles) {
      const depth = await queue.depth(role.id);
      // `--plan` depoya DOKUNMAZ: eksik worktree'yi oluşturmaz, yalnızca
      // eksik olduğunu söyler.
      const dir = await resolveWorkspace(root, role.workspace, { create: false }).catch(
        () => `${workspacePath(root, role.workspace)}  (yok — koşarken oluşturulacak)`,
      );
      console.log(
        `  ${role.id.padEnd(10)} ${String(depth).padStart(3)} kart  ` +
          `${role.provider.padEnd(8)} ${dir}`,
      );
    }
    // Plan, koşu için gerekenleri de doğrular: eksik pini burada görmek,
    // ajan çağrıldıktan sonra görmekten ucuz.
    try {
      buildAdapters([...new Set(topology.roles.map((r) => r.provider))], args.models, [], {});
      console.log("\nHiçbir ajan çağrılmadı, depoya dokunulmadı (--plan).");
    } catch (error) {
      console.log(`\n⚠ Koşmaya hazır değil: ${(error as Error).message}`);
    }
    return 0;
  }

  // Kilit `recover()`'dan ÖNCE: kurtarma, başka bir koşunun elindeki kartı
  // kuyruğa geri atabilen tek işlem. Sıra ters olsaydı kilit, koruduğu şeyi
  // korumadan önce ihlal edilmiş olurdu.
  const lockPath = join(root, ".skein", "daemon.json");
  const lock = await acquireLock(lockPath, {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    flow: flow.name,
    hash: flow.hash,
    mode: args.serve ? "serve" : "batch",
  });
  if (lock.kind === "busy") throw new ConfigError(busyMessage(lock.holder, lockPath));
  if (lock.took !== undefined) {
    console.log(`bayat kilit devralındı (ölü pid ${lock.took.pid})\n`);
  }

  try {
    return await run(root, live, queue, args);
  } finally {
    await releaseLock(lockPath, process.pid);
  }
}

/** Kilit alındıktan sonraki asıl koşu. */
async function run(root: string, live: LiveFlow, queue: CardQueue, args: Args): Promise<number> {
  const flow = live.flow;
  const topology = live.topology;

  const recovered = await queue.recover();
  if (recovered.length > 0) {
    console.log(`kurtarıldı: ${recovered.length} kart kuyruğa geri kondu\n`);
  }

  // Başlık her koşuda yazılır, yalnızca --plan'de değil. Sessiz bir çıktı,
  // "hiçbir şey olmadı" ile "her şey yolunda" arasındaki farkı gizler.
  const depths = await Promise.all(topology.roles.map((r) => queue.depth(r.id)));
  const waiting = depths.reduce((a, b) => a + b, 0);
  const open = (await queue.list()).filter((c) => c.state !== "done");
  console.log(
    `akış: ${flow.name} (${flow.hash.slice(0, 12)}…) · ${topology.roles.length} rol · ` +
      `${waiting} kart kuyrukta, ${open.length} açık\n`,
  );

  if (open.length === 0) {
    console.log("Kuyrukta iş yok. Kart açmak için:\n");
    console.log(`  npx tsx src/card/cli.ts new ${args.flow} "Başlık" "Yapılacak iş"\n`);
    // Gözcü açıkken kart açmak, işin BAŞLAMASI demek: ikinci bir komut yok.
    console.log(args.serve ? "Gözcü bekliyor; kartı görünce kendisi başlar." : "Sonra bu komutu tekrar çalıştır.");
    if (!args.serve) return 0;
  }

  const adapters = buildAdapters(
    [...new Set(topology.roles.map((r) => r.provider))],
    args.models,
    args.bins,
    {
      ...(args.permissionMode === undefined ? {} : { permissionMode: args.permissionMode }),
      ...(args.allowTools.length === 0 ? {} : { allowedTools: args.allowTools }),
    },
  );
  const log = new EventLog(args.log ?? join(root, ".skein", "olaylar.jsonl"), `kosu-${Date.now()}`);
  const options = { root, queue, adapters, log };

  let gated = 0;
  const report = (results: { role: string; result: TickResult }[]): void => {
    for (const { role, result } of results) {
      if (result.status === "idle") continue;
      if (result.status === "escalated") gated += 1;
      console.log(describe(role, result));
    }
  };

  const onSweep = (s: SweepResult, i: number): void => {
    if (s.moved) console.log(`── geçiş ${i + 1} ──`);
    report(s.results);
  };

  if (args.serve) return runServer(root, live, options, onSweep, args.pollMs);

  if (args.once) {
    report((await sweep(topology, options)).results);
  } else {
    await runUntilIdle(topology, { ...options, onSweep });
  }

  const remaining = await queue.list();
  const left = remaining.filter((c) => c.state !== "done");
  console.log(
    `\n${remaining.length - left.length} bitti · ${left.length} açık` +
      (gated > 0 ? ` · ${gated} insan kapısında — \`npx tsx src/card/cli.ts ls\`` : ""),
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof FlowError || error instanceof WorkspaceError || error instanceof ConfigError) {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  },
);
