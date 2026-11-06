import { spawnPortable, type PipedChild } from "../proc/process.js";

/**
 * Platforma göre tarayıcıyı açan komut + argümanlar.
 *
 * Windows'ta `start` bir KABUK YERLEŞİĞİ, `cmd.exe`'nin bir parçası — çıplak
 * `spawn("start", [url])` ENOENT verir. `cmd /c start "" <url>` doğru biçim;
 * boş dizge argümanı `start`ın ilk tırnaklı argümanı pencere başlığı sayma
 * kuralını atlatıyor (url tırnaksız gelirse başlık sanılabilir).
 */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", '""', url] };
  return { command: "xdg-open", args: [url] };
}

export interface OpenBrowserOptions {
  /** Varsayılan: gerçek platform (`process.platform`). */
  platform?: NodeJS.Platform;
  /** Test edilebilirlik için enjekte edilir; varsayılan `spawnPortable`. */
  spawn?: (command: string, args: string[]) => PipedChild;
  /** Başarısızlık satırı nereye basılır; varsayılan `console.warn`. */
  log?: (line: string) => void;
}

const BASARISIZLIK_SATIRI = "⚠ tarayıcı açılamadı, adresi elle aç";

/**
 * Ekran açılınca tarayıcıyı kendiliğinden açar.
 *
 * ASLA EKRANI DÜŞÜRMEZ — süreç başlatma İKİ ayrı yoldan başarısız olabilir
 * ve ikisi de yutuluyor:
 *
 * - SENKRON: komut PATH'te yok ya da argüman geçersiz, `spawn` çağrısının
 *   kendisi fırlatır (bazı platformlarda `cross-spawn` böyle davranır).
 * - ASENKRON: çocuk süreç GERÇEKTEN başlatılamaz (ör. `xdg-open` kurulu
 *   değil), hata `error` olayıyla gelir — `spawn` çağrısı başarıyla döner,
 *   başarısızlık SONRA görünür.
 *
 * Ekran zaten URL'yi bastı; bu fonksiyon başarısız olursa kullanıcı elle
 * açar, o yüzden ikinci yoldaki hata da SESSİZ KALMIYOR, bir satır basılıyor.
 */
export function openBrowser(url: string, options: OpenBrowserOptions = {}): void {
  const platform = options.platform ?? process.platform;
  const spawn = options.spawn ?? ((command, args) => spawnPortable(command, args));
  const log = options.log ?? ((line) => console.warn(line));
  const { command, args } = browserCommand(platform, url);
  try {
    const child = spawn(command, args);
    child.on("error", () => log(BASARISIZLIK_SATIRI));
    // Kısa ömürlü bir açıcı — ebeveyn süreci ayakta tutmasın.
    child.unref?.();
  } catch {
    log(BASARISIZLIK_SATIRI);
  }
}
