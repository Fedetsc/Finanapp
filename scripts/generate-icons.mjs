// Genera los íconos de la PWA (iniciales "FH" en blanco sobre el azul de la card de Balance) sin dependencias.
// Uso: node scripts/generate-icons.mjs  ->  public/icons/*.png
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [0x2d, 0x4a, 0x63]; // --primary (#2D4A63)
const FG = [0xff, 0xff, 0xff];
const ACCENT = [0x8f, 0xd9, 0xb6]; // --mint (#8FD9B6)

// Letras dentro del 44% central del ícono: entran en la zona segura de los íconos "maskable".
const t = 0.068;
const SHAPES = [
  // F
  [0.28, 0.32, 0.28 + t, 0.68, FG], [0.28, 0.32, 0.46, 0.32 + t, FG], [0.28, 0.467, 0.43, 0.467 + t, FG],
  // H
  [0.52, 0.32, 0.52 + t, 0.68, FG], [0.72 - t, 0.32, 0.72, 0.68, FG], [0.52, 0.466, 0.72, 0.466 + t, FG],
  // rayita menta abajo
  [0.28, 0.715, 0.4, 0.715 + 0.03, ACCENT],
];

function pixel(x, y) {
  for (let i = SHAPES.length - 1; i >= 0; i--) {
    const [x0, y0, x1, y1, c] = SHAPES[i];
    if (x >= x0 && x < x1 && y >= y0 && y < y1) return c;
  }
  return BG;
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const SS = 4; // 4x4 muestras por pixel (bordes suaves)
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtro "None"
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(acc[k] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180], ["favicon-32.png", 32]]) {
  writeFileSync(`public/icons/${name}`, png(size));
  console.log(`public/icons/${name}`);
}
