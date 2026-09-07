/**
 * Sağlayıcı adaptörü sözleşmesi — hub/adapters/CONTRACT.md'nin kod karşılığı.
 *
 * Adaptör yalnızca "şu dizinde, şu promptla, şu işi yap ve bana ne olduğunu
 * söyle" der. Handoff, audit gate, worktree ve kuyruk çekirdeğin işidir.
 */

export interface InvokeRequest {
  /** Rolün git worktree'si; süreç burada çalışır. */
  workdir: string;
  /** Rol tanımı + anayasa, birleştirilmiş dosya yolu. */
  promptFile: string;
  /** Bu tur yapılacak iş. */
  taskText: string;
  timeoutMs: number;
  /** Sağlayıcıya özel ek ortam değişkenleri. */
  env?: Record<string, string>;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface InvokeResult {
  /** Süreç çıkış kodu. 0 = başarı. Pane metni kazıma yok. */
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  usage?: Usage;
  /** Süreç timeoutMs'i aştığı için öldürüldüyse true. */
  timedOut?: boolean;
}

export interface Adapter {
  /** Akış tanımındaki `provider` alanının karşılığı. */
  readonly id: string;
  /**
   * Pinlenmiş model kimliği.
   *
   * Sağlayıcı adı tek başına yetmez: tezin tamamı model çeşitliliği
   * üzerine kurulu ve "claude" zamanla farklı modeller demek. Deneyin
   * tekrarlanabilir olması için model kaydedilir.
   */
  readonly model: string;
  invoke(req: InvokeRequest): Promise<InvokeResult>;
}

/**
 * SCHEMA.md 8. doğrulama kuralı ("her provider kayıtlı bir adaptöre karşılık
 * gelir") bir kayıt gerektiriyor. Kayıt buydu.
 */
export class AdapterRegistry {
  readonly #byId = new Map<string, Adapter>();

  register(adapter: Adapter): this {
    if (this.#byId.has(adapter.id)) {
      throw new Error(`Adaptör zaten kayıtlı: ${adapter.id}`);
    }
    this.#byId.set(adapter.id, adapter);
    return this;
  }

  get(id: string): Adapter {
    const adapter = this.#byId.get(id);
    if (!adapter) {
      const known = this.ids();
      const list = known.length > 0 ? known.join(", ") : "(hiçbiri)";
      throw new Error(`Bilinmeyen sağlayıcı: ${id}. Kayıtlı olanlar: ${list}`);
    }
    return adapter;
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }

  ids(): string[] {
    return [...this.#byId.keys()].sort();
  }
}
