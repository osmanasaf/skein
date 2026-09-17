# Mühendislik Kuralları — TypeScript

## Deponun kendi yapısı otoritedir

- Derleme ve test yalnızca deponun kendi betikleriyle: `npm test`,
  `npm run typecheck`. Kendi test koşucunu kurma, `tsc`'yi elle çağırıp
  yapıyı atlatma.
- Bağımlılık ekleme, sürüm değiştirme, CI yapılandırmasına dokunma. Bir
  değişiklik bunu gerektiriyor gibi görünüyorsa dur ve söyle.
- Biçimlendirici ve derleyici katılığı (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`) deponun kararıdır; gevşetme.

## Test döngüsü

- Kırmızı-yeşil döngüsünde en dar şeyi koş:
  `npx vitest run <dosya>` ya da `npx vitest run -t "<test adı>"`.
- Devretmeden hemen önce tam doğrulamayı **bir kez** koş:
  `npm test` ve `npm run typecheck`.
- Her döngüde tam takımı koşturma.
- Tam takım senin görevinle ilgisi olmayan bir sebeple kırmızıysa, bunu
  söyle; ilgisiz yerleri düzeltmeye kalkma.

## Tipler

- `any` kullanma. Bilinmeyen girdi `unknown` ile girer ve daraltılarak
  kullanılır.
- Tip iddiası (`as`) yerine daraltma. İddia gerekiyorsa neden güvenli
  olduğunu yorumla yaz.
- Dışa açılan her şeyin dönüş tipi açıkça yazılır; çıkarıma bırakılmaz.

## Testler

- Test, uygulamayı değil **davranışı** sınar. Uygulamayı yeniden yazan bir
  test, uygulama değişince kırılır ve hiçbir şey öğretmez.
- Her testin adı, sınadığı davranışı söyler.
- Zaman, rastgelelik ve dosya sistemi dışarıdan verilir; testte sabitlenir.
