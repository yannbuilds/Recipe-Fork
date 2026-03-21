/**
 * Generate Pie Keeper extension icons (16, 48, 128px).
 * Draws a simple pie shape in sage green on a warm beige background.
 * Run once: node packages/extension/scripts/generate-icons.js
 */
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const sizes = [16, 48, 128];

const GREEN = "#3f7358";
const GREEN_LIGHT = "#5a9975";
const BEIGE = "#e9ede4";
const CRUST = "#d4a853";
const CRUST_DARK = "#b8903e";
const FILLING = "#c0513f";

function drawPie(ctx, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const padding = size * 0.08;

  // Rounded square background
  const bgR = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(padding + bgR, padding);
  ctx.lineTo(size - padding - bgR, padding);
  ctx.quadraticCurveTo(size - padding, padding, size - padding, padding + bgR);
  ctx.lineTo(size - padding, size - padding - bgR);
  ctx.quadraticCurveTo(size - padding, size - padding, size - padding - bgR, size - padding);
  ctx.lineTo(padding + bgR, size - padding);
  ctx.quadraticCurveTo(padding, size - padding, padding, size - padding - bgR);
  ctx.lineTo(padding, padding + bgR);
  ctx.quadraticCurveTo(padding, padding, padding + bgR, padding);
  ctx.closePath();
  ctx.fillStyle = GREEN;
  ctx.fill();

  // Pie dish (bottom half ellipse) — crust colour
  const dishY = cy + r * 0.1;
  const dishRx = r * 0.85;
  const dishRy = r * 0.45;
  ctx.beginPath();
  ctx.ellipse(cx, dishY, dishRx, dishRy, 0, 0, Math.PI);
  ctx.fillStyle = CRUST_DARK;
  ctx.fill();

  // Pie top (full circle) — the pie crust top
  const topY = cy - r * 0.05;
  const topR = r * 0.8;
  ctx.beginPath();
  ctx.arc(cx, topY, topR, 0, Math.PI * 2);
  ctx.fillStyle = CRUST;
  ctx.fill();

  // Lattice lines — cross pattern on top
  ctx.strokeStyle = CRUST_DARK;
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.lineCap = "round";

  // Filling peek (darker circle inside)
  const fillR = topR * 0.75;
  ctx.beginPath();
  ctx.arc(cx, topY, fillR, 0, Math.PI * 2);
  ctx.fillStyle = FILLING;
  ctx.fill();

  // Lattice strips
  const stripWidth = Math.max(1.5, size * 0.04);
  ctx.fillStyle = CRUST;
  const strips = size >= 48 ? 5 : 3;
  const gap = (fillR * 2) / (strips + 1);

  for (let i = 1; i <= strips; i++) {
    const x = cx - fillR + gap * i;
    // Vertical strips
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, topY, fillR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillRect(x - stripWidth / 2, topY - fillR, stripWidth, fillR * 2);
    ctx.restore();
  }

  for (let i = 1; i <= strips; i++) {
    const y = topY - fillR + gap * i;
    // Horizontal strips
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, topY, fillR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillRect(cx - fillR, y - stripWidth / 2, fillR * 2, stripWidth);
    ctx.restore();
  }

  // Crust rim
  ctx.beginPath();
  ctx.arc(cx, topY, topR, 0, Math.PI * 2);
  ctx.strokeStyle = CRUST_DARK;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();

  // Steam lines
  if (size >= 48) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = Math.max(1, size * 0.02);
    ctx.lineCap = "round";

    const steamX = [cx - r * 0.3, cx, cx + r * 0.3];
    const steamBase = topY - topR - size * 0.03;

    for (const sx of steamX) {
      ctx.beginPath();
      ctx.moveTo(sx, steamBase);
      const h = size * 0.12;
      ctx.quadraticCurveTo(sx + size * 0.03, steamBase - h * 0.5, sx, steamBase - h);
      ctx.stroke();
    }
  }
}

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  drawPie(ctx, size);

  const buf = canvas.toBuffer("image/png");
  const outPath = join(outDir, `icon${size}.png`);
  writeFileSync(outPath, buf);
  console.log(`✓ ${outPath} (${size}×${size})`);
}
