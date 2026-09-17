// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bloğu bir kusur kancasıdır: kırmızıysa kanıtlanmış bir hata var.
import { describe, expect, it, vi } from "vitest";
import { Store } from "../artifact/src/store.js";
import { apply } from "../artifact/src/apply.js";
import { BOS, type State } from "../artifact/src/state.js";

/** İki olay uygulanmış bir mağaza. */
function iki(): Store {
  const s = new Store();
  s.dispatch({ kind: "ekle", id: "a", label: "A" });
  s.dispatch({ kind: "ekle", id: "b", label: "B" });
  return s;
}

describe("Store.undo", () => {
  it("son olayı geri alır", () => {
    const s = iki();
    s.undo();
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual(["a"]);
  });

  it("geri alındıysa true, geçmiş boşsa false döner", () => {
    const s = new Store();
    expect(s.undo()).toBe(false);
    s.dispatch({ kind: "ekle", id: "a", label: "A" });
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(false);
  });

  it("geçmişi bir olay kısaltır", () => {
    const s = iki();
    s.undo();
    expect(s.history()).toHaveLength(1);
    expect(s.history()[0]).toMatchObject({ kind: "ekle", id: "a" });
  });

  it("arka arkaya iki geri alma boş duruma döner", () => {
    const s = iki();
    s.undo();
    s.undo();
    expect(s.getSnapshot().items).toEqual([]);
    expect(s.history()).toEqual([]);
  });

  it("geri alma sonrası dispatch normal çalışır", () => {
    const s = iki();
    s.undo();
    s.dispatch({ kind: "ekle", id: "c", label: "C" });
    expect(s.getSnapshot().items.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("geri alındığında abone tam bir kez çağrılır", () => {
    const s = iki();
    const spy = vi.fn();
    s.subscribe(spy);
    s.undo();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Klasik kusur: "geri alınacak bir şey yok" yolunda da bildirim atmak.
  // Abone tarafında bu, değişmeyen bir durum için yapılan boş bir yeniden
  // çizimdir ve `version` karşılaştırmasıyla ayıklanamaz.
  it("geçmiş boşken abone çağrılmaz", () => {
    const s = new Store();
    const spy = vi.fn();
    s.subscribe(spy);
    expect(s.undo()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("geçmiş boşken durum nesnesi hiç değişmez", () => {
    const s = new Store();
    const before = s.getSnapshot();
    s.undo();
    expect(s.getSnapshot()).toBe(before);
  });

  // Klasik kusur: geri almayı BOS'tan yeniden oynatarak yapmak. Kod kısa
  // ve doğru görünür, ama `version` geriye düşer.
  it("version geri gitmez", () => {
    const s = iki();
    const before = s.getSnapshot().version;
    s.undo();
    expect(s.getSnapshot().version).toBeGreaterThan(before);
  });

  // Aynı kusurun ikinci yüzü: yeniden oynatma `version`ı tekrar ettirir.
  // İki farklı durum aynı sürümü taşıyınca, sürüme göre önbellekleyen her
  // abone bayat veri gösterir.
  it("version hiçbir zaman tekrar etmez", () => {
    const s = new Store();
    const gorulen: number[] = [];
    s.subscribe((st) => gorulen.push(st.version));
    s.dispatch({ kind: "ekle", id: "a", label: "A" });
    s.dispatch({ kind: "ekle", id: "b", label: "B" });
    s.undo();
    s.dispatch({ kind: "ekle", id: "c", label: "C" });
    s.undo();
    expect(new Set(gorulen).size).toBe(gorulen.length);
  });

  // Klasik kusur: durumu yerinde değiştirmek (items.pop, splice). Test
  // yeşil görünür çünkü mağazanın kendi okuması doğrudur; bozulan şey,
  // daha önce dışarı verilmiş anlık görüntüdür.
  it("daha önce alınmış anlık görüntü geri almadan etkilenmez", () => {
    const s = iki();
    const onceki: State = s.getSnapshot();
    const idler = onceki.items.map((i) => i.id);
    s.undo();
    expect(onceki.items.map((i) => i.id)).toEqual(idler);
    expect(onceki.items).toHaveLength(2);
  });

  it("daha önce alınmış anlık görüntünün version alanı değişmez", () => {
    const s = iki();
    const onceki = s.getSnapshot();
    const v = onceki.version;
    s.undo();
    s.dispatch({ kind: "ekle", id: "c", label: "C" });
    expect(onceki.version).toBe(v);
  });

  // `apply` mağazanın dışında da çağrılıyor; saflığı bu görevin
  // değiştirmeye hakkı olmadığı bir sözleşme.
  it("apply hâlâ saftır — girdisini değiştirmez", () => {
    const before = apply(BOS, { kind: "ekle", id: "a", label: "A" });
    const kopya = { version: before.version, items: [...before.items] };
    apply(before, { kind: "ekle", id: "b", label: "B" });
    expect(before.version).toBe(kopya.version);
    expect(before.items).toHaveLength(kopya.items.length);
  });

  it("mevcut API korunur — dispatch/subscribe/history bozulmaz", () => {
    const s = new Store();
    const spy = vi.fn();
    const cikis = s.subscribe(spy);
    s.dispatch({ kind: "ekle", id: "a", label: "A" });
    s.dispatch({ kind: "bitir", id: "a" });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(s.getSnapshot().items[0]?.done).toBe(true);
    cikis();
    s.dispatch({ kind: "sil", id: "a" });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(s.history()).toHaveLength(3);
  });
});
