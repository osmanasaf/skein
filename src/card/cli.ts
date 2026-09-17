#!/usr/bin/env node
import { join, resolve } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { loadFlow } from "../flow/load.js";
import { snapshot } from "../flow/snapshot.js";
import { newCard, type Card } from "./card.js";
import { CardQueue, QueueError, type ReleaseDecision } from "./queue.js";
import { releaseCard } from "./release.js";
import { FlowError } from "../flow/load.js";

const USAGE = `Kullanım:
  npm run card -- new <akış> <başlık> <görev metni>   yeni kart açar
  npm run card -- ls                                  tüm kartları listeler
  npm run card -- show <kart-id>                      kartın geçmişini yazar
  npm run card -- take <rol>                          kuyruğun başındaki kartı alır
  npm run card -- handoff <kart-id> [commit]          kabul: kart ileri gider
  npm run card -- reject <kart-id> <gerekçe>          ret: KART geri döner
  npm run card -- release <kart-id> [forward|back|retry]  kapıdaki kartı karara bağlar
       forward  bir sonraki role geçsin (yalnızca onay/kilit kapısında)
       back     önceki role dönsün
       retry    aynı rol baştan koşsun (kaçış kapısının varsayılanı)
  npm run card -- recover                             yarıda kalanları toplar

Kuyruk .skein/ altında. Akış adı hub/flows/<ad>.yaml'a karşılık gelir.`;

const STATE_MARK: Record<Card["state"], string> = {
  queued: "·",
  active: "▶",
  gate: "⏸",
  done: "✓",
};

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function printCard(card: Card): void {
  console.log(`${card.id}  ${card.title}`);
  console.log(`  akış:   ${card.topology.flow} (${card.topology.hash.slice(0, 12)}…)`);
  console.log(`  durum:  ${STATE_MARK[card.state]} ${card.state} @ ${card.role}`);
  const edges = Object.entries(card.rejects);
  if (edges.length > 0) {
    console.log(`  ret:    ${edges.map(([e, n]) => `${e} ×${n}`).join(", ")}`);
  }
  console.log("  geçmiş:");
  for (const entry of card.history) {
    const when = entry.at.slice(11, 19);
    switch (entry.event) {
      case "created":
        console.log(`    ${when}  açıldı → ${entry.role}`);
        break;
      case "taken":
        console.log(`    ${when}  ${entry.role} aldı`);
        break;
      case "handoff":
        console.log(
          `    ${when}  ${entry.from} kabul etti → ${entry.to}` +
            (entry.commit === undefined ? "" : `  (${entry.commit})`),
        );
        break;
      case "reject":
        console.log(`    ${when}  ${entry.from} REDDETTİ → ${entry.to}  (tur ${entry.round})`);
        console.log(`              gerekçe: ${entry.reason}`);
        break;
      case "gate":
        console.log(`    ${when}  insan kapısı @ ${entry.role}`);
        console.log(`              ${entry.reason}`);
        break;
      case "released":
        console.log(`    ${when}  insan bıraktı → ${entry.role}`);
        break;
      case "requeued":
        console.log(`    ${when}  kuyruğa geri kondu @ ${entry.role} (${entry.reason})`);
        break;
      case "done":
        console.log(`    ${when}  bitti (${entry.from})`);
        break;
    }
  }
}

