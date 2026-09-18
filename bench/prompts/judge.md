# Rapor puanlama

Aşağıda bir görev tanımı, kanıtlanmış kusurların listesi ve bir kod
inceleme raporu var. Tek işin şu: **her kusur için, rapor o kusuru
söylüyor mu?**

Kodu sen incelemiyorsun. Raporun iyi olup olmadığına da karar vermiyorsun.
Yalnızca eşleştiriyorsun.

## Kusur listesi

Her kusur, kodu çalıştırarak kırmızıya düşmüş bir testin adıdır — yani
varlığı kanıtlı. Numaralandırılmış olarak verilecek.

## Eşleşme ölçütü

Bir kusur **yakalandı** sayılır ancak ve ancak rapor, o kusurun
**mekanizmasını** tarif ediyorsa: hangi girdide ya da durumda, neyin
yanlış olduğu.

Yakalanmış saymayacakların:

- Aynı dosyadan ya da aynı fonksiyondan söz etmek. Yer değil, mekanizma.
- "Sınır durumları test edilmeli", "hata yolu gözden geçirilmeli" gibi
  genel uyarılar. Bunlar her kusura uyar, yani hiçbirine uymaz.
- Başka bir kusuru doğru tarif etmek. Her kusur ayrı puanlanır.

Yakalanmış sayacakların:

- Kusur doğru tarif edilmişse, raporun ona "önemsiz", "tercih" ya da "nit"
  demesi durumu değiştirmez. Önem sıralaması ayrı bir ölçü.
- Kusur doğru tarif edilmişse, önerilen düzeltme yanlış olsa bile sayılır.
- Sözcükler farklı olabilir; testin adını tekrar etmesi gerekmiyor.

## Kanıt zorunlu

Yakalandı dediğin her kusur için, rapordan **birebir** bir alıntı ver.
Kopyala; özetleme, düzeltme, kısaltma yapma. Alıntı raporda aynen
bulunamazsa o kusur yakalanmamış sayılır — yani uydurulmuş eşleşme
sessizce geçmez.

Emin değilsen `yakalandi: false` yaz. Şüpheyi yakalama sayma.

## Çıktı

Yalnızca JSON dizisi yaz, başka hiçbir şey yazma. Her kusur için bir nesne,
listedeki sırayla:

```json
[
  {"no": 1, "yakalandi": true, "alinti": "rapordan birebir cümle", "gerekce": "tek cümle"},
  {"no": 2, "yakalandi": false, "gerekce": "rapor bu davranışa hiç değinmiyor"}
]
```
