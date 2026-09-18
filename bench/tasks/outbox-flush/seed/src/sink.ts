export interface Mesaj {
  readonly id: string;
  readonly govde: string;
}

/**
 * Mesajı karşı tarafa ileten taşıyıcı.
 *
 * **En az bir kez** teslim eder ve **kimliğe göre tekilleştirir**:
 *
 *  - Aynı kimlikle ikinci kez gönderilen mesaj karşı tarafta yok sayılır.
 *  - Farklı kimlikle gönderilen AYNI gövde, iki ayrı mesajdır ve karşı
 *    tarafa İKİ KEZ teslim edilir.
 *  - `send` reddettiğinde mesajın teslim edilip edilmediği bilinmez:
 *    reddin sebebi ağ da olabilir, yalnızca kaybolan onay da.
 */
export interface Sink {
  send(mesaj: Mesaj): Promise<void>;
}
