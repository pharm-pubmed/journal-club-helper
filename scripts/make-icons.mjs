// Placeholder icons (issue #2); replaced with real artwork in #27.
// Hand-rolled PNG encoder so the repo needs no image dependency.
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const BG = [0x0b, 0x5c, 0x6b]; // deep teal
const FG = [0xff, 0xff, 0xff];

// A blocky "JC" on a rounded square, drawn on a 16x16 grid and scaled up.
const GLYPH = [
  '................',
  '................',
  '..####....####..',
  '....##...##..##.',
  '....##..##...##.',
  '....##..##......',
  '....##..##......',
  '....##..##......',
  '....##..##......',
  '....##..##......',
  '....##..##......',
  '....##..##...##.',
  '.##.##...##..##.',
  '..###.....####..',
  '................',
  '................',
];

function png(size) {
  const scale = size / 16;
  const radius = Math.round(size * 0.18);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter type 0
    for (let x = 0; x < size; x++) {
      // rounded-corner mask
      const cx = x < radius ? radius : x >= size - radius ? size - 1 - radius : x;
      const cy = y < radius ? radius : y >= size - radius ? size - 1 - radius : y;
      const outside = Math.hypot(x - cx, y - cy) > radius + 0.5;
      if (outside) {
        row.push(0, 0, 0, 0);
        continue;
      }
      const gx = Math.min(15, Math.floor(x / scale));
      const gy = Math.min(15, Math.floor(y / scale));
      const on = GLYPH[gy][gx] === '#';
      const [r, g, b] = on ? FG : BG;
      row.push(r, g, b, 255);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('src/public/icon', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`src/public/icon/${size}.png`, png(size));
  console.log(`src/public/icon/${size}.png`);
}
