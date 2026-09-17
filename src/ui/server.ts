import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buildDetail, buildModel, type DetailOptions, type UiModel } from "./model.js";
import { PAGE } from "./page.js";

export interface UiServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface ServeUiOptions extends DetailOptions {
  /** 0 = boş port seç. */
  port?: number;
  /**
   * Dinlenecek arayüz. Varsayılan 127.0.0.1 ve bu KASITLI: ekran depo
   * durumunu, kart metinlerini ve ret gerekçelerini gösteriyor. Yerel bir
   * araç, ağa açılan bir servis değil.
   */
  host?: string;
}

/**
 * Ekranın arkasındaki yerel sunucu.
 *
 * İki uç nokta var ve ikisi de OKUR:
 *
 *   GET /            sayfa
 *   GET /durum       panonun modeli
 *   GET /kart/<id>   kartın izi + devredilen commit'in diff özeti
 *
 * Yazan uç nokta yok — kapıyı ekrandan açmak adım 4. Bu kısıt tasarımın
 * kendisi: yüzey durum tutmaz, çekirdeğe komut gönderir (ARCHITECTURE,
 * değişmez 1). Yazma geldiğinde POST olarak gelecek ve komut olarak
 * gidecek.
 */
export async function serveUi(options: ServeUiOptions): Promise<UiServer> {
  const host = options.host ?? "127.0.0.1";

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];

    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("Yalnızca GET — bu yüzey okur, yazmaz.");
      return;
    }

    if (path === "/durum") {
      buildModel(options).then(
        (model: UiModel) => {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            // Model her saniye değişiyor; bayat cevap ekranı yalan söyletir.
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(model));
        },
        (error: unknown) => {
          // Okuma hatası ekranı çökertmemeli: kart dosyası bozuksa bunu
          // söyleyen bir ekran, boş bir ekrandan iyidir.
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path !== undefined && path.startsWith("/kart/")) {
      const id = decodeURIComponent(path.slice("/kart/".length));
      buildDetail(options, id).then(
        (detail) => {
          if (detail === null) {
            res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ hata: `Kart yok: ${id}` }));
            return;
          }
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(detail));
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("yok");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, resolve);
  });

  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: `http://${host}:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
