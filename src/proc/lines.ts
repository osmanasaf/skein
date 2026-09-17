/**
 * Akan çıktıyı satırlara böler.
 *
 * Boru parçalı gelir: bir `data` olayı yarım satırla bitebilir, bir sonraki
 * onun devamıyla başlayabilir. Parçayı olduğu gibi JSON'a vermek, akışın en
 * sık görülen sessiz arızası — kayıt bozuk sayılır ve adım kaybolur.
 */
export class LineSplitter {
  #buffer = "";
  readonly #onLine: (line: string) => void;

  constructor(onLine: (line: string) => void) {
    this.#onLine = onLine;
  }

  push(chunk: string): void {
    this.#buffer += chunk;
    let at = this.#buffer.indexOf("\n");
    while (at !== -1) {
      // `\r\n` Windows'tan gelir; `\r` bırakılırsa JSON.parse'a kadar taşınır.
      const line = this.#buffer.slice(0, at).replace(/\r$/, "");
      this.#buffer = this.#buffer.slice(at + 1);
      if (line !== "") this.#onLine(line);
      at = this.#buffer.indexOf("\n");
    }
  }

  /**
   * Son satırı da verir.
   *
   * Süreç sonlandığında tamponda kalan, satır sonu görmemiş bir parça
   * olabilir — ve ajanın son kaydı tam da o olabilir.
   */
  flush(): void {
    const rest = this.#buffer.trim();
    this.#buffer = "";
    if (rest !== "") this.#onLine(rest);
  }
}
