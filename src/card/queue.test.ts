import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { tempRoot } from "../testing/temp-root.js";
import { al } from "../testing/queue.js";
import { readdir, readFile, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { knownProviderSet } from "../adapters/factory.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { newCard, rejectCount, serializeCard, type Card } from "./card.js";
import { CardQueue, gateDecision, QueueError } from "./queue.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function topologyOf(name: string): Promise<TopologySnapshot> {
  const flow = await loadFlow(join(repoRoot, "hub", "flows", `${name}.yaml`), {
    root: repoRoot,
    providers: knownProviderSet(),
  });
  return snapshot(flow, repoRoot);
}

let root: string;
let queue: CardQueue;
let daily: TopologySnapshot;
let spec: TopologySnapshot;

beforeEach(async () => {
  root = await tempRoot("skein-queue-");
  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  daily = await topologyOf("daily");
  spec = await topologyOf("spec");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Bir kartı açıp kuyruğa koyar. */
async function put(topology: TopologySnapshot, title = "iş", now?: Date): Promise<Card> {
  const card = newCard({ title, task: "bir şey yap", topology, ...(now ? { now } : {}) });
  await queue.add(card);
  return card;
}

/** Kartın dosya sisteminde kaç yerde göründüğünü sayar. */
async function copiesOf(id: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.includes(id)) found.push(path);
    }
  }
  await walk(join(root, ".skein"));
  return found;
}

describe("CardQueue — temel hareket", () => {
  it("eklenen kart rolün kuyruğunda bekler", async () => {
    const card = await put(daily);
    expect(await queue.depth("coder")).toBe(1);
    expect((await queue.get(card.id))?.state).toBe("queued");
  });

  it("take kartı aktif hâle getirir", async () => {
    const card = await put(daily);
    const taken = await al(queue, "coder");

    expect(taken.id).toBe(card.id);
    expect(taken.state).toBe("active");
    expect(taken.history.at(-1)).toMatchObject({ event: "taken", role: "coder" });
    expect(await queue.depth("coder")).toBe(0);
  });

  it("boş kuyrukta take null döner", async () => {
    expect((await queue.take("coder")).kind).toBe("bos");
  });

  it("başka rolün kuyruğundan kart almaz", async () => {
    await put(daily);
    expect((await queue.take("reviewer")).kind).toBe("bos");
  });

  it("kart her zaman tam olarak bir yerdedir", async () => {
    const card = await put(daily);
    expect(await copiesOf(card.id)).toHaveLength(1);
    await al(queue, "coder");
    expect(await copiesOf(card.id)).toHaveLength(1);
  });

  it("FIFO: önce açılan kart önce alınır", async () => {
    const old = await put(daily, "eski", new Date("2026-09-01T10:00:00Z"));
    const fresh = await put(daily, "yeni", new Date("2026-09-02T10:00:00Z"));

    expect((await al(queue, "coder")).id).toBe(old.id);
    expect((await al(queue, "coder")).id).toBe(fresh.id);
  });
});