async function run(argv: string[], root: string): Promise<number> {
  const queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const [command, ...rest] = argv;

  const need = async (id: string | undefined): Promise<Card> => {
    if (id === undefined) throw new QueueError("Kart id'si gerekiyor");
    const card = await queue.get(id);
    if (card === null) throw new QueueError(`Böyle bir kart yok: ${id}`);
    return card;
  };

  switch (command) {
    case "new": {
      const [flowName, title, ...taskParts] = rest;
      const task = taskParts.join(" ");
      if (flowName === undefined || title === undefined || task === "") {
        console.log(USAGE);
        return 1;
      }
      const flow = await loadFlow(join(root, "hub", "flows", `${flowName}.yaml`), {
        root,
        providers: knownProviderSet(),
      });
      const card = await queue.add(newCard({ title, task, topology: snapshot(flow, root) }));
      console.log(`✓ kart açıldı: ${card.id} → ${card.role} kuyruğunda`);
      printCard(card);
      return 0;
    }

    case "ls": {
      const cards = (await queue.list()).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      if (cards.length === 0) {
        console.log("kart yok. `npm run card -- new daily \"başlık\" \"iş\"` ile aç.");
        return 0;
      }
      const idW = Math.max(...cards.map((c) => c.id.length));
      const roleW = Math.max(...cards.map((c) => c.role.length));
      for (const card of cards) {
        const rejects = Object.values(card.rejects).reduce((a, b) => a + b, 0);
        console.log(
          `${STATE_MARK[card.state]} ${pad(card.id, idW)}  ${pad(card.state, 6)}  ` +
            `${pad(card.role, roleW)}  ${card.title}` + (rejects > 0 ? `  (${rejects} ret)` : ""),
        );
      }
      return 0;
    }

    case "show":
      printCard(await need(rest[0]));
      return 0;

    case "take": {
      const role = rest[0];
      if (role === undefined) {
        console.log(USAGE);
        return 1;
      }
      const card = await queue.take(role);
      if (card === null) {
        console.log(`${role} kuyruğu boş.`);
        return 0;
      }
      console.log(`▶ ${card.id} alındı — ${role} üzerinde aktif\n`);
      console.log(card.task);
      return 0;
    }

    case "handoff": {
      const card = await need(rest[0]);
      const commit = rest[1];
      const moved = await queue.handoff(card, commit === undefined ? {} : { commit });
      console.log(
        moved.state === "done"
          ? `✓ ${moved.id} bitti`
          : moved.state === "gate"
            ? `⏸ ${moved.id} insan kapısında bekliyor (${moved.role} sonrası)`
            : `→ ${moved.id} devredildi: ${moved.role} kuyruğunda`,
      );
      return 0;
    }

    case "reject": {
      const card = await need(rest[0]);
      const reason = rest.slice(1).join(" ");
      const sent = await queue.reject(card, { reason });
      console.log(
        sent.state === "gate"
          ? `⏸ ${sent.id} ret limiti doldu — insan kapısında`
          : `← ${sent.id} REDDEDİLDİ: ${sent.role} kuyruğuna geri döndü`,
      );
      return 0;
    }

    case "release": {
      const card = await need(rest[0]);
      // Karar verilmediyse kapının tipi belirler: kaçış kapısında tur
      // tamamlanmadı, yani doğru varsayılan "aynı rol baştan koşsun".
      const asked = rest[1];
      const decision: ReleaseDecision | undefined =
        asked === "back" || asked === "forward" || asked === "retry" ? asked : undefined;
      if (asked !== undefined && decision === undefined) {
        console.error(`✗ Bilinmeyen karar: ${asked}. Beklenen: forward, back, retry`);
        return 1;
      }
      const { card: released, decision: taken } = await releaseCard(
        root,
        queue,
        card.id,
        decision,
      );
      console.log(
        released.state === "done"
          ? `✓ ${released.id} bitti`
          : `→ ${released.id} bırakıldı (${taken}): ${released.role} kuyruğunda`,
      );
      return 0;
    }

    case "recover": {
      const cards = await queue.recover();
      console.log(
        cards.length === 0
          ? "yarıda kalan kart yok."
          : `${cards.length} kart kuyruğa geri kondu: ${cards.map((c) => c.id).join(", ")}`,
      );
      return 0;
    }

    default:
      console.log(USAGE);
      return command === undefined ? 0 : 1;
  }
}

run(process.argv.slice(2), resolve(process.cwd())).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof QueueError || error instanceof FlowError) {
      console.error(`✗ ${error.message}`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  },
);
