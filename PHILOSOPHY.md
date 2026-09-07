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

### 8. Ekran birinci sınıf — ama kazımayla değil, ölçümle beslenir

Hangi iş nerede, hangi ajan ne yapıyor, ne kadar sürdü, ne kadara mal oldu.
Bir merkez ekranı olmadan bu proje kör uçuştur; ekran süs değil, ürünün
kendisidir.

Ayrım şurada: SwarmForge ekranını terminal pane'inin metnini regex'le kazıyarak
besliyordu (`"I'm ..."` içeren son satırı arayarak) — CLI çıktı formatı
değişince sessizce bozulan bir yüzey. Biz aynı ekranı süreç çıkış kodu ve
yapılandırılmış olay günlüğüyle besleyeceğiz.

**tmux'u reddetmek ekranı reddetmek değildir — tam tersi.** Pane kazımayı
bıraktığımız için ekran gerçek veriye dayanabilir: canlı ajan çıktısı, süre,
maliyet, audit tur sayısı, kartın hangi rolde olduğu.

### 9. Topolojiyi kullanıcı yazar

Kaç rol, hangi sırada, hangi sağlayıcı, kapı nerede — bunlar ürünün sabitleri
değil, kullanıcının kararıdır. Sistem bir **şema** ve **örnekler** sunar,
sabit paketler dayatmaz.

İki adımlı da kurulabilmeli, dört adımlı da, altı adımlı da. Rol isimleri
tamamen serbesttir: `coder`, `reviewer`, `security`, `perf`, `docs` — sistem
isme bakıp davranış değiştirmez.

SwarmForge bunun tersini yapıyordu ve bu, topolojiyi değiştirmeyi kırılgan
hale getiriyordu:

- İnsan onay kapısı yalnızca harfiyen `specifier` adlı role bağlıydı; rolü
  yeniden adlandırmak kapıyı **sessizce** yok ediyordu.
- Launcher, rol adına göre sabit kodlu araç listesi enjekte ediyordu; yeni bir
  rol adı vermek o rolü araçsız bırakıyordu.
- İleri yön konfigürasyonda değil, rol promptunun metnine gömülüydü; geri yön
  ise konfigürasyondaydı. İkisinin tutarlılığı hiç doğrulanmıyordu.

Bizde topoloji tek bir bildirimsel dosyadır, doğrulanır ve düzenlenebilir.
Zamanla bunun üstüne bir editör gelir; ama şema ilk günden genel olmalıdır.

---

## Reddettiklerimiz

Bunlar **kalıcı tasarım duruşları** — "henüz değil" değil, "hayır". Her
reddin yerine ne koyduğumuz yazılı; yerine bir şey koymayan red, kısıt olur.

| Reddedilen | Neden | Yerine |
|---|---|---|
| tmux / terminal multiplexer | Ajanları uzun ömürlü interaktif TUI olarak çalıştırma tercihinin sonucu. Protokol zaten durumsuz olduğu için gereksiz; kaldırınca platform bağımlılığı da gidiyor. | İş başına headless süreç + merkezi ekran |
| Pane metni kazıma | Kırılgan. CLI çıktı formatı değişince sessizce bozulur. | Süreç çıkış kodu + yapılandırılmış olay günlüğü |
| İnteraktif TUI ajanlar | Ölçülemiyor, pahalı, platforma bağlı. | Headless çağrı: başlar, işi yapar, çıkar |
| Rol adına gömülü davranış | İsim değişince davranış sessizce kayboluyor; topolojiyi değiştirmek kırılgan hale geliyor. | Serbest rol isimleri; tüm davranış akış tanımında |
| Sabit paketler (2/4/6 dayatması) | Topolojinin derinliği kullanıcının kararı, ürünün sabiti değil. | Genel şema + örnek akışlar + (sonra) editör |
| Kendi CRAP/mutation/DRY araçlarımızı yazmak | Her dilin olgun araçları var, kurumsal build'de zaten mevcutlar. | Dilin standart araçları (Java: JaCoCo, PIT, PMD CPD, ArchUnit) |

### Reddedilmeyen, sadece sıraya konan

Karışmasın diye ayrı: bunlar yol haritasında ileride var, kapsam dışı değil.

- **Derin topolojiler (4, 6, N adım).** Şema ilk günden destekler; sadece
  *örnek olarak* iki rollü akışla başlıyoruz çünkü ilk deneyler ucuz olsun.
- **Akış editörü.** Önce şema ve doğrulama, sonra editör.
- **Çoklu proje.** Tek projeyle başlayıp genelleştireceğiz.

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
