/**
 * Mesaj kimliği üreteci.
 *
 * **Her çağrı yeni bir kimlik üretir.** Kimlik, mesajın ömrü boyunca
 * değişmeyen tek alanı: kuyrukta beklerken de, tekrar gönderilirken de
 * aynı kalır.
 */
let sayac = 0;

export function nextId(): string {
  sayac += 1;
  return `m-${sayac}`;
}

/** Testler ve koşular arasında sayacı sıfırlar. */
export function resetIds(): void {
  sayac = 0;
}
