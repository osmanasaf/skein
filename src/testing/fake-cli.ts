import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FakeCliSpec {
  /** stdin'den okunanı bu dosyaya yazar. */
  stdinTo?: string;
  /** Çalışma dizinini bu dosyaya yazar. */
  cwdTo?: string;
  stdout?: string;
  stderr?: string;
  exit?: number;
  /** Çıkmadan önce bu kadar bekler — timeout ve süreç ağacı testleri için. */
  sleepMs?: number;
  /** `--help` çağrısında basılacak metin. Bayrak tespitini sınamak için. */
  help?: string;
}

/**
 * Gerçek API çağırmadan bir sağlayıcı CLI'ı taklit eder.
 *
 * Önceden `#!/bin/sh` script'iydi ve Windows'ta hiç çalışmıyordu: testlerin
 * yarısı ürün kodu doğru olduğu halde kırmızı yanıyordu. Artık mantık bir
 * Node script'inde, yanına platforma uygun ince bir başlatıcı yazılıyor
 * (`.sh` ya da `.cmd`), böylece adaptör onu normal bir ikili gibi çağırıyor.
 */
export async function makeFakeCli(dir: string, spec: FakeCliSpec): Promise<string> {
  const stamp = `fake-${Math.random().toString(36).slice(2)}`;
  const script = join(dir, `${stamp}.mjs`);

  await writeFile(
    script,
    `import { writeFile } from "node:fs/promises";
const spec = ${JSON.stringify(spec)};
// Gerçek bir CLI gibi: --help anında döner, stdin okumaz, uyumaz.
if (process.argv.includes("--help")) {
  process.stdout.write(spec.help ?? "");
  process.exit(0);
}
let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
if (spec.stdinTo) await writeFile(spec.stdinTo, input);
if (spec.cwdTo) await writeFile(spec.cwdTo, process.cwd());
if (spec.stdout) process.stdout.write(spec.stdout);
if (spec.stderr) process.stderr.write(spec.stderr);
if (spec.sleepMs) await new Promise((r) => setTimeout(r, spec.sleepMs));
process.exit(spec.exit ?? 0);
`,
  );

  if (process.platform === "win32") {
    const cmd = join(dir, `${stamp}.cmd`);
    await writeFile(cmd, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
    return cmd;
  }
  const sh = join(dir, `${stamp}.sh`);
  await writeFile(sh, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  await chmod(sh, 0o755);
  return sh;
}
