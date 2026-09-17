// REFERANS ÇÖZÜM — `hidden/` altında, yani üretici bunu asla görmez.
// Amacı kancaların *karşılanabilir* olduğunu kanıtlamak: hepsi yeşile
// dönmeyen bir kanca, kusur değil bozuk testtir ve ölçümü sessizce şişirir.
// `cli.ts selftest async-pool` bu dosyayı gizli süite karşı koşar.
export async function runPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit en az 1 olmalı: ${limit}`);
  }
  const results = new Array<T>(tasks.length);
  let next = 0;
  let failure: { error: unknown } | undefined;

  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]!();
      } catch (error) {
        failure ??= { error };
        return;
      }
    }
  };

  // Her işçi kendi hatasını yutar, bu yüzden `Promise.all` yalnızca "hepsi
  // durdu" demek için kullanılır: reddetme, uçan işi arkada bırakmaz.
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  if (failure !== undefined) throw failure.error;
  return results;
}
