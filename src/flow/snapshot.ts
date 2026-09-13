import { join, relative, sep } from "node:path";
import type { AuditPolicy, Flow, GateType, Receive, RejectPolicy } from "./load.js";
import { DONE } from "./load.js";

/**
 * Bir rolün kart yönlendirmesi ve koşumu için gereken her şeyi taşıyan
 * kayıt. Yollar kök dizine göre relatif ve POSIX ayraçlı — kart dosyası
 * makineler arasında taşınabilir olmalı.
 */
export interface SnapshotRole {
  id: string;
  provider: string;
  workspace: string;
  /** Kök dizine göre relatif prompt yolu. */
  prompt: string;
  receive: Receive;
  next: string;
  syncBack: string[];
  reject: string | null;
}

export interface SnapshotGate {
  after: string;
  type: GateType;
}

/**
 * Bir akış tanımının dondurulmuş hali.
 *
 * Kart bunu YANINDA taşır ve yönlendirme canlı YAML'dan değil buradan
 * okunur. Sebep: akış dosyaları değiştirilebilir olmalı — rol ekleyip
 * çıkarabilmelisin — ama yolda olan bir kart, başladığı topolojiyle
 * bitmeli. Canlı dosyaya bakan bir kuyruk, ortadaki bir düzenlemede kartı
 * var olmayan bir role gönderebilirdi.
 */
export interface TopologySnapshot {
  flow: string;
  hash: string;
  /** Zincir sırasında. */
  roles: SnapshotRole[];
  gates: SnapshotGate[];
  reject: RejectPolicy;
  audit: AuditPolicy;
  /** Kök dizine göre relatif anayasa katmanları, sıra anlamlı. */
  constitution: string[];
}

function rel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join("/");
}

/** Bir akışı, karta gömülebilecek biçime dondurur. */
export function snapshot(flow: Flow, root: string): TopologySnapshot {
  return {
    flow: flow.name,
    hash: flow.hash,
    roles: flow.roles.map((role) => ({
      id: role.id,
      provider: role.provider,
      workspace: role.workspace,
      prompt: rel(root, role.promptPath),
      receive: role.receive,
      next: role.next,
      syncBack: [...role.syncBack],
      reject: role.reject,
    })),
    gates: flow.gates.map((gate) => ({ after: gate.after, type: gate.type })),
    reject: { ...flow.reject },
    audit: { enabled: flow.audit.enabled, fingerprint: [...flow.audit.fingerprint] },
    constitution: flow.constitution.map((path) => rel(root, path)),
  };
}

export function roleOf(topology: TopologySnapshot, id: string): SnapshotRole | null {
  return topology.roles.find((role) => role.id === id) ?? null;
}

/** Zincirin başı — kartın girdiği rol. */
export function headOf(topology: TopologySnapshot): string {
  const first = topology.roles[0];
  if (first === undefined) throw new Error("Topolojide hiç rol yok");
  return first.id;
}

/** Rolün çıkışında insan kapısı var mı. */
export function gateAfter(topology: TopologySnapshot, roleId: string): SnapshotGate | null {
  return topology.gates.find((gate) => gate.after === roleId && gate.type === "approval") ?? null;
}

/** Ret sayacının anahtarı. Kenar başına sayılır, rol başına değil. */
export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

/** Prompt katmanlarının mutlak yolları: anayasa, sonra rol tanımı. */
export function promptLayers(
  topology: TopologySnapshot,
  role: SnapshotRole,
  root: string,
): { name: string; path: string }[] {
  const layers = topology.constitution.map((path, i) => ({
    name: `anayasa:${i + 1}`,
    path: join(root, path),
  }));
  layers.push({ name: `rol:${role.id}`, path: join(root, role.prompt) });
  return layers;
}

export { DONE };
