/**
 * generate-icons.mjs
 * Renders the urordo FolderSearch logo into all required icon sizes
 * for Tauri (PNG + ICO).
 *
 * Usage:
 *   node scripts/generate-icons.mjs
 *
 * Requires: sharp (npm install sharp --save-dev)
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'src-tauri', 'icons');

// ── Brand colors ─────────────────────────────────────────────────────────────
const BG         = '#1a1710';
const BRAND_GOLD = '#8b6914';
const NEAR_WHITE = '#f0ead8';

// ── FolderSearch icon (Lucide, 24×24 viewBox) ────────────────────────────────
// Scaled to fill ~140×140 of the 200×200 canvas (scale ≈ 5.833, offset = 30).
// Search circle sits at (17,17) in icon space → (129, 129) in canvas space.
function buildSvg(size) {
  const rx = size >= 64 ? 32 : 16;
  return `<svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${size}"
    viewBox="0 0 200 200">
  <defs>
    <!-- Warm dark background gradient -->
    <radialGradient id="bg-grad" cx="40%" cy="35%" r="70%">
      <stop offset="0%"   stop-color="#262218"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <!-- Soft blue glow centred on the search circle -->
    <radialGradient id="search-glow" cx="129" cy="129" r="55"
        gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="${BRAND_GOLD}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${BRAND_GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="200" height="200" fill="url(#bg-grad)" rx="${rx}"/>

  <!-- Blue glow behind the magnifying-glass area -->
  <circle cx="129" cy="129" r="55" fill="url(#search-glow)"/>

  <!--
    FolderSearch icon (Lucide v1.7.0) — original 24×24 paths
    Translated + scaled to a 140×140 region centred in the 200×200 canvas.
    transform: translate(30,30) scale(5.833)
    stroke-width 1.75 in icon-space → ~10.2 units in canvas-space → crisp at all output sizes.
  -->
  <g transform="translate(30,30) scale(5.833)"
     fill="none"
     stroke-linecap="round"
     stroke-linejoin="round"
     stroke-width="1.75">

    <!-- Folder body — near-white so it reads on the dark background -->
    <path
      d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1"
      stroke="${NEAR_WHITE}"
      stroke-opacity="0.92"/>

    <!-- Search circle — brand blue for the accent pop -->
    <circle cx="17" cy="17" r="3" stroke="${BRAND_GOLD}"/>

    <!-- Search handle — brand blue, slightly thicker for visibility -->
    <path d="m21 21-1.9-1.9" stroke="${BRAND_GOLD}" stroke-width="2"/>
  </g>
</svg>`;
}

// ── Sizes required by Tauri + Windows Store ────────────────────────────────────
const SIZES = [16, 32, 48, 64, 128, 256, 512];
const STORE_SIZES = [
  { name: 'Square30x30Logo.png',   size: 30  },
  { name: 'Square44x44Logo.png',   size: 44  },
  { name: 'Square71x71Logo.png',   size: 71  },
  { name: 'Square89x89Logo.png',   size: 89  },
  { name: 'Square107x107Logo.png', size: 107 },
  { name: 'Square142x142Logo.png', size: 142 },
  { name: 'Square150x150Logo.png', size: 150 },
  { name: 'Square284x284Logo.png', size: 284 },
  { name: 'Square310x310Logo.png', size: 310 },
  { name: 'StoreLogo.png',         size: 50  },
];

async function generatePng(size, outPath) {
  const svg = buildSvg(size);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath);
  console.log(`  ✓ ${outPath.replace(ROOT, '').replace(/\\/g, '/')}`);
}

// ── ICO builder (multi-resolution) ───────────────────────────────────────────
// ICO format: header + directory + image data
// We embed 16, 32, 48 as 32-bit BMP and 256 as PNG (Windows supports this)
async function buildIco() {
  const icoSizes = [16, 32, 48, 256];
  const pngBuffers = await Promise.all(
    icoSizes.map(s =>
      sharp(Buffer.from(buildSvg(s)))
        .resize(s, s)
        .png()
        .toBuffer()
    )
  );

  // ICO header: ICONDIR
  const numImages = icoSizes.length;
  const headerSize = 6 + numImages * 16;
  let offset = headerSize;

  const dirs = pngBuffers.map((buf, i) => {
    const s = icoSizes[i];
    const w = s === 256 ? 0 : s;  // 256 is encoded as 0 in ICO
    const h = s === 256 ? 0 : s;
    const dir = Buffer.alloc(16);
    dir.writeUInt8(w, 0);
    dir.writeUInt8(h, 1);
    dir.writeUInt8(0, 2);     // color count (0 = no palette)
    dir.writeUInt8(0, 3);     // reserved
    dir.writeUInt16LE(1, 4);  // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(buf.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += buf.length;
    return dir;
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // ICO type
  header.writeUInt16LE(numImages, 4);  // image count

  const icoPath = join(ICONS_DIR, 'icon.ico');
  writeFileSync(icoPath, Buffer.concat([header, ...dirs, ...pngBuffers]));
  console.log(`  ✓ src-tauri/icons/icon.ico`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nurordo icon generation — FolderSearch mark\n');

  // Standard PNG sizes
  for (const size of SIZES) {
    const name = size === 256 ? '256x256.png'
               : size === 512 ? 'icon.png'
               : `${size}x${size}.png`;
    await generatePng(size, join(ICONS_DIR, name));
  }

  // @2x variant (Tauri uses 128x128@2x.png = 256px)
  await generatePng(256, join(ICONS_DIR, '128x128@2x.png'));

  // Windows Store tiles
  for (const { name, size } of STORE_SIZES) {
    await generatePng(size, join(ICONS_DIR, name));
  }

  // ICO (Windows app icon)
  await buildIco();

  // Master icon at 1024px — fed into `npx tauri icon` for iOS/Android/macOS
  await generatePng(1024, join(ICONS_DIR, 'icon.png'));

  console.log('\nAll icons generated successfully.\n');
}

main().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
