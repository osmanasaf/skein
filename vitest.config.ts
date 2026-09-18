import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Gizli testler koşum takımının testi DEĞİLDİR. Yalnızca bir üretim
    // artefaktının yanında, izole bir dizinde çalışırlar (bench/DESIGN.md).
    // Kökten toplanırlarsa henüz var olmayan artefakta import atıp çökerler.
    // Koşu artefaktları da koşum takımının testi değil: .skein/ altında
    // üretilmiş çözümler ve onlara ait gizli testler duruyor.
    //
    // `.worktrees/` de dışarıda: orkestratör her rol için deponun bir
    // worktree'sini açıyor ve kökten koşan vitest oradaki KOPYALARI da
    // topluyor. Canlı bir koşudan sonra `npm test` 16 dosyada kırmızı
    // yanıyordu; hiçbiri gerçek değildi, hepsi kopyadaki gizli testlerdi.
    exclude: ["node_modules/**", "bench/tasks/**", ".skein/**", ".worktrees/**"],
  },
});
