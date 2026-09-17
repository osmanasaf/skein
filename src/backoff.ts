/** attempt. deneme icin ustel gecikme: baseMs * 2^attempt. */
export function backoff(attempt: number, baseMs: number): number {
  if (attempt < 0) throw new RangeError(`attempt negatif olamaz: ${attempt}`);
  return baseMs * 2 ** attempt;
}
