import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Sınamalar için geçici bir kök dizin açar ve **gerçek yolunu** verir.
 *
 * NİYE `realpath` ŞART:
 *
 * macOS'te `/var` bir sembolik bağ ve `/private/var`'a bakıyor. `os.tmpdir()`
 * BAĞLI yolu veriyor (`/var/folders/...`), ama ürün kodunun birkaç yerinde
 * gerçek yol KASITLI olarak çözülüyor:
 *
 *   - `tsxCliPath` Node'un modül çözümlemesini kullanıyor; Node paketleri
 *     `realpath`'ten geçirir (`--preserve-symlinks` verilmedikçe).
 *   - `isEntryPoint` hem `resolve` hem `realpathSync` adayını karşılaştırıyor,
 *     çünkü depo bir bağın arkasındaysa `import.meta.url` gerçek yolu yazar.
 *   - Bir alt süreç `workdir` içinde koşarken `process.cwd()` gerçek yolu
 *     bildirir.
 *
 * Yani ürün gerçek yolu veriyor, sınama bağlı yolu bekliyordu. Bu fark
 * Linux'ta GÖRÜNMÜYOR (`/tmp` bağ değil), macOS'te beş sınamayı düşürdü:
 *
 *   expected "/var/folders/.../alt"
 *   received "/private/var/folders/.../alt"
 *
 * Düşen sınamaların hiçbiri gerçek bir kusur göstermiyordu; ürün doğruydu,
 * kurgu taşınabilir değildi. Bedeli şuydu: depoyu kendi makinesinde ilk kez
 * koşturan kişi beş kırmızı görüyor ve "bir şey bozuk" diye okuyor.
 *
 * Yolu `mkdtemp`'ten SONRA çözüyoruz: `realpath` var olmayan yolda atar,
 * dizin önce yaratılmalı.
 *
 * Doğrudan `mkdtemp(join(tmpdir(), …))` çağrısı bu yüzden sınamalarda YASAK
 * — `src/testing/temp-root.test.ts` bunu kaynak düzeyinde pinliyor, çünkü
 * tek bir dosyanın kuralı atlaması aynı kusuru geri getirir ve yalnızca
 * macOS'te görünür.
 */
export async function tempRoot(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}