describe("CardQueue — ileri yön", () => {
  it("handoff kartı sonraki rolün kuyruğuna taşır", async () => {
    await put(daily);
    const card = await al(queue, "coder");
    const moved = await queue.handoff(card, { commit: "abc1234" });

    expect(moved.role).toBe("reviewer");
    expect(moved.state).toBe("queued");
    expect(moved.history.at(-1)).toMatchObject({
      event: "handoff", from: "coder", to: "reviewer", commit: "abc1234",
    });
    expect(await queue.depth("reviewer")).toBe(1);
  });

  it("zincirin sonunda handoff kartı bitirir", async () => {
    await put(daily);
    await queue.handoff(await al(queue, "coder"), {});
    const done = await queue.handoff(await al(queue, "reviewer"), {});

    expect(done.state).toBe("done");
    expect(done.history.at(-1)).toMatchObject({ event: "done", from: "reviewer" });
    expect(await queue.depth("reviewer")).toBe(0);
  });

  it("kapısı olan rolden sonra kart insan kapısında bekler", async () => {
    await put(spec);
    const card = await al(queue, "analyst");
    const gated = await queue.handoff(card, {});

    expect(gated.state).toBe("gate");
    // Kart henüz coder'a GEÇMEDİ; onay bekliyor.
    expect(gated.role).toBe("analyst");
    expect(await queue.depth("coder")).toBe(0);
  });

  it("kapıdan bırakılan kart sonraki rolün kuyruğuna geçer", async () => {
    await put(spec);
    const gated = await queue.handoff(await al(queue, "analyst"), {});
    const released = await queue.release(gated.id);

    expect(released.role).toBe("coder");
    expect(released.state).toBe("queued");
    expect(released.history.at(-1)).toMatchObject({ event: "released" });
  });

  it("kapıda reddeden insan işi geri gönderir", async () => {
    await put(spec);
    const gated = await queue.handoff(await al(queue, "analyst"), {});
    const back = await queue.release(gated.id, { decision: "back" });

    // analyst zincirin başı: geri dönecek rol yok, işi kendi yeniden yapar.
    // Olan şeyin ADI `retry`; `kapiKarari` bunu böyle bildiriyor ve günlüğe
    // de öyle geçiyor (bkz. release.test.ts). Eskiden `back` yazılıyordu.
    expect(back.role).toBe("analyst");
    expect(back.state).toBe("queued");
  });

  it("aktif olmayan kart devredilemez", async () => {
    const card = await put(daily);
    await expect(queue.handoff(card, {})).rejects.toThrow(QueueError);
  });
});

