import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  FileMediaStore,
  detectImageType,
  processProductImage,
  productImageSize,
} from "./media.js";

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#c8a45a" },
  })
    .png()
    .toBuffer();
}

describe("product photos (issue #64)", () => {
  it("detects the type from the bytes, never from the name", async () => {
    expect(detectImageType(await png(2, 2))).toBe("png");
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectImageType(Buffer.from("RIFF....WEBPVP8 "))).toBe("webp");
    expect(detectImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("re-encodes an upload as a WebP that fits 512 pixels", async () => {
    const stored = await processProductImage(await png(1600, 900));
    const meta = await sharp(stored).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(productImageSize);
    expect(meta.height).toBeLessThanOrEqual(productImageSize);
    expect(stored.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("never enlarges a small photo", async () => {
    const meta = await sharp(
      await processProductImage(await png(64, 48)),
    ).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
  });

  it("refuses what is not an image and what cannot be decoded", async () => {
    await expect(
      processProductImage(Buffer.from("hello, not a picture")),
    ).rejects.toMatchObject({ code: "PRODUCT_IMAGE_UNSUPPORTED" });
    await expect(
      processProductImage(
        Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64, 7)]),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_IMAGE_INVALID" });
  });

  describe("FileMediaStore", () => {
    let root = "";
    afterAll(async () => {
      if (root) await rm(root, { recursive: true, force: true });
    });

    it("writes under the root, replaces atomically and removes", async () => {
      root = await mkdtemp(path.join(tmpdir(), "deb-media-"));
      const store = new FileMediaStore(root);

      await store.write("products/a.webp", Buffer.from("one"));
      expect(
        (await readFile(path.join(root, "products/a.webp"))).toString(),
      ).toBe("one");
      await store.write("products/a.webp", Buffer.from("two"));
      expect(
        (await readFile(path.join(root, "products/a.webp"))).toString(),
      ).toBe("two");
      await store.remove("products/a.webp");
      await expect(stat(path.join(root, "products/a.webp"))).rejects.toThrow();
      // Removing what is not there is not an error.
      await store.remove("products/a.webp");
    });

    it("refuses a key that leaves the root", async () => {
      const store = new FileMediaStore(root || tmpdir());
      await expect(
        store.write("../escape.webp", Buffer.from("x")),
      ).rejects.toThrow(/outside the root/);
    });
  });
});
