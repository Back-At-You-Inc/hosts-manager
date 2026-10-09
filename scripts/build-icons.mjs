import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const directory = 'assets/icons';
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/app-icon.svg`, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="16" y="16" width="480" height="480" rx="125" fill="#6468df"/><path d="M144 122h56v106h112V122h56v268h-56V278H200v112h-56z" fill="white"/></svg>\n');
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]); }
function png(size, inset = 0) {
  const bytes = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0, white = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const px = ((x + (sx + .5) / 2) - inset) * 512 / (size - inset * 2), py = ((y + (sy + .5) / 2) - inset) * 512 / (size - inset * 2);
      const dx = Math.max(141 - px, 0, px - 371), dy = Math.max(141 - py, 0, py - 371);
      if (dx * dx + dy * dy > 125 * 125) continue;
      coverage++;
      if (py >= 122 && py <= 390 && ((px >= 144 && px <= 200) || (px >= 312 && px <= 368) || (px >= 200 && px <= 312 && py >= 228 && py <= 278))) white++;
    }
    const i = y * (size * 4 + 1) + 1 + x * 4;
    if (coverage) { bytes[i] = Math.round(100 + 155 * white / coverage); bytes[i + 1] = Math.round(104 + 151 * white / coverage); bytes[i + 2] = Math.round(223 + 32 * white / coverage); bytes[i + 3] = Math.round(255 * coverage / 4); }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes)), chunk('IEND', Buffer.alloc(0))]);
}
const sizes = [16,32,64,128,256,512,1024];
const images = new Map(sizes.map(size => [size, png(size)]));
await writeFile(`${directory}/app-icon.png`, images.get(1024));
await writeFile(`${directory}/tray-icon.png`, png(36, 3));
// ICO contains a PNG frame supported by modern Windows.
const icoHeader = Buffer.alloc(22); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4); icoHeader.writeUInt16LE(1, 10); icoHeader.writeUInt16LE(32, 12); icoHeader.writeUInt32LE(images.get(256).length, 14); icoHeader.writeUInt32LE(22, 18);
await writeFile(`${directory}/app-icon.ico`, Buffer.concat([icoHeader, images.get(256)]));
// Modern ICNS frames carry PNG payloads; generate the container directly.
const frames = [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
  const data = images.get(size); const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii'); header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
});
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8 + frames.reduce((total, frame) => total + frame.length, 0), 4);
await writeFile(`${directory}/app-icon.icns`, Buffer.concat([icnsHeader, ...frames]));
