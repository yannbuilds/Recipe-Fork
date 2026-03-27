#!/usr/bin/env node
/**
 * Generates placeholder PWA icons for Pie Keeper.
 * Uses a pie emoji (🥧) on the brand green background.
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'packages', 'web', 'public');
const iconsDir = join(publicDir, 'icons');

mkdirSync(iconsDir, { recursive: true });

const GREEN = '#3f7358';
const BG = '#e9ede4';

function createSvg(size, { maskable = false } = {}) {
  const padding = maskable ? size * 0.2 : size * 0.1;
  const fontSize = size - padding * 2;
  const bg = maskable ? GREEN : GREEN;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.15}" fill="${bg}"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="${fontSize * 0.65}" font-family="Arial, sans-serif" font-weight="700" fill="white">PK</text>
</svg>`);
}

async function generate() {
  // Standard icons
  for (const size of [192, 512]) {
    await sharp(createSvg(size))
      .png()
      .toFile(join(iconsDir, `icon-${size}.png`));
    console.log(`  ✓ icons/icon-${size}.png`);
  }

  // Maskable icons (extra padding for safe zone)
  for (const size of [192, 512]) {
    await sharp(createSvg(size, { maskable: true }))
      .png()
      .toFile(join(iconsDir, `icon-maskable-${size}.png`));
    console.log(`  ✓ icons/icon-maskable-${size}.png`);
  }

  // Apple touch icon (180x180)
  await sharp(createSvg(180))
    .png()
    .toFile(join(publicDir, 'apple-touch-icon-180.png'));
  console.log('  ✓ apple-touch-icon-180.png');

  // Favicon 32px
  await sharp(createSvg(32))
    .png()
    .toFile(join(publicDir, 'favicon-32.png'));
  console.log('  ✓ favicon-32.png');

  // Favicon.ico (use 32px PNG as base, save as ICO-like PNG — browsers accept PNG favicons)
  await sharp(createSvg(48))
    .png()
    .toFile(join(publicDir, 'favicon.ico'));
  console.log('  ✓ favicon.ico');

  console.log('\nDone! All icons generated.');
}

generate().catch(console.error);
