/**
 * Bir model tanımını dosya adında kullanılabilir hâle getirir.
 *
 * `adapterFor` adaptörün `id`'sini model tanımının TAMAMI yapıyor
 * (`codex:gpt-5.5`), çünkü 2x2'nin hücreleri model düzeyinde ayrışmalı. Ama
 * iki nokta Windows'ta yol karakteri olarak geçersiz: sanitize edilmemiş bir
 * `id` hücre dizini oluşturulurken patlar, hem de ajan çağrılmadan önce
 * değil, koşunun ortasında.
 *
 * `matrix` bunu zaten yerel bir yardımcıyla yapıyordu; tek kopya buraya
 * alındı ki ikinci bir koşum yolu aynı tuzağa düşmesin.
 */
export function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_");
}