describe("CardQueue — ret", () => {
  it("ret kartı hedef rolün kuyruğuna geri taşır", async () => {
    await put(daily);
    await queue.handoff(await al(queue, "coder"), {});
    const card = await al(queue, "reviewer");
    const sent = await queue.reject(card, { reason: "yarış koşulu var", commit: "abc1234" });

    expect(sent.role).toBe("coder");
    expect(sent.state).toBe("queued");
    expect(sent.rejects["reviewer->coder"]).toBe(1);
    expect(sent.history.at(-1)).toMatchObject({
      event: "reject", from: "reviewer", to: "coder", round: 1, reason: "yarış koşulu var",
    });
  });

  it("reddedilen kart kuyruğun başına geçer", async () => {
    await put(daily, "reddedilen", new Date("2026-09-02T10:00:00Z"));
    await put(daily, "taze", new Date("2026-09-01T10:00:00Z"));

    const first = await al(queue, "coder"); // taze, daha eski
    await queue.handoff(first, {});
    const reviewed = await al(queue, "reviewer");
    const rejected = await queue.reject(reviewed, { reason: "olmamış" });

    // Kuyrukta daha ESKİ bir kart beklemesine rağmen, geri dönen önce gelir:
    // yarım kalmış işi bitirmek, yenisine başlamaktan önemli.
    expect((await al(queue, "coder")).id).toBe(rejected.id);
  });

  it("gerekçesiz ret reddedilir", async () => {
    await put(daily);
    await queue.handoff(await al(queue, "coder"), {});
    const card = await al(queue, "reviewer");
    await expect(queue.reject(card, { reason: "  " })).rejects.toThrow(/gerekçe/i);
  });

  it("zincirin başı reddedemez", async () => {
    await put(daily);
    const card = await al(queue, "coder");
    await expect(queue.reject(card, { reason: "olmadı" })).rejects.toThrow(/geri dönecek rol/i);
  });

  it("limit dolunca kart insan kapısına çıkar", async () => {
    await put(daily);
    let card = await al(queue, "coder");

    // limit 2: iki ret geçer, üçüncüsü kapıya çıkar.
    for (const round of [1, 2]) {
      await queue.handoff(card, {});
      const sent = await queue.reject(await al(queue, "reviewer"), { reason: `tur ${round}` });
      expect(sent.rejects["reviewer->coder"]).toBe(round);
      card = await al(queue, "coder");
    }

    await queue.handoff(card, {});
    const escalated = await queue.reject(await al(queue, "reviewer"), { reason: "yine olmadı" });

    expect(escalated.state).toBe("gate");
    expect(escalated.history.at(-1)).toMatchObject({ event: "gate", role: "reviewer" });
    expect(await queue.depth("coder")).toBe(0);
  });

  // Kaçış kapısı ile kilit kapısı ikisi de `state: "gate"` bırakıyor ve rolü
  // değiştirmiyor. Farkı kayıt söylüyor; söylemeseydi ileri bırakma sessizce
  // bayat bir ağaç üretirdi.
  describe("kaçış kapısı ≠ onay/kilit kapısı", () => {
    async function escalated(): Promise<Card> {
      await put(daily);
      const card = await al(queue, "coder");
      return queue.escalate(card, "ağaçta işlenmemiş değişiklik var: README.md");
    }

    it("kaçış kapısında ileri bırakmak REDDEDİLİR", async () => {
      const card = await escalated();
      await expect(queue.release(card.id, { decision: "forward" })).rejects.toThrow(
        /kaçış kapısında/,
      );
      // Kart yerinde kaldı: reddedilen bir karar kartı oynatmamalı.
      expect((await queue.get(card.id))?.state).toBe("gate");
    });

    it("hata mesajı sebebi ve çıkış yolunu söyler", async () => {
      const card = await escalated();
      const error = await queue.release(card.id, { decision: "forward" }).catch((e: Error) => e);
      expect(String(error)).toContain("README.md");
      expect(String(error)).toContain("retry");
    });

    it("kaçış kapısının varsayılanı retry — aynı rol baştan koşar", async () => {
      const card = await escalated();
      const released = await queue.release(card.id);
      expect(released.role).toBe("coder");
      expect(released.state).toBe("queued");
      expect(await queue.depth("coder")).toBe(1);
    });

    it("kaçış kapısından geri göndermek serbest", async () => {
      await put(daily);
      await queue.handoff(await al(queue, "coder"), {});
      const card = await queue.escalate(await al(queue, "reviewer"), "verdikt yok");

      const released = await queue.release(card.id, { decision: "back" });

      expect(released.role).toBe("coder");
    });

    it("onay kapısında ileri bırakmak serbest — kod zaten taşındı", async () => {
      await put(spec);
      const card = await al(queue, "analyst");
      const gated = await queue.handoff(card, { commit: "abc1234" });
      expect(gated.state).toBe("gate");

      const released = await queue.release(gated.id, { decision: "forward" });

      expect(released.role).toBe("coder");
    });
  });

  it("kapıdaki kilidi insan iki yönde de çözebilir", async () => {
    /** daily akışında kartı ret limiti dolana kadar döndürür. */
    async function deadlock(): Promise<Card> {
      await put(daily);
      let card = await al(queue, "coder");
      for (let i = 0; i < 2; i++) {
        await queue.handoff(card, {});
        await queue.reject(await al(queue, "reviewer"), { reason: `tur ${i + 1}` });
        card = await al(queue, "coder");
      }
      await queue.handoff(card, {});
      return queue.reject(await al(queue, "reviewer"), { reason: "yine olmadı" });
    }

    // "Denetçi haklı" — iş üreticiye döner, sayaç sıfırlanmış olarak.
    const back = await queue.release((await deadlock()).id, { decision: "back" });
    expect(back.role).toBe("coder");
    expect(rejectCount(back, "reviewer", "coder")).toBe(0);

    // "Üretici haklı" — kart denetçiyi geçer ve biter.
    const forward = await queue.release((await deadlock()).id, { decision: "forward" });
    expect(forward.state).toBe("done");
  });

  it("reddeden rol kabul edince o kenarın sayacı sıfırlanır", async () => {
    await put(daily);
    await queue.handoff(await al(queue, "coder"), {});
    await queue.reject(await al(queue, "reviewer"), { reason: "olmadı" });

    const fixed = await al(queue, "coder");
    expect(rejectCount(fixed, "reviewer", "coder")).toBe(1);

    await queue.handoff(fixed, {});
    const accepted = await queue.handoff(await al(queue, "reviewer"), {});
    // Sayaç sıfırlanmıyor, anahtar siliniyor: kart ölü sıfırlar biriktirmesin.
    expect(rejectCount(accepted, "reviewer", "coder")).toBe(0);
    expect(Object.keys(accepted.rejects)).toEqual([]);
  });
});

