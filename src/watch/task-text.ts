import type { Card } from "../card/card.js";
import type { SnapshotRole } from "../flow/snapshot.js";
import { verdictInstructions } from "./verdict.js";

/**
 * Kartın geçmişindeki, bu role ait EN SON reti bulur.
 *
 * Rol bir düzeltme turuna giriyorsa hangi itiraz üzerine girdiğini bilmek
 * zorunda. Bulunmazsa bu rolün bu kart için ilk turu demektir.
 */
function lastRejectTo(card: Card, roleId: string): Extract<Card["history"][number], { event: "reject" }> | null {
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event === "reject" && entry.to === roleId) return entry;
    // Bu rol işi devraldıysa öncesi kapanmıştır; daha geriye bakma.
    if (entry?.event === "handoff" && entry.from === roleId) return null;
  }
  return null;
}

/**
 * Role verilecek iş metnini kurar.
 *
 * Rol promptuna (anayasa + rol tanımı) KARIŞMAZ: o katman görevden
 * bağımsız olmalı ki hash'i sabit kalsın. Değişen her şey burada.
 */
export function buildTaskText(card: Card, role: SnapshotRole): string {
  const parts: string[] = [
    `# ${card.title}`,
    "",
    "## İş",
    "",
    card.task,
  ];

  const rejection = lastRejectTo(card, role.id);
  if (rejection !== null) {
    parts.push(
      "",
      "## Önceki tur reddedildi",
      "",
      `\`${rejection.from}\` bu işi geri gönderdi (bu kenarda ${rejection.round}. ret).`,
      ...(rejection.commit === undefined ? [] : [`Reddedilen commit: \`${rejection.commit}\``]),
      "",
      "Gerekçesi:",
      "",
      rejection.reason,
      "",
      "Bu itirazı ele al. Katılmıyorsan da sessizce görmezden gelme — ne",
      "yaptığını özetinde söyle.",
    );
  }

  parts.push("", verdictInstructions(role.reject !== null));
  return parts.join("\n");
}
