import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { PipedChild } from "../proc/process.js";
import { browserCommand, openBrowser } from "./open-browser.js";

describe("tarayiciKomutu", () => {
  it("macOS'ta `open` kullanır", () => {
    expect(browserCommand("darwin", "http://x")).toEqual({ command: "open", args: ["http://x"] });
  });

  it("Windows'ta kabuk yerleşiği değil, `cmd /c start` kullanır", () => {
    // `start` tek başına kabuk yerleşiği — çıplak spawn ENOENT verirdi.
    expect(browserCommand("win32", "http://x"))
      .toEqual({ command: "cmd", args: ["/c", "start", '""', "http://x"] });
  });

  it("Linux'ta `xdg-open` kullanır", () => {
    expect(browserCommand("linux", "http://x")).toEqual({ command: "xdg-open", args: ["http://x"] });
  });

  it("tanınmayan bir platformda da (örn. freebsd) Linux yoluna düşer", () => {
    expect(browserCommand("freebsd" as NodeJS.Platform, "http://x"))
      .toEqual({ command: "xdg-open", args: ["http://x"] });
  });
});

/** Gerçek `PipedChild`'ın bu fonksiyonun kullandığı kadarını taklit eder. */
function fakeChild(): PipedChild {
  return new EventEmitter() as unknown as PipedChild;
}

describe("tarayiciyiAc", () => {
  it("doğru komutu doğru argümanlarla, seçilen platforma göre çağırır", () => {
    const spawn = vi.fn(() => fakeChild());
    openBrowser("http://127.0.0.1:1234/", { platform: "darwin", spawn });
    expect(spawn).toHaveBeenCalledWith("open", ["http://127.0.0.1:1234/"]);
  });

  it("spawn SENKRON fırlatırsa yutuluyor — ekranı düşürmüyor, log çağrılıyor", () => {
    const log = vi.fn();
    expect(() =>
      openBrowser("http://x", {
        platform: "linux",
        spawn: () => {
          throw new Error("komut yok");
        },
        log,
      }),
    ).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("çocuk süreç ASENKRON `error` yayarsa log çağrılıyor, ama fonksiyon zaten dönmüştür", () => {
    const log = vi.fn();
    const child = fakeChild();
    openBrowser("http://x", { platform: "linux", spawn: () => child, log });
    // Fonksiyon senkron döndü, henüz log çağrılmadı — `error` olayı sonradan gelir.
    expect(log).not.toHaveBeenCalled();
    child.emit("error", new Error("ENOENT"));
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("başarılı açılışta log HİÇ çağrılmaz", () => {
    const log = vi.fn();
    openBrowser("http://x", { platform: "linux", spawn: () => fakeChild(), log });
    expect(log).not.toHaveBeenCalled();
  });
});
