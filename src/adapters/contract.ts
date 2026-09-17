/**
 * Sağlayıcı adaptörü sözleşmesi — hub/adapters/CONTRACT.md'nin kod karşılığı.
 *
 * Adaptör yalnızca "şu dizinde, şu promptla, şu işi yap ve bana ne olduğunu
 * söyle" der. Handoff, audit gate, worktree ve kuyruk çekirdeğin işidir.
 */

/**
 * Ajanın koşarken attığı tek adım.
 *
 * Sağlayıcıdan bağımsız ve KASITLI olarak dar: ajanın iç muhakemesi
 * (`thinking`) buraya girmez, yalnızca dışarıdan gözlenebilir olan girer —
 * hangi aracı çağırdı, ne söyledi. Ekranın "şu an ne yapıyor" sorusuna
 * cevabı bu, ve pane metni kazımanın yerine geçen şey de bu (PHILOSOPHY 8).
 *
 * Adımlar GÖZLEM'dir, durum değil: kaybolmaları turun sonucunu değiştirmez.
 * Kartın nereye gittiğini `card.settled` söyler.
 */
export interface AgentStep {
  kind: "tool" | "text";
  /** Araç adı — yalnızca `kind: "tool"` için. */
  name?: string;
  /** Kırpılmış ayrıntı: dosya yolu, komut başı ya da metnin ilk satırı. */
  detail?: string;
}

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
  /**
   * Adım geldikçe çağrılır — canlı izleme buradan besleniyor.
   *
   * İSTEĞE BAĞLI, iki yönden: çağıran vermeyebilir (deney vermiyor), ve
   * adaptör desteklemeyebilir. Desteklemeyen adaptör bunu sessizce yok sayar
   * ve turun geri kalanı aynen çalışır. Yalnızca yapılandırılmış çıktıdan
   * beslenir; metin kazıyarak adım üretmek yasak.
   */
  onStep?: (step: AgentStep) => void;
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
  /**
   * Ajanın son mesajı, düz metin olarak — varsa.
   *
   * Bir tur sonuçsuz bittiğinde ajanın kendi açıklaması en değerli teşhis.
   * Gerçek bir koşuda ajan "git add için izin yok, o yüzden verdikt
   * yazmıyorum" diye açıkça yazdı; çekirdek bunu okumadığı için kart
   * "verdikt yazmadı" diye kapıya çıktı ve sebep üç koşu boyunca
   * görünmedi.
   */
  message?: string;
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
