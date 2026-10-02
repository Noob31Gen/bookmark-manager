import fs from "fs";
import path from "path";
import zlib from "zlib";

function createPNG(size, colorHex, bgHex) {
  // Simple uncompressed/deflated raw PNG generator
  const width = size;
  const height = size;

  const hexToRgb = (hex) => {
    const num = parseInt(hex.replace("#", ""), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  };

  const [fgR, fgG, fgB] = hexToRgb(colorHex);
  const [bgR, bgG, bgB] = hexToRgb(bgHex);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
      // Draw a sharp bookmark ribbon icon with sharp borders
      const isBorder = (x === 0 || x === width - 1 || y === 0 || y === height - 1);
      const isMargin = x < Math.floor(size * 0.2) || x >= Math.ceil(size * 0.8) || y < Math.floor(size * 0.15) || y >= Math.ceil(size * 0.85);
      
      // Bookmark cutout at the bottom
      const bookmarkBottomY = Math.floor(size * 0.85);
      const bookmarkCutoutY = Math.floor(size * 0.68);
      const centerX = size / 2;
      const distFromCenter = Math.abs(x - centerX);
      const isCutout = y > bookmarkCutoutY && (y - bookmarkCutoutY) > (size * 0.3 - distFromCenter);

      if (isBorder) {
        rawData[offset++] = 255;
        rawData[offset++] = 213;
        rawData[offset++] = 61; // Gold border
        rawData[offset++] = 255;
      } else if (!isMargin && !isCutout) {
        rawData[offset++] = fgR;
        rawData[offset++] = fgG;
        rawData[offset++] = fgB;
        rawData[offset++] = 255;
      } else {
        rawData[offset++] = bgR;
        rawData[offset++] = bgG;
        rawData[offset++] = bgB;
        rawData[offset++] = 255;
      }
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // CRC32 implementation
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, combined, crcBuf]);
  }

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", deflated);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.resolve("public/icons");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const png = createPNG(size, "#ffd53d", "#0d0d0d");
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
});
console.log("Icons generated successfully.");