describe("CardQueue — çökme ve yarış", () => {
  // Hata mesajı TEŞHİS taşımalı. Eski iddia yalnızca "kaç tanesi null değil"
  // diye bakıyordu ve Windows'ta kırıldığında hangi şeyin kırıldığı
  // anlaşılamadı — "ikisi de kart aldı" iki ayrı şey olabilir:
  //   · aynı kart iki kez alındı  → çekirdekte yarış, ciddi
  //   · kuyrukta iki kart vardı   → sınamanın kendi kusuru
  // Kimlikleri karşılaştırmak ikisini ayırıyor.
  it("aynı kartı iki koşucu birden alamaz", async () => {
    const card = await put(daily);
    expect(await queue.depth("coder")).toBe(1);

    const [a, b] = await Promise.all([queue.take("coder"), queue.take("coder")]);
    const alinan = [a, b].flatMap((r) => (r.kind === "alindi" ? [r.card] : []));
    // Tek bir kimlik beklenir. İki kez aynı kimlik çıkarsa yarış, iki ayrı
    // kimlik çıkarsa kuyruk kurgusu bozuk — mesaj ikisini de gösterir.
    expect(alinan.map((c) => c.id).join(" + ")).toBe(card.id);
    expect(await queue.depth("coder")).toBe(0);
    // Yarışı KAYBEDEN taraf SESSİZ kalmalı: ENOENT engel değil, normaldir.
    // Engel sayılsaydı her eşzamanlı tur yanlış alarm basardı — ve kusurun
    // kendisi "bildiğinden az söyleyen rapor"un tersi, "bilmediğini söyleyen
    // rapor" olurdu. (Bu satır olmadan "ENOENT'i de engel say" mutasyonu
    // hayatta kalıyordu.)
    expect([a, b].filter((r) => r.kind === "engel")).toEqual([]);
    expect([a, b].filter((r) => r.kind === "bos")).toHaveLength(1);
  });

  // Yarışı KAYBEDEN taraf nazikçe `null` dönmek zorunda: `#scan` dizini
  // listeleyip SONRA dosyaları okuyor, arada öteki `take` dosyayı yeniden
  // adlandırmış olabilir. Eskiden ENOENT taramadan dışarı fırlıyordu ve
  // `take` çöküyordu — gözcü süreci bir kartı kaçırmakla kalmayıp ölürdü.
  // Canlı bir zorlamada yığın iziyle görüldü (`#scan` → `#readCard` →
  // `readFile` ENOENT).
  //
  // Yarıştırarak sınanmıyor ve bu bilinçli: pencere o kadar dar ki 450
  // turluk zorlamada bir kez bile yakalanmadı. Yarışa dayanan bir sınama
  // ısırmıyor, yani güven vermesi sahte olurdu. Onun yerine `readdir`'in
  // LİSTELEDİĞİ ama `readFile`'ın ENOENT verdiği durum doğrudan kuruluyor:
  // kopuk bir sembolik bağ. Windows'ta sembolik bağ ayrıcalık istiyor, o
  // yüzden orada atlanıyor.
  it.skipIf(process.platform === "win32")(
    "taramada kaybolmuş dosya kartı düşürmez, çökmez",
    async () => {
      const card = await put(daily);
      const [actual] = await copiesOf(card.id);
      // Aynı dizinde, var olmayan bir hedefe işaret eden bir `.json`.
      await symlink(join(dirname(actual as string), "yok.json"),
        join(dirname(actual as string), "0-kopuk.json"));

      // Kopuk bağ atlanıyor, gerçek kart alınıyor.
      expect((await al(queue, "coder")).id).toBe(card.id);

      // Kart kalmayınca da çökmüyor: null dönüyor.
      expect((await queue.take("coder")).kind).toBe("bos");
    },
  );

  /**
   * `take` her `rename` hatasını yarış sanıyordu.
   *
   * Eski hâli `catch { continue; }` idi: ENOENT (yarışı kaybettik) ile
   * EACCES/EPERM/EBUSY/EXDEV/ENOSPC arasında hiç ayrım yoktu. Kart
   * kuyrukta kalıyor, `take` "kuyruk boş" diyor, hiçbir yere tek satır
   * teşhis yazılmıyordu — kart sonsuza kadar duruyordu.
   *
   * Engel şöyle kuruluyor: hedef ADA sahip bir DİZİN yaratılıyor, yani
   * `rename` dosyayı oraya taşıyamıyor (Linux'ta EISDIR, Windows'ta
   * EPERM/EACCES). "Yolda duran bir şey" senaryosunun taşınabilir hâli —
   * Windows'ta virüs tarayıcısının açık tuttuğu dosya da buraya düşüyor.
   */
  it("yarış OLMAYAN rename hatası engel olarak bildiriliyor", async () => {
    const card = await put(daily);
    // Hedef adı bir dizin: rename oraya taşıyamaz.
    await mkdir(join(root, ".skein", "active", "coder", `${card.id}.json`), { recursive: true });

    const result = await queue.take("coder");

    expect(result.kind).toBe("engel");
    if (result.kind !== "engel") throw new Error("engel beklendi");
    expect(result.blockages).toHaveLength(1);
    // Teşhis kodu ve dosyayı İÇERMELİ: "alınamadı" tek başına hiçbir yere
    // götürmez.
    expect(result.blockages[0]?.code).not.toBe("ENOENT");
    expect(result.blockages[0]?.code).not.toBe("?");
    expect(result.blockages[0]?.path).toContain(card.id);
    // Kart KUYRUKTA kalmış olmalı: kaybolmadı, yalnızca alınamadı.
    expect(await queue.depth("coder")).toBe(1);
  });

  // "Boş" ile "alınamadı" yapısal olarak ayrı olmalı; eski imza (`Card |
  // null`) ikisini aynı değere eziyordu.
  it("boş kuyruk ile alınamayan kuyruk aynı sonuç değil", async () => {
    expect((await queue.take("coder")).kind).toBe("bos");
  });

  // Bir kart alınırken BAŞKA kartın alınamaması da kaybolmamalı.
  it("alınan kart engelleri gizlemiyor", async () => {
    const engelli = await put(daily, "engelli", new Date("2026-01-01T00:00:00Z"));
    const robust = await put(daily, "sağlam", new Date("2026-01-02T00:00:00Z"));
    await mkdir(join(root, ".skein", "active", "coder", `${engelli.id}.json`), { recursive: true });

    const result = await queue.take("coder");

    expect(result.kind).toBe("alindi");
    if (result.kind !== "alindi") throw new Error("alindi beklendi");
    expect(result.card.id).toBe(robust.id);
    expect(result.blockages.map((e) => e.path.includes(engelli.id))).toEqual([true]);
  });

  // Kaybolan dosya iyi huylu, BOZUK dosya değil: ikincisi veri kaybı ve
  // sessizce atlanırsa kart yok sayılır.
  // İZOLE ET AMA SAKLAMA. Eskiden bozuk dosya `#scan`'den fırlıyordu ve
  // `#scan` dört alanı da tarıyor: `done/` altındaki bitmiş bir kartın
  // bozuk kaydı `recover()`'ı fırlatıyordu. `serve`'in süpürmesinde
  // try/catch olmadığı için gözcü ÖLÜYOR, yeniden başlatmada kilitten
  // sonraki ilk iş yine `recover()` olduğu için gözcü artık hiçbir akış
  // için açılamıyordu.
  it("bozuk dosya ilgisiz kartı engellemiyor", async () => {
    const robust = await put(daily);
    await writeFile(join(root, ".skein", "queue", "coder", "0-000000000000000-c-bozuk.json"), "{ değil");

    // Sağlam kart alınabiliyor: bir bozuk dosya kuyruğu tutmuyor.
    expect((await al(queue, "coder")).id).toBe(robust.id);
  });

  it("bozuk dosya SESSİZ geçmiyor: yolu bildiriliyor", async () => {
    await put(daily);
    const filePath = join(root, ".skein", "queue", "coder", "0-000000000000000-c-bozuk.json");
    await writeFile(filePath, "{ değil");

    expect(await queue.bozuklar()).toEqual([filePath]);
  });

  // Aranan kart bozuk olanlardan biri OLABİLİR: "böyle bir kart yok"
  // demek veri kaybını yokluk gibi okutmak olurdu.
  it("aranan kart yoksa ve bozuk dosya varsa hata veriyor", async () => {
    const dirPath = join(root, ".skein", "queue", "coder");
    await mkdir(dirPath, { recursive: true });
    await writeFile(join(dirPath, "0-000000000000000-c-bozuk.json"), "{ değil");
    await expect(queue.get("c-20260101-aaaaaa")).rejects.toThrow(/okunamıyor/);
  });

  // `recover` artık bozuk dosyada durmuyor: kilitten sonraki ilk iş o ve
  // fırlatması gözcüyü kalıcı olarak açılamaz hâle getiriyordu.
  it("recover bozuk dosyaya rağmen koşuyor", async () => {
    await put(daily);
    const card = await al(queue, "coder");
    await mkdir(join(root, ".skein", "done"), { recursive: true });
    await writeFile(join(root, ".skein", "done", "c-bozuk.json"), "{ değil");

    const recovered = await queue.recover();
    expect(recovered.map((c) => c.id)).toEqual([card.id]);
  });

  it("recover yarıda kalan aktif kartı kuyruğa geri koyar", async () => {
    await put(daily);
    const card = await al(queue, "coder");

    const recovered = await queue.recover();
    expect(recovered.map((c) => c.id)).toEqual([card.id]);
    expect((await queue.get(card.id))?.state).toBe("queued");
    expect((await queue.get(card.id))?.history.at(-1)).toMatchObject({ event: "requeued" });
  });

  it("recover kopyayı uzun geçmişli olanı tutarak çözer", async () => {
    await put(daily);
    const card = await al(queue, "coder");
    const moved = await queue.handoff(card, { commit: "abc" });

    // Taşıma tamamlandıktan SONRA kaynak dosyanın silinemediği hâli kur:
    // yeniden adlandırma ile unlink arasında çöken bir süreç tam olarak
    // bunu bırakır.
    const stale = join(root, ".skein", "active", "coder", `${card.id}.json`);
    await mkdir(dirname(stale), { recursive: true });
    await writeFile(stale, serializeCard(card));
    expect(await copiesOf(card.id)).toHaveLength(2);

    await queue.recover();

    const copies = await copiesOf(card.id);
    expect(copies).toHaveLength(1);
    const kept = (await queue.get(card.id)) as Card;
    expect(kept.role).toBe("reviewer");
    expect(kept.history).toHaveLength(moved.history.length);
  });


});

