import { ClaudeCliAdapter } from "./claude.js";
import { CodexCliAdapter } from "./codex.js";
import type { Adapter } from "./contract.js";

export interface ModelSpec {
  provider: string;
  model: string;
}

/**
 * "codex:gpt-5.5" → { provider: "codex", model: "gpt-5.5" }
 * "claude-opus-5" → { provider: "claude", model: "claude-opus-5" }
 *
 * Sağlayıcı yazılmazsa claude varsayılır; tek satıcıyla koşarken 2x2'nin
 * iki köşesi aynı ailenin iki modeli olabiliyor.
 */
export function parseModelSpec(spec: string): ModelSpec {
  const at = spec.indexOf(":");
  if (at === -1) return { provider: "claude", model: spec };
  const provider = spec.slice(0, at).trim();
  const model = spec.slice(at + 1).trim();
  if (provider === "" || model === "") {
    throw new Error(`Geçersiz model tanımı: "${spec}". Beklenen biçim: sağlayıcı:model`);
  }
  return { provider, model };
}

/**
 * Bir model tanımından adaptör kurar.
 *
 * `id` model tanımının tamamı: 2x2'nin hücreleri model düzeyinde ayrışmalı,
 * yalnızca satıcı düzeyinde değil.
 */
export function adapterFor(spec: string): Adapter {
  const { provider, model } = parseModelSpec(spec);
  switch (provider) {
    case "claude":
      return new ClaudeCliAdapter({ id: spec, model });
    case "codex":
      return new CodexCliAdapter({ id: spec, model });
    default:
      throw new Error(`Bilinmeyen sağlayıcı: "${provider}". Kayıtlı olanlar: claude, codex`);
  }
}
