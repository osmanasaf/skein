// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
//
// Görev metni tek bir değişmez ilan ediyor (gidiş-dönüş) ama hangi
// girdilerde sınanacağını söylemiyor. Buradaki girdiler o sessizliği
// doldurur: hepsi değişmezden TÜRETİLEBİLİR, hiçbiri yazılı değil.
import { describe, expect, it } from "vitest";
import { parse, serialize } from "../artifact/src/csv.js";

/** Değişmezin kendisi: tek ölçüt bu. */
const tur = (rows: string[][]): string[][] => parse(serialize(rows));

describe("parse/serialize", () => {
  it("düz satırları okur", () => {
    expect(parse("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("tırnaklı alandaki virgülü ayraç saymaz", () => {
    expect(parse('a,"b,c"')).toEqual([["a", "b,c"]]);
  });

  it("tırnaklı alandaki satır sonunu ayraç saymaz", () => {
    expect(parse('"a\nb",c')).toEqual([["a\nb", "c"]]);
  });

  it("ikilenmiş tırnağı tek tırnak olarak okur", () => {
    expect(parse('"a""b"')).toEqual([['a"b']]);
  });

  it("\\r\\n satır ayracını kabul eder", () => {
    expect(parse("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("alanları kırpmaz", () => {
    expect(parse(" a , b ")).toEqual([[" a ", " b "]]);
  });

  it("sondaki boş alanı düşürmez", () => {
    expect(parse("a,")).toEqual([["a", ""]]);
  });

  // Buradan aşağısı değişmezin kendisi. Girdiler görev metninde yok.

  it("gidiş-dönüş: düz satırlar", () => {
    const rows = [["a", "b"], ["c", "d"]];
    expect(tur(rows)).toEqual(rows);
  });

  // Klasik kusur: serialize sona satır sonu ekler; parse fazladan bir
  // satır görür. Tek başına hiçbir testi bozmaz, gidiş-dönüşü bozar.
  it("gidiş-dönüş: satır sayısı artmaz", () => {
    expect(tur([["a"], ["b"], ["c"]])).toHaveLength(3);
  });

  it("gidiş-dönüş: virgül içeren alan", () => {
    const rows = [["a,b", "c"]];
    expect(tur(rows)).toEqual(rows);
  });

  it("gidiş-dönüş: tırnak içeren alan", () => {
    const rows = [['a"b', 'c""d']];
    expect(tur(rows)).toEqual(rows);
  });

  // Yalnızca tırnaktan oluşan alan: kaçırma mantığının en dar yeri.
  it("gidiş-dönüş: yalnızca tırnaklardan oluşan alan", () => {
    const rows = [['"'], ['""'], ['"""']];
    expect(tur(rows)).toEqual(rows);
  });

  it("gidiş-dönüş: satır sonu içeren alan", () => {
    const rows = [["a\nb"], ["c"]];
    expect(tur(rows)).toEqual(rows);
  });

  it("gidiş-dönüş: \\r\\n içeren alan aynen döner", () => {
    const rows = [["a\r\nb", "c"]];
    expect(tur(rows)).toEqual(rows);
  });

  it("gidiş-dönüş: baştaki ve sondaki boşluk korunur", () => {
    const rows = [["  a", "b  "], [" ", "\t"]];
    expect(tur(rows)).toEqual(rows);
  });

  // Klasik kusur: boş alanlardan oluşan satır serialize edilince boş
  // metin olur ve parse ya boş dizi ya da yanlış sayıda alan döndürür.
  it("gidiş-dönüş: tek boş alanlı tek satır", () => {
    const rows = [[""]];
    expect(tur(rows)).toEqual(rows);
  });

  it("gidiş-dönüş: tamamen boş alanlardan oluşan satırlar", () => {
    const rows = [["", ""], [""], ["a", ""]];
    expect(tur(rows)).toEqual(rows);
  });

  it("gidiş-dönüş: virgül, tırnak ve satır sonu aynı alanda", () => {
    const rows = [['a,"b"\nc', "d"]];
    expect(tur(rows)).toEqual(rows);
  });
});
