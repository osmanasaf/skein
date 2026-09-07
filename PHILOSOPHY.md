# Murmuration — Felsefe

> *Murmuration:* sığırcık sürülerinin gökyüzünde, merkezi bir lider olmadan,
> tek bir organizma gibi hareket etmesi.

## Ne inşa ediyoruz

Farklı sağlayıcıların AI ajanlarını (Claude, Codex, Copilot, Gemini…) tek bir
yazılım geliştirme akışında, birbirini denetleyerek çalıştıran bir merkez.
Ajanlar çağrılır, akışlar tanımlanır, iş takip edilir.

Bu proje `github.com/unclebob/swarm-forge`'un fikirlerinden doğdu. Kodu
kopyalamıyoruz; felsefesini alıyor, mekanizmasını kendi ihtiyacımıza göre
yeniden kuruyoruz. Neyi neden aldığımız ve neyi neden bıraktığımız aşağıda.

## Temel tez

Bir AI ajanına "şunu yap" demek ile bir yazılım ekibine "şunu yap" demek
arasındaki fark, ekibin birbirini denetlemesidir.

Murmuration bu denetimi ajanın iyi niyetine ya da prompt'un ikna gücüne
bağlamaz — **mekanizmaya** bağlar. Durum ajanın dışındadır, roller ayrıdır,
devir teslim doğrulanır, "bitti" demek sürtünmelidir.

---

## İlkeler

### 1. Durum ajanın kafasında değil, dışarıda

Kalıcı gerçek git commit'lerinde ve dosyalardadır. Ajanın context'i geçicidir;
her uyanış durumsuzdur. Ajan yeniden başlatılabilir, yarıda kesilebilir,
değiştirilebilir — iş kaybolmaz.

**Neden en önemli ilke bu:** Çoklu sağlayıcının ön koşulu. Durum ajanın
context'inde olsaydı, Claude'un başladığı işi Codex devralamazdı. Dışarıda
olduğu için her rol herhangi bir sağlayıcıyla doldurulabilir. "Ahenk" buradan
gelir — ajanların birbirini anlamasından değil, ortak bir dış gerçekliği
paylaşmasından.

SwarmForge bunu doğru yapmış: `handoffs.prompt` açıkça *"On restart, run
`ready_for_next.sh` and follow its output"* diyor. Protokol zaten durumsuz.

### 2. Rol, versiyonlanmış bir dosyadır — sohbet değil

Bir ajanın kim olduğu, ne yapıp ne yapmayacağı bir prompt dosyasında yazar;
sohbet geçmişinde birikmiş bağlamda değil. Rolü değiştirmek dosyayı
değiştirmektir. Rol tanımı gözden geçirilebilir, diff'lenebilir, geri
alınabilir.

Bunun yan etkisi: rol promptu kısa ve keskin olmak zorunda kalır. Uzayan
sohbette kaybolan "ne yapmamalısın" kuralları burada kalıcıdır.

### 3. Farklı sağlayıcı = farklı kör nokta

Üreten ile denetleyen aynı model olmamalıdır. Bir model kendi çıktısını
denetlerken kendi kör noktalarını da taşır; aynı varsayımı iki kez yapar.

Bu, çeşitliliğin süs değil **kalite mekanizması** olduğu anlamına gelir.
Projenin çoklu sağlayıcı desteği bir entegrasyon özelliği değil, tezin
kendisidir.

Uncle Bob bunu konfigürasyonlarında kasıtlı uygulamış: `coder=grok →
cleaner=codex`. Ama hiçbir yerde ölçmemiş. Biz ölçeceğiz (bkz. Açık Sorular).

### 4. İzole çalışma alanı

Rol başına git worktree. Ajanlar birbirinin dosyasına basmaz; çakışma, git'in
zaten çözdüğü bilinen bir probleme dönüşür. Paralel çalışma bedava gelmez ama
öngörülebilir olur.

### 5. Devir teslim yapılandırılmıştır, serbest metin değildir

Ajanlar birbirine "şunu yaptım sanırım" demez. Devir teslim, doğrulanmış bir
kayıttır: kime, hangi görev, hangi commit. Dar bir mesaj tipi kümesi, katı
doğrulama, ajanın uzun gövde yazması yasak.

Serbest metin devir teslimi, hataların sessizce yayıldığı yerdir. Yapı,
hatayı teslimattan önce yakalar.

### 6. "Bitti" demek sürtünmelidir — audit gate

Bir ajan işi devretmek istediğinde ilk deneme reddedilir. Ajan işini yeniden
denetlemek, gereksinimleri koda ve testlere kadar izlemek, sınır durumlarına
bakmak zorundadır. Denetim sırasında bir düzeltme yaparsa yeni bir tur başlar.
Devir teslim ancak **hiçbir şeyin değişmediği bir turdan sonra** gerçekleşir.

