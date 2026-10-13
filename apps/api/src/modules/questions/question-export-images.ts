/** An image the exporters can place, with the size read from its own header. */
export interface SniffedImage {
  kind: 'png' | 'jpg' | 'gif';
  width: number;
  height: number;
}

/**
 * Identify a PNG, JPEG or GIF from its bytes and read its pixel size.
 *
 * The stored mime type is not trusted and the file extension is not looked at:
 * both exporters need to know exactly what they were handed, and anything else
 * (SVG, WebP, a truncated upload) returns null so the caller prints the
 * `[image]` placeholder instead of failing the whole export.
 */
export function sniffImage(buf: Buffer): SniffedImage | null {
  if (
    buf.length > 24 &&
    buf.readUInt32BE(0) === 0x89504e47 &&
    buf.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return finish('png', buf.readUInt32BE(16), buf.readUInt32BE(20));
  }
  if (buf.length > 10 && buf.toString('latin1', 0, 4) === 'GIF8') {
    return finish('gif', buf.readUInt16LE(6), buf.readUInt16LE(8));
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
      } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2;
      } else if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return finish('jpg', buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5));
      } else {
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  }
  return null;
}

function finish(
  kind: SniffedImage['kind'],
  width: number,
  height: number,
): SniffedImage | null {
  return width > 0 && height > 0 ? { kind, width, height } : null;
}

/** Scale (width x height) down to fit inside the box, keeping its proportions. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
