# Kod incelemesi

Aşağıda bir görev tanımı, altında da o görevi uygulayan kod var. Kodu incele.

## Ara

Görev tanımının belirttiği davranışın koddaki karşılığını izle. Her davranış
için sınır durumlarını düşün: sıfır, bir, en büyük değer, hata yolu, hiç
çağrılmama, eşzamanlı çağrı.

İmzayı tanımla karşılaştır: dönüş tipi, hataların nasıl ve ne zaman ortaya
çıktığı, varsayılan değerler, dışa aktarım biçimi.

## Raporla

Her bulgu için:

- **Ne**: kusurun tek cümlelik ifadesi
- **Nerede**: dosya ve satır
- **Nasıl patlar**: somut girdi ya da durum, sonra yanlış sonuç

Bulguları önem sırasına diz. Kusur ile tercih ayrımını yap ve hangisini
raporladığını söyle; tercihlerle şişirilmiş bir rapor okunmaz hale gelir.

Kusur bulmazsan bunu açıkça yaz ve neye baktığını söyle. Kapsamı belirtmeyen
boş bir rapor, hiç inceleme yapmamaktan ayırt edilemez.

## Yapma

Kodu düzeltme, dosya yazma, test ekleme. Yalnızca raporla.
