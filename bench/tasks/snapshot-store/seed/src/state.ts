/**
 * Mağazanın tuttuğu durum. Hiçbir yerde yerinde değiştirilmez: her olay
 * yeni bir nesne üretir. `version` bu yeni nesnenin kimliğidir.
 */
export interface State {
  readonly version: number;
  readonly items: readonly Item[];
}

export interface Item {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
}

export type Event =
  | { readonly kind: "ekle"; readonly id: string; readonly label: string }
  | { readonly kind: "bitir"; readonly id: string }
  | { readonly kind: "sil"; readonly id: string };

export const BOS: State = { version: 0, items: [] };
