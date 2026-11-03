import { spawnPortable, type PipedChild } from "../proc/process.js";

/**
 * Platforma göre tarayıcıyı açan komut + argümanlar.
 *
 * Windows'ta `start` bir KABUK YERLEŞİĞİ, `cmd.exe`'nin bir parçası — çıplak
 * `spawn("start", [url])` ENOENT verir. `cmd /c start "" <url>` doğru biçim;
 * boş dizge argümanı `start`ın ilk tırnaklı argümanı pencere başlığı sayma
 * kuralını atlatıyor (url tırnaksız gelirse başlık sanılabilir).
 */
export function tarayiciKomutu(
  platform: NodeJS.Platform,
  url: string,
): { komut: string; args: string[] } {
  if (platform === "darwin") return { komut: "open", args: [url] };
  if (platform === "win32") return { komut: "cmd", args: ["/c", "start", '""', url] };
  return { komut: "xdg-open", args: [url] };
}

export interface TarayiciyiAcOptions {
  /** Varsayılan: gerçek platform (`process.platform`). */
  platform?: NodeJS.Platform;
  /** Test edilebilirlik için enjekte edilir; varsayılan `spawnPortable`. */
  spawn?: (komut: string, args: string[]) => PipedChild;
  /** Başarısızlık satırı nereye basılır; varsayılan `console.warn`. */
  log?: (satir: string) => void;
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
export function tarayiciyiAc(url: string, options: TarayiciyiAcOptions = {}): void {
  const platform = options.platform ?? process.platform;
  const spawn = options.spawn ?? ((komut, args) => spawnPortable(komut, args));
  const log = options.log ?? ((satir) => console.warn(satir));
  const { komut, args } = tarayiciKomutu(platform, url);
  try {
    const child = spawn(komut, args);
    child.on("error", () => log(BASARISIZLIK_SATIRI));
    // Kısa ömürlü bir açıcı — ebeveyn süreci ayakta tutmasın.
    child.unref?.();
  } catch {
    log(BASARISIZLIK_SATIRI);
  }
}
