/**
 * Çıktı, çağrının ağ katmanında durduğunu söylüyor mu; söylüyorsa sebebi.
 *
 * Bayrak hatası ile ağ hatası farklı işler gerektiriyor ve ikisini
 * karıştırmak operatörü doğru bir dosyayı düzeltmeye gönderiyor.
 */
export function networkFailure(output: string): string | undefined {
  const desenler: [RegExp, string][] = [
    [/HTTP CONNECT failed with status (\d+)/i, "vekil CONNECT'i reddetti"],
    [/proxy connection failed/i, "vekil bağlantısı kurulamadı"],
    [/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT)\b/, "ağ hatası"],
    [/certificate|self[- ]signed|unable to verify/i, "TLS doğrulaması"],
    [/\b(401|403)\b.*(unauthorized|forbidden)|not logged in/i, "kimlik doğrulama"],
  ];
  for (const [re, ad] of desenler) {
    const m = re.exec(output);
    if (m) return `${ad} (${m[0].trim().slice(0, 80)})`;
  }
  return undefined;
}
