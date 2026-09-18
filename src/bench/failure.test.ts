import { describe, expect, it } from "vitest";
import { networkFailure } from "./failure.js";

describe("networkFailure", () => {
  // Gerçek koşudan: bayraklar doğruydu, çağrıyı kurumsal vekil kesti ve
  // doctor "bayraklar yanlış olabilir" dedi. Operatör yanlış dosyaya bakar.
  it("vekilin reddettiği CONNECT'i tanır", () => {
    const out =
      "ERROR codex_api: failed to connect to websocket: URL error: " +
      "Proxy connection failed: HTTP CONNECT failed with status 403, url: wss://api.openai.com/v1/responses";
    expect(networkFailure(out)).toMatch(/vekil/);
  });

  it("DNS ve bağlantı hatalarını tanır", () => {
    expect(networkFailure("Error: getaddrinfo ENOTFOUND api.example.com")).toMatch(/ağ hatası/);
    expect(networkFailure("connect ECONNREFUSED 127.0.0.1:443")).toMatch(/ağ hatası/);
  });

  it("TLS ve kimlik doğrulama hatalarını tanır", () => {
    expect(networkFailure("unable to verify the first certificate")).toMatch(/TLS/);
    expect(networkFailure("Not logged in")).toMatch(/kimlik/);
  });

  // Asıl mesele bu: bayrak hatası ağ hatası sanılmamalı, yoksa teşhis
  // bu sefer ters yöne yanıltır.
  it("bayrak hatasını ağ hatası sanmaz", () => {
    expect(networkFailure("error: unexpected argument '--system-prompt' found")).toBeUndefined();
    expect(networkFailure("")).toBeUndefined();
  });
});
