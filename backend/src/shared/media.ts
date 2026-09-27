import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "./appError.js";

/// Where product photos live (issue #64). The API writes and deletes;
/// serving is nginx's job in production (the same folder mounted read-only)
/// and a static mount of the API elsewhere.
export interface MediaStore {
  write(key: string, bytes: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
}

export class FileMediaStore implements MediaStore {
  public constructor(private readonly root: string) {}

  public async write(key: string, bytes: Buffer): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Written next to its final name then renamed, so a reader never sees
    // a half-written file.
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o644 });
    await rename(temporary, target);
  }

  public async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    // Keys are server-made (`products/<uuid>.webp`); a key that escapes the
    // root is a bug, not an input, and is refused all the same.
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Media key outside the root: ${key}`);
    }
    return resolved;
  }
}

/// A store for tests: nothing touches the disk.
export class MemoryMediaStore implements MediaStore {
  public files = new Map<string, Buffer>();

  public async write(key: string, bytes: Buffer): Promise<void> {
    this.files.set(key, bytes);
  }

  public async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
}

export type ImageType = "jpeg" | "png" | "webp";

/// The type from the bytes, never from the extension or the declared type.
export function detectImageType(bytes: Buffer): ImageType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/// The largest side kept: a till tile is at most about 200 px wide, the
/// product page a little more; 512 keeps both crisp on a dense screen.
export const productImageSize = 512;

/// Decodes and re-encodes the upload: the stored file is always one the
/// server produced (WebP, resized to fit 512 × 512, metadata stripped), so
/// nothing the client crafted reaches the disk or the browser.
export async function processProductImage(bytes: Buffer): Promise<Buffer> {
  if (detectImageType(bytes) === null) {
    throw new AppError({
      statusCode: 400,
      code: "PRODUCT_IMAGE_UNSUPPORTED",
      message: "La photo doit être un fichier JPEG, PNG ou WebP.",
    });
  }

  try {
    return await sharp(bytes, { failOn: "error", animated: false })
      .rotate()
      .resize({
        width: productImageSize,
        height: productImageSize,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AppError({
      statusCode: 400,
      code: "PRODUCT_IMAGE_INVALID",
      message: "La photo n'a pas pu être lue ; essayez un autre fichier.",
    });
  }
}

export function newProductImageKey(): string {
  return `products/${randomUUID()}.webp`;
}

/// The public path of a stored photo, served under `/media`.
export function mediaUrlOf(key: string | null | undefined): string | null {
  return key ? `/media/${key}` : null;
}
