import { readFile } from "node:fs/promises";
import { loadFlow, type Flow, type LoadOptions } from "./load.js";
import { snapshot, type TopologySnapshot } from "./snapshot.js";

export type RefreshResult =
  | { kind: "unchanged" }
  | { kind: "reloaded"; from: string; to: string }
  | { kind: "failed"; message: string };

/**
 * Akış dosyasının yaşayan hâli.
 *
 * Gözcü ve ekran akışı açılışta bir kez okuyordu; dosya değişince ikisi de
 * bayat kalıyor, yeni role giden kart hiçbir turda alınmıyor ve hiçbir hata
 * üretmiyordu (bkz. ARCHITECTURE, "Akış değişince yoldaki kartlar").
 *
 * Yeniden yükleme iki şarta bağlı, ve ikisi de pazarlık konusu değil:
 *
 * 1. **Doğrulanmış.** Yeni içerik 16 kuralın tamamından geçmeden geçerli
 *    sayılmaz. Editör yarım kaydetmiş olabilir; yarım bir YAML gözcüyü
 *    düşürmemeli.
 * 2. **Atomik.** Geçiş ya tamamen olur ya hiç olmaz. Başarısızlıkta ELDEKİ
 *    topoloji aynen durur — "yarı yüklenmiş akış" diye bir durum yok.
 *
 * Yoldaki kartları etkilemez: onlar kendi dondurulmuş topolojilerini taşır
 * (değişmez 4). Değişen tek şey, gözcünün hangi kuyrukları süpüreceği ve
 * ekranın hangi sütunları çizeceği.
 */
export class LiveFlow {
  #flow: Flow;
  #topology: TopologySnapshot;
  #text: string;
  /** Son başarısız okumanın gerekçesi; başarılı yüklemede temizlenir. */
  #error: string | null = null;

  readonly #path: string;
  readonly #options: LoadOptions;

  private constructor(path: string, options: LoadOptions, flow: Flow, text: string) {
    this.#path = path;
    this.#options = options;
    this.#flow = flow;
    this.#topology = snapshot(flow, options.root);
    this.#text = text;
  }

  /** İlk yükleme başarısızsa açılmaz: bayat başlamaktan iyisi hiç başlamamak. */
  static async open(path: string, options: LoadOptions): Promise<LiveFlow> {
    const flow = await loadFlow(path, options);
    const text = await readFile(path, "utf8");
    return new LiveFlow(path, options, flow, text);
  }

  get flow(): Flow {
    return this.#flow;
  }

  get topology(): TopologySnapshot {
    return this.#topology;
  }

  /** Son yeniden yükleme denemesi neden başarısız oldu; yoksa `null`. */
  get error(): string | null {
    return this.#error;
  }

  /**
   * Dosyayı yoklar ve gerekiyorsa yeniden yükler.
   *
   * Değişiklik tespiti için mtime değil İÇERİK karşılaştırılıyor: mtime
   * çözünürlüğü bazı dosya sistemlerinde bir saniye ve aynı saniyede yapılan
   * bir düzenleme sessizce kaçardı. Dosya küçük; okumak ucuz, kaçırmak pahalı.
   */
  async refresh(): Promise<RefreshResult> {
    let text: string;
    try {
      text = await readFile(this.#path, "utf8");
    } catch (cause) {
      return this.#fail(`akış dosyası okunamadı: ${(cause as Error).message}`);
    }

    if (text === this.#text) {
      // İçerik son BAŞARILI hâlle aynı: dosyaya dokunulmuş olabilir ama
      // topoloji değişmedi. Bozuk metin hiç kaydedilmediği için, kullanıcı
      // dosyayı eski hâline geri çevirdiğinde de buraya düşülür — o yüzden
      // hata izi burada temizleniyor. Temizlenmeseydi ekran, geçerli bir
      // dosya için sonsuza kadar hata gösterirdi.
      this.#error = null;
      return { kind: "unchanged" };
    }

    let flow: Flow;
    try {
      flow = await loadFlow(this.#path, this.#options);
    } catch (cause) {
      // Metni KAYDETMİYORUZ: kullanıcı aynı bozuk hâli düzeltip kaydedince
      // yeniden denenmeli. Geçerli topoloji aynen duruyor.
      return this.#fail((cause as Error).message);
    }

    const from = this.#flow.hash;
    this.#flow = flow;
    this.#topology = snapshot(flow, this.#options.root);
    this.#text = text;
    this.#error = null;

    // Hash aynıysa değişen şey yalnızca yorum/boşluk: topoloji hash'i
    // açıklamaları ve kapı metinlerini kapsamıyor.
    return from === flow.hash ? { kind: "unchanged" } : { kind: "reloaded", from, to: flow.hash };
  }

  #fail(message: string): RefreshResult {
    this.#error = message;
    return { kind: "failed", message };
  }
}
