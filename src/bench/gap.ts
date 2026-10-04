import type { SkeinEvent } from "../events/log.js";
import { scoredCells } from "./effect.js";
import { classifiedCells } from "./noise.js";

/**
 * İKİ KATMANIN ARASINDAN DÜŞEN BULGU.
 *
 * Tasarım iki yer gerçeğini bilerek ayırıyor: 1. katman (`judge.scored`)
 * kanıtlanmış kusurların kaçını raporun söylediğini ölçer; 2. katman
 * (`judge.classified`) gizli testin göremediği bulguları gerçek/nit/yanlış
 * diye ayırır ve kanıtlanmış kusura ait bulguları oranların DIŞINDA tutar,
 * çünkü o soru 1. katmanın alanı.
 *
 * Ayrım doğru, ama bir boşluk bırakıyor ve 4 Ekim'deki ilk çapraz satıcı
 * koşusu onu üretti: codex, claude'un kodunda belgelenmiş bir değişmezin
 * (`getSnapshot()` aynı sürüm için aynı nesneyi döndürür) gerçek ihlalini
 * buldu. 1. katmanın hakemi "iki kancadan hiçbirini söylemiyor" dedi
 * (kaçırma), 2. katmanın hakemi aynı bulguyu "kanıtlanmışa ait" sayıp
 * oranlardan dışladı. Sonuç: gerçek bir bulgu HİÇBİR YERE düşmedi.
 *
 * Bu, iki katmanı harmanlamak için sebep değil — harmanlamak zayıf katmanın
 * gücünü güçlüden ödünç almasıdır. Sebep, boşluğun GÖRÜNÜR olması: o
 * hücreler insanın okuması gereken sınır vakalarıdır.
 */
export interface LayerGap {
  taskId: string;
  cell: string;
  producer: string;
  reviewer: string;
  crossed: boolean;
  /** Bu üretimde kanıtlanmış kusur sayısı. */
  hooks: number;
  /** 1. katmanın kredilediği kanıtlanmış kusur sayısı. */
  caught: number;
  /** 2. katmanın kanıtlanmışa ait sayıp oranlardan dışladığı bulgu sayısı. */
  proven: number;
}

/**
 * 2. katmanın kanıtlanmışa saydığı bulgu sayısı, 1. katmanın
 * kredilediğinden fazlaysa aradan bir şey düşmüştür.
 *
 * Ters yön (1. katman daha çok kredilemiş) boşluk değil: tek bir bulgu iki
 * kancayı birden söyleyebilir.
 */
export function layerGaps(events: SkeinEvent[]): LayerGap[] {
  const anahtar = (runId: string, cell: string): string => `${runId}\u0000${cell}`;
  const puanli = new Map(scoredCells(events).map((c) => [anahtar(c.runId, c.cell), c]));
  const out: LayerGap[] = [];
  for (const s of classifiedCells(events)) {
    const p = puanli.get(anahtar(s.runId, s.cell));
    if (p === undefined) continue;
    const caught = p.hooks - p.missed;
    if (s.proven <= caught) continue;
    out.push({
      taskId: s.taskId, cell: s.cell, producer: s.producer, reviewer: s.reviewer,
      crossed: s.crossed, hooks: p.hooks, caught, proven: s.proven,
    });
  }
  return out;
}