Bu, SwarmForge'un en orijinal fikri ve tek başına taşınmaya değer.

**Dürüst sınırı:** Mekanizma *töreni* zorunlu kılar, *özeni* değil. Denetimi
gerçekten yapmayan, sadece komutu ikinci kez çalıştıran bir ajan da geçer.
Yani bu bir garanti değil, bir sürtünme — LLM'lerin erken "bitti" deme
refleksini kırmak için. Ne kadar işe yaradığı ölçülmesi gereken bir şey.

### 7. İnsan kapıları belirli ve konfigüre edilebilirdir

Bazı geçişlerde otomatik ilerleme durur ve insan karar verir. Hangi
geçişlerde durulacağı akış tanımında yazar — kodda gömülü değil.

SwarmForge'da bu kapı yalnızca harfiyen `specifier` adlı, `master`
worktree'sindeki bir rol tek alıcıya gönderdiğinde tetikleniyordu. Rolü
yeniden adlandırmak kapıyı sessizce yok ediyordu. Biz bunu konfigürasyona
taşıyoruz.

### 8. Görünürlük ölçümle gelir, kazımayla değil

Hangi iş nerede, hangi ajan ne yapıyor, ne kadar sürdü, ne kadara mal oldu.
Bu veriler her ajan çağrısında yapılandırılmış olarak kaydedilir.

SwarmForge bunu terminal pane'inin metnini regex'le kazıyarak (`"I'm ..."`
içeren son satırı arayarak) yapıyordu — CLI çıktı formatı değişince sessizce
bozulan bir yüzey. Biz süreç çıkış kodu ve yapılandırılmış olay günlüğü
kullanacağız.

---

## Reddettiklerimiz

Kapsamın kaymaması için açık non-goal'lar:

| Reddedilen | Neden |
|---|---|
| tmux / terminal multiplexer | Ajanları uzun ömürlü interaktif TUI olarak çalıştırma tercihinin sonucu. Protokol zaten durumsuz olduğu için gereksiz. Kaldırınca platform bağımlılığı da gidiyor. |
| Pane metni kazıma | Kırılgan. CLI çıktısı değişince sessizce bozulur. Exit code + yapılandırılmış çıktı var. |
| İnteraktif TUI ajanlar | İş başına headless süreç daha ucuz, daha ölçülebilir, her platformda ve CI'da aynı. |
| Magic rol isimleri | Davranışın rol adına gömülü olması (araç listesi, onay kapısı, bitiş noktası) topolojiyi değiştirmeyi kırılgan yapar. |
| Kendi CRAP/mutation/DRY araçlarımızı yazmak | Her dilin olgun araçları var. Kurumsal build'de zaten mevcutlar; yeni bağımlılık onayı gerekmiyor. |
| Altı rollük topolojiler (başlangıçta) | Kart başına ~21 ajan aktivasyonu. Günlük iş için maliyeti karşılığını vermiyor. İki rolle başla. |
| Çoklu proje / forge katmanı (başlangıçta) | Tek kişi, aynı anda bir-iki iş kolu. Erken genelleme. |

---

## Açık sorular

Bu felsefenin test edilmemiş varsayımları var. Yol haritası bunları sırayla
sınamak üzere kuruldu; cevaplar olumsuz çıkarsa ilke değişir.

1. **Audit gate gerçekten çıktıyı iyileştiriyor mu, yoksa ajan komutu ikinci
   kez mi çalıştırıyor?** Ölçüm: denetim turunda yapılan düzeltmelerin sayısı
   ve niteliği. Düzeltme oranı sıfıra yakınsa mekanizma tören olarak kalıyor
   demektir.

2. **Farklı sağlayıcıyla denetim, aynı sağlayıcıyla denetimden gerçekten daha
   çok bulgu yakalıyor mu?** Bu, projenin merkezi tezi. Ölçüm: aynı görevleri
   hem çapraz-sağlayıcı hem aynı-sağlayıcı denetimden geçirip bulgu sayısını
   ve türünü karşılaştırmak.

3. **Rol ayrımı, iyi bir kontrol listesine sahip tek ajandan daha mı iyi?**
   Ayrı rol, taze bağlam demek — ama aynı zamanda bağlam kaybı ve merge
   maliyeti demek. Ölçüm: iki rollük akış ile tek ajan + denetim promptunun
   aynı görevlerdeki sonucu.

4. **Maliyet karşılığını veriyor mu?** İki rol + audit gate, tek ajanın en az
   4 katı. Yakalanan hata başına maliyet neyi haklı çıkarır?

Bu sorular cevaplanmadan proje büyütülmeyecek.
