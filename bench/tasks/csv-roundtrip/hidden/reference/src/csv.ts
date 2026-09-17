// REFERANS ÇÖZÜM — `hidden/` altında, yani üretici bunu asla görmez.
// Kancaların karşılanabilir olduğunu kanıtlar; `cli.ts selftest` koşar.

/** Tırnaklanması gereken alanları tırnaklar, içteki tırnağı ikiler. */
function alan(f: string): string {
  return /["\n\r,]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f;
}

export function serialize(rows: readonly (readonly string[])[]): string {
  // Sona satır sonu EKLENMEZ: eklenirse parse fazladan bir satır görür ve
  // gidiş-dönüş bozulur. Değişmezin en kolay kaçırılan sonucu bu.
  return rows.map((r) => r.map(alan).join(",")).join("\n");
}

export function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const satirBitir = (): void => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };

  while (i < text.length) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r" && text[i + 1] === "\n") { satirBitir(); i += 2; continue; }
    if (c === "\n") { satirBitir(); i++; continue; }
    field += c; i++;
  }

  // Boş metin bile tek boş alanlı tek satırdır: serialize([[""]]) === ""
  // olduğu için gidiş-dönüş bunu zorunlu kılıyor.
  satirBitir();
  return rows;
}
