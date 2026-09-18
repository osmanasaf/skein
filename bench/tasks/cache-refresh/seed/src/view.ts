import type { Cache } from "./cache.js";

/**
 * Anahtar başına türetilmiş görünüm.
 *
 * Ekran her karede çağırıyor, bu yüzden hesap `version`a göre
 * önbellekleniyor: aynı sürüm için yeniden hesaplanmaz. Yani önbellekte
 * bir şey değiştiğinde sürümün artması, bu modülün doğru çalışmasının
 * koşulu.
 */
export function createOzet<V>(
  cache: Cache<V>,
  bicim: (value: V | undefined) => string,
): (key: string) => string {
  const memo = new Map<string, { version: number; text: string }>();
  return (key) => {
    const version = cache.version(key);
    const onceki = memo.get(key);
    if (onceki !== undefined && onceki.version === version) return onceki.text;
    const text = bicim(cache.peek(key));
    memo.set(key, { version, text });
    return text;
  };
}
