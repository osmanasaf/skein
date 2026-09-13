#!/usr/bin/env node
import { join, resolve } from "node:path";
import type { Adapter } from "../adapters/contract.js";
import { adapterFor, knownProviderSet } from "../adapters/factory.js";
import { CardQueue } from "../card/queue.js";
import { EventLog } from "../events/log.js";
import { FlowError, loadFlow } from "../flow/load.js";
import { snapshot } from "../flow/snapshot.js";
import { runUntilIdle, sweep } from "./loop.js";
import type { TickResult } from "./tick.js";
import { WorkspaceError, workspacePath } from "./workspace.js";

const USAGE = `Kullanım:
  npm run watch -- <akış> [seçenekler]

Kuyruktaki kartları rollerden geçirir. Kart .skein/ altında, kart açmak için
\`npm run card -- new <akış> "<başlık>" "<iş>"\`.

Seçenekler:
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
  --plan          hiçbir ajan çağırmadan ne yapılacağını yaz`;

const MARK: Record<TickResult["status"], string> = {
  idle: " ",
  accepted: "→",
  rejected: "←",
  escalated: "⏸",
};

interface Args {
  flow?: string;
  once: boolean;
  plan: boolean;
  models: string[];
  bins: string[];
  allowTools: string[];
  permissionMode?: string;
  log?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { once: false, plan: false, models: [], bins: [], allowTools: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i] as string;
    if (value === "--once") args.once = true;
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

/**
 * Sağlayıcı id'sinden adaptöre.
 *
 * Akış `provider: codex` der, model yazmaz — çünkü topoloji ile model ayrı
 * kararlar ve modelin akış dosyasına girmesi, model değiştiğinde yolda olan
 * kartların topoloji hash'ini kırardı. Model burada, koşum anında pinlenir.
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
    if (at === -1) throw new Error(`--model biçimi: sağlayıcı:model (verilen: ${spec})`);
    pinned.set(spec.slice(0, at), spec);
  }

  const binOf = new Map<string, string>();
  for (const entry of bins) {
    const at = entry.indexOf("=");
    if (at === -1) throw new Error(`--bin biçimi: sağlayıcı=yol (verilen: ${entry})`);
    binOf.set(entry.slice(0, at), entry.slice(at + 1));
  }

  const adapters = new Map<string, Adapter>();
  for (const provider of providers) {
    const bin = binOf.get(provider);
    adapters.set(
      provider,
      adapterFor(pinned.get(provider) ?? provider, {
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
        (result.summary === undefined ? "" : `  (${result.summary})`);
    case "rejected":
      return `${head} RET → ${result.card.role}\n             ${result.reason}`;
    case "escalated":
      return `${head} ⏸ insan kapısı\n             ${result.reason}`;
  }
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.flow === undefined) {
    console.log(USAGE);
    return argv.length === 0 ? 0 : 1;
  }

  const root = resolve(process.cwd());
  const flow = await loadFlow(join(root, "hub", "flows", `${args.flow}.yaml`), {
    root,
    providers: knownProviderSet(),
  });
  const topology = snapshot(flow, root);

  const queue = new CardQueue(join(root, ".skein"));
  await queue.init();

  const recovered = await queue.recover();
  if (recovered.length > 0) {
    console.log(`kurtarıldı: ${recovered.length} kart kuyruğa geri kondu\n`);
  }

  if (args.plan) {
    console.log(`akış: ${flow.name} (${flow.hash.slice(0, 12)}…)\n`);
    for (const role of topology.roles) {
      const depth = await queue.depth(role.id);
      console.log(
        `  ${role.id.padEnd(10)} ${String(depth).padStart(3)} kart  ` +
          `${role.provider.padEnd(8)} ${workspacePath(root, role.workspace)}`,
      );
    }
    console.log("\nHiçbir ajan çağrılmadı (--plan).");
    return 0;
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

  if (args.once) {
    report((await sweep(topology, options)).results);
  } else {
    await runUntilIdle(topology, {
      ...options,
      onSweep: (s, i) => {
        if (s.moved) console.log(`── geçiş ${i + 1} ──`);
        report(s.results);
      },
    });
  }

  const remaining = await queue.list();
  const open = remaining.filter((c) => c.state !== "done");
  console.log(
    `\n${remaining.length - open.length} bitti · ${open.length} açık` +
      (gated > 0 ? ` · ${gated} insan kapısında — \`npm run card -- ls\`` : ""),
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof FlowError || error instanceof WorkspaceError) {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  },
);