describe("CardQueue — listeleme", () => {
  it("list tüm kartları durumlarıyla döner", async () => {
    const a = await put(daily, "a", new Date("2026-09-01T10:00:00Z"));
    const b = await put(daily, "b", new Date("2026-09-02T10:00:00Z"));
    await al(queue, "coder");

    const all = await queue.list();
    expect(all.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(all.find((c) => c.id === a.id)?.state).toBe("active");
    expect(all.find((c) => c.id === b.id)?.state).toBe("queued");
  });

  it("olmayan kart null döner", async () => {
    expect(await queue.get("c-20260101-aaaaaa")).toBeNull();
  });

  it("init iki kez çağrılabilir", async () => {
    await queue.init();
    expect(await queue.list()).toEqual([]);
  });

  it("kart dosyaları .skein altında kalır", async () => {
    const card = await put(daily);
    const files = await readdir(join(root, ".skein", "queue", "coder"));
    expect(files).toHaveLength(1);
    expect(await readFile(join(root, ".skein", "queue", "coder", files[0] as string), "utf8"))
      .toContain(card.id);
  });
});

/**
 * Kapı kararı TEK yerden hesaplanmalı.
 *
 * Eskiden iki yerde hesaplanıyordu: `queue.release` hedefi, `releaseCard`
 * ise günlüğe yazdığı kararı — aynı varsayılan ifadesi iki dosyada ayrı
 * yazılıydı ve `back` hedefi olmadığında ayrışıyorlardı. Bu birlik
 * (`kapiKarari`) hem hedefi hem kararın ADINI veriyor, yani ikisi
 * ayrışamıyor.
 */
describe("kapiKarari", () => {
  /** Kartı `role` üzerinde kaçış kapısına koyar. */
  async function atGate(topology: TopologySnapshot, chain: string[]): Promise<Card> {
    await put(topology);
    let card = await al(queue, chain[0] as string);
    for (const nextOne of chain.slice(1)) {
      await queue.handoff(card, {});
      card = await al(queue, nextOne);
    }
    return queue.escalate(card, "verdikt yok");
  }

  it("hedefi olmayan back retry olur ve ADI da retry'dir", async () => {
    const card = await atGate(daily, ["coder"]);

    const verdict = gateDecision(card, "back");

    expect(verdict).toMatchObject({
      kind: "escalation",
      requested: "back",
      applied: "retry",
      target: "coder",
    });
  });

  it("hedefi olan back aynen uygulanır", async () => {
    const card = await atGate(daily, ["coder", "reviewer"]);

    const verdict = gateDecision(card, "back");

    expect(verdict).toMatchObject({ requested: "back", applied: "back", target: "coder" });
  });

  // Varsayılan artık tek yerde: kaçışta `retry`, diğerlerinde `forward`.
  it("karar verilmezse kapının varsayılanı kullanılır", async () => {
    const card = await atGate(daily, ["coder"]);
    expect(gateDecision(card)).toMatchObject({ requested: "retry", applied: "retry" });
  });

  // `release` ile AYNI kaynaktan okunduğunun kanıtı: hedef gerçekten
  // kartın gittiği yer olmalı.
  it("hedef, kartın gerçekten gittiği rol", async () => {
    const card = await atGate(daily, ["coder", "reviewer"]);
    const verdict = gateDecision(card, "back");

    const released = await queue.release(card.id, { decision: "back" });

    expect(released.role).toBe(verdict.target);
  });

  it("hedefsiz back'te de hedef kartın gittiği rol", async () => {
    const card = await atGate(daily, ["coder"]);
    const verdict = gateDecision(card, "back");

    const released = await queue.release(card.id, { decision: "back" });

    expect(released.role).toBe(verdict.target);
    expect(released.role).toBe("coder");
  });
});

/**
 * `close` kopyaları ÇÖZMÜYORDU.
 *
 * Kural üç yerde gerekiyor ve üçüncüsünde yazılı değildi: `close`
 * `found[0]` alıyordu, yani tarama sırasının verdiği rastgele kopyayı.
 * İki yönlü bedel: bayat kopya arşivlenip güncel olan kuyrukta kalıyor,
 * ve insan "Kartı kapat" dedikten sonra kart panoda DURMAYA devam ediyor
 * — kapatma kapatmıyor.
 */
describe("close — kopya kartlar", () => {
  /**
   * Kartın BAYAT bir kopyasını `active/` ya da kuyrukta bırakır.
   *
   * Gerçekte bu, yeniden adlandırma ile unlink arasında çöken bir sürecin
   * bıraktığı hâl (bkz. recover sınaması).
   */
  async function staleCopy(card: Card, field: string, theRole: string): Promise<string> {
    const filePath = join(root, ".skein", field, theRole, `${card.id}.json`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, serializeCard(card));
    return filePath;
  }

  it("geçmişi uzun olanı kapatıyor, bayatı kapatmıyor", async () => {
    await put(daily);
    const recent = await al(queue, "coder");
    const advanced = await queue.handoff(recent, { commit: "abc" });
    // `taze` geçmişi KISA olan kopya; `ilerlemis` uzun olan.
    await staleCopy(recent, "active", "coder");
    expect(await copiesOf(recent.id)).toHaveLength(2);

    const closed = await queue.close(recent.id, "akışta karşılığı yok");

    // Kapatılan şey İLERLEMİŞ kart olmalı: bayat kopya arşivlenirse
    // kartın gerçek geçmişi çöpe gider.
    expect(closed.history.length).toBeGreaterThan(recent.history.length);
    expect(closed.history.at(-1)).toMatchObject({ event: "done", reason: "akışta karşılığı yok" });
  });

  it("kapatma gerçekten kapatıyor: kopya kuyrukta kalmıyor", async () => {
    await put(daily);
    const recent = await al(queue, "coder");
    await queue.handoff(recent, { commit: "abc" });
    await staleCopy(recent, "active", "coder");

    await queue.close(recent.id, "akışta karşılığı yok");

    // Tek kopya kalmalı ve o da `done/` altında. Eskiden bayat kopya
    // kuyrukta kalıyor, kart panoda durmaya devam ediyordu.
    const remaining = await copiesOf(recent.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain(join(".skein", "done"));
    expect((await queue.list()).filter((c) => c.id === recent.id && c.state !== "done")).toEqual([]);
  });

  /**
   * Bayat AKTİF kopya kapatmayı engellememeli.
   *
   * İlk yazımda "herhangi bir kopya aktifse reddet" yaptım ve bu sınama
   * onu düşürdü: `active/` altında kalmış kopya tam olarak ÇÖPTÜR —
   * yeniden adlandırma ile unlink arasında çökmüş bir süreç bırakır.
   * Ona bakmak, çökme sonrası yetim kartı kapatmayı, yani bu düğmenin tek
   * işini imkânsız kılardı. Kazanan ileri gitmişse tur tamamlanmıştır.
   */
  it("bayat aktif kopya kapatmayı engellemiyor", async () => {
    await put(daily);
    const recent = await al(queue, "coder");
    const advanced = await queue.handoff(recent, { commit: "abc" });
    expect(advanced.state).toBe("queued");
    // `taze` zaten `state: "active"`: gerçek çökme kalıntısı böyle görünür.
    await staleCopy(recent, "active", "coder");

    const closed = await queue.close(recent.id, "akışta karşılığı yok");

    expect(closed.state).toBe("done");
    expect(await copiesOf(recent.id)).toHaveLength(1);
  });

  // KAZANAN aktifse kapatma yok: o turun parası ödeniyor olabilir.
  it("kazanan aktifse kapatmıyor", async () => {
    await put(daily);
    const active = await al(queue, "coder");
    // Kazanan `active/` altında ve geçmişi en uzun; kuyrukta kısa geçmişli
    // bir kopya var.
    await staleCopy({ ...active, history: active.history.slice(0, 1), state: "queued" },
      "queue", "coder");

    await expect(queue.close(active.id, "gerekçe")).rejects.toThrow(/koşuyor/);
    // Reddedilen kapatma hiçbir kopyayı silmemeli.
    expect(await copiesOf(active.id)).toHaveLength(2);
  });
});
