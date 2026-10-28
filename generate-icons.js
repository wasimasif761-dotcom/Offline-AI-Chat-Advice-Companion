import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Function to generate a raw valid PNG with zlib
function createPNG(width, height, r, g, b, alpha = 255) {
  const bytesPerPixel = 4;
  const rawData = Buffer.alloc(height * (1 + width * bytesPerPixel));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      // Create a nice gradient with a rounded corner badge look
      const cx = width / 2;
      const cy = height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      const maxDist = width / 2;
      
      // Outer rounded rect check
      const cornerR = width * 0.22;
      const rx = Math.max(0, Math.abs(x - cx) - (cx - cornerR));
      const ry = Math.max(0, Math.abs(y - cy) - (cy - cornerR));
      const cornerDist = Math.hypot(rx, ry);

      if (cornerDist > cornerR) {
        // Transparent outside rounded icon
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      } else {
        // Gradient from emerald (#059669) to cyan/indigo (#0284c7)
        const t = (x + y) / (width + height);
        const curR = Math.round(5 * (1 - t) + 2 * t);
        const curG = Math.round(150 * (1 - t) + 132 * t);
        const curB = Math.round(105 * (1 - t) + 199 * t);
        
        // Inner symbol highlight (a crescent/chat bubble center)
        const innerDist = Math.hypot(x - cx, y - cy);
        if (innerDist < width * 0.28) {
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 245;
        } else if (innerDist < width * 0.32) {
          rawData[offset++] = 167;
          rawData[offset++] = 243;
          rawData[offset++] = 208;
          rawData[offset++] = 255;
        } else {
          rawData[offset++] = curR;
          rawData[offset++] = curG;
          rawData[offset++] = curB;
          rawData[offset++] = alpha;
        }
      }
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', deflated);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Precomputed CRC table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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

// Generate files
const publicDir = path.resolve('./public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// SVG content
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>
    <linearGradient id="bubbleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#bgGrad)" />
  <circle cx="256" cy="256" r="180" fill="none" stroke="rgba(16, 185, 129, 0.25)" stroke-width="6" stroke-dasharray="12 16" />
  
  <!-- Neural Pulse rings -->
  <circle cx="256" cy="240" r="120" fill="url(#bubbleGrad)" filter="url(#glow)" opacity="0.9" />
  
  <!-- Urdu Calligraphic Emblem / Advice Sparkle -->
  <path d="M210 210 C210 170, 302 170, 302 210 C302 245, 235 255, 235 285 L235 300 M235 330 L235 345" 
        fill="none" stroke="#ffffff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="235" cy="340" r="8" fill="#ffffff" />
  
  <!-- Offline badge -->
  <g transform="translate(320, 320)">
    <circle cx="40" cy="40" r="36" fill="#10b981" stroke="#ffffff" stroke-width="6" />
    <path d="M30 42 L38 50 L52 34" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.resolve('./icon.svg'), svgContent);

const p192 = createPNG(192, 192, 16, 185, 129);
const p512 = createPNG(512, 512, 16, 185, 129);
const pApple = createPNG(180, 180, 16, 185, 129);

[publicDir, path.resolve('.')].forEach(dir => {
  fs.writeFileSync(path.join(dir, 'pwa-192x192.png'), p192);
  fs.writeFileSync(path.join(dir, 'pwa-512x512.png'), p512);
  fs.writeFileSync(path.join(dir, 'pwa-maskable-512x512.png'), p512);
  fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), pApple);
});

console.log('Icons successfully generated!');
