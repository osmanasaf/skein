import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Gizli testler koşum takımının testi DEĞİLDİR. Yalnızca bir üretim
    // artefaktının yanında, izole bir dizinde çalışırlar (bench/DESIGN.md).
    // Kökten toplanırlarsa henüz var olmayan artefakta import atıp çökerler.
    // Koşu artefaktları da koşum takımının testi değil: .skein/ altında
    // üretilmiş çözümler ve onlara ait gizli testler duruyor.
    exclude: ["node_modules/**", "bench/tasks/**", ".skein/**"],
  },
});
