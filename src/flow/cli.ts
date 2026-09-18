#!/usr/bin/env node
import { resolve } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { AUDIT_IMPLEMENTED, estimateCost } from "./cost.js";
import { DONE, FlowError, loadFlow, type Flow } from "./load.js";

const USAGE = `Kullanım:
  npm run flow -- check <akış.yaml>    akışı doğrular ve topolojiyi yazar

Doğrulama SCHEMA.md'deki 16 kuralı uygular. İhlalde çıkış kodu 1.`;

/** Sütunları hizalamak için; topoloji göz taramasıyla okunabilmeli. */
function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function printFlow(flow: Flow, root: string): void {
  const rel = (p: string) => resolve(p).slice(root.length + 1) || p;

  console.log(`akış:  ${flow.name}   (${rel(flow.path)})`);
  if (flow.description !== undefined) console.log(`       ${flow.description}`);
  console.log(`hash:  ${flow.hash.slice(0, 12)}…   ← koşan kartlar bu damgayı taşır`);
  console.log("");

  const idW = Math.max(...flow.roles.map((r) => r.id.length), 4);
  const provW = Math.max(...flow.roles.map((r) => r.provider.length), 8);
  const wsW = Math.max(...flow.roles.map((r) => r.workspace.length), 9);

  console.log(`zincir (${flow.roles.length} rol):`);
  for (const [i, role] of flow.roles.entries()) {
    const next = role.next === DONE ? "· done" : `→ ${role.next}`;
    console.log(
      `  ${i + 1}. ${pad(role.id, idW)}  ${pad(role.provider, provW)}  ` +
        `${pad(role.workspace, wsW)}  ${pad(role.receive, 5)}  ${next}`,
    );
    if (role.syncBack.length > 0) {
      console.log(`     ${" ".repeat(idW)}  syncBack → ${role.syncBack.join(", ")}  (kopya)`);
    }
    if (role.reject !== null) {
      const source = role.rejectExplicit ? "" : "  ← varsayılan (gönderen)";
      console.log(`     ${" ".repeat(idW)}  reject   → ${role.reject}${source}  (KART döner)`);
    }
  }
  console.log("");

  console.log(`anayasa (${flow.constitution.length} katman, sıra anlamlı):`);
  for (const path of flow.constitution) console.log(`  ${rel(path)}`);
  console.log("");

  if (flow.gates.length === 0) {
    console.log("kapı:  yok");
  } else {
    console.log("kapı:");
    for (const gate of flow.gates) console.log(`  ${gate.after} sonrası — ${gate.type}`);
  }
  console.log(`ret:   limit ${flow.reject.limit}, dolunca ${flow.reject.onExhausted} (insan kapısı)`);
  console.log(
    // "açık" yazıp hiçbir şey yapmamak sessiz bir yalandı: kullanıcı kapıyı
    // kurduğunu sanıyor, maliyet tahmini şişiyor, gözcü hiçbir şey
    // değiştirmiyor. Uygulanmadığı SÖYLENİYOR.
    `audit: ${flow.audit.enabled ? "açık" : "KAPALI"} — parmak izi: ${flow.audit.fingerprint.join(", ")}` +
      (flow.audit.enabled && !AUDIT_IMPLEMENTED
        ? "\n       ⚠ gözcü bu kapıyı HENÜZ UYGULAMIYOR — yalnızca bench'te var"
        : ""),
  );
  if (flow.plan !== undefined) {
    console.log(
      `plan:  ${flow.plan.katilimcilar.join(", ")} yazar → ${flow.plan.plan}` +
        "\n       (6a: alışveriş yok, ayrı aktivasyon yok — planı zincirin rolü yazıyor)",
    );
  }
  console.log("");

  const cost = estimateCost(flow);
  console.log(`maliyet: ~${cost.base} aktivasyon/kart (retsiz)`);
  console.log(`         ~${cost.worst} en kötü — her kenar limitine kadar tetiklenirse`);
  for (const edge of cost.rejectEdges) {
    console.log(`           ${edge.from} → ${edge.to}: kenar başına ${edge.segment}`);
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, target] = argv;
  if (command !== "check" || target === undefined) {
    console.log(USAGE);
    return command === undefined ? 0 : 1;
  }

  const root = process.cwd();
  try {
    const flow = await loadFlow(resolve(target), { root, providers: knownProviderSet() });
    printFlow(flow, root);
    console.log("\n✓ geçerli");
    return 0;
  } catch (error) {
    if (error instanceof FlowError) {
      console.error(`✗ ${error.message}`);
      console.error("\nKural numaraları hub/flows/SCHEMA.md'de.");
      return 1;
    }
    throw error;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
