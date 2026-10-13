import { fitWithin, sniffImage } from './question-export-images';

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    // an APP0 segment first, so the scan has to skip over it
    0xff,
    0xe0,
    0x00,
    0x04,
    0x4a,
    0x46,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
}

describe('sniffImage', () => {
  it('reads PNG, JPEG and GIF sizes from the bytes', () => {
    expect(sniffImage(png(800, 600))).toEqual({
      kind: 'png',
      width: 800,
      height: 600,
    });
    expect(sniffImage(jpeg(640, 480))).toEqual({
      kind: 'jpg',
      width: 640,
      height: 480,
    });
    const gif = Buffer.from('R0lGODlhCgAUAAAAACw=', 'base64');
    expect(sniffImage(gif)).toEqual({ kind: 'gif', width: 10, height: 20 });
  });

  it('refuses SVG, WebP, empty and truncated input', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="x"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('RIFF....WEBPVP8 ', 'latin1'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    expect(sniffImage(png(0, 0))).toBeNull();
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('fitWithin', () => {
  it('shrinks to the box keeping proportions, never enlarges', () => {
    expect(fitWithin(1800, 900, 360, 240)).toEqual({ width: 360, height: 180 });
    expect(fitWithin(500, 1000, 200, 140)).toEqual({ width: 70, height: 140 });
    expect(fitWithin(100, 50, 360, 240)).toEqual({ width: 100, height: 50 });
  });
});
