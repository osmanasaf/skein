/**
 * Sağlayıcı çıktısından model turu sayısı.
 *
 * Ayrı modülde, çünkü `cli.ts` modül düzeyinde kendini koşturuyor: oradan
 * import eden bir sınama CLI'ı çalıştırıp `process.exit` ile düşerdi.
 */
/**
 * Çıktıdaki model turu sayısı; biçim tanınmazsa undefined.
 *
 * İki biçim okunuyor, çünkü iki sağlayıcı iki ayrı şey basıyor:
 *
 * - Tek JSON nesnesi (claude `--output-format json`): `usage.iterations`
 *   ya da `modelUsage`.
 * - JSONL (codex `exec --json`): her satır bir olay; `turn.completed`
 *   sayılıyor.
 *
 * Eskiden yalnızca ilki okunuyordu ve codex'te `JSON.parse(stdout)` her
 * zaman atıyordu: doctor "model turu: ?" basıyordu. Görünüşte kozmetikti
 * ama ALTINDA bir boşluk vardı — `turns === 0` koruması (model hiç
 * çağrılmadığı halde exit 0 dönen sessiz çağrı, operatörün makinesinde tam
 * olarak bu oldu) codex için hiç ateşlenemiyordu, çünkü `undefined` sıfır
 * değildir. Artık iki sağlayıcıda da ateşleniyor.
 */
export function modelTurns(stdout: string): number | undefined {
  const metin = stdout.trim();
  if (metin === "") return undefined;
  try {
    const d = JSON.parse(metin) as {
      usage?: { iterations?: unknown[] };
      modelUsage?: Record<string, unknown>;
    };
    if (Array.isArray(d.usage?.iterations)) return d.usage.iterations.length;
    if (d.modelUsage) return Object.keys(d.modelUsage).length;
    return undefined;
  } catch {
    // Tek nesne değil: JSONL olabilir.
  }
  let olayli = false;
  let tur = 0;
  for (const satir of metin.split("\n")) {
    const text = satir.trim();
    if (!text.startsWith("{")) continue;
    try {
      const olay = JSON.parse(text) as { type?: unknown };
      if (typeof olay.type !== "string") continue;
      olayli = true;
      if (olay.type === "turn.completed") tur += 1;
    } catch {
      // JSON değil; bir sonraki satır.
    }
  }
  return olayli ? tur : undefined;
}
