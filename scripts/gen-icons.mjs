import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0040a1"/>
  <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle"
        font-family="Manrope, Arial, sans-serif" font-weight="900"
        font-size="240" fill="#ffffff">SB</text>
</svg>`;

const svgMaskable = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0040a1"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle"
        font-family="Manrope, Arial, sans-serif" font-weight="900"
        font-size="180" fill="#ffffff">SB</text>
</svg>`;

const buf = Buffer.from(svg);
const bufMaskable = Buffer.from(svgMaskable);

await sharp(buf).resize(192, 192).png().toFile(join(outDir, "icon-192.png"));
await sharp(buf).resize(512, 512).png().toFile(join(outDir, "icon-512.png"));
await sharp(bufMaskable).resize(512, 512).png().toFile(join(outDir, "icon-512-maskable.png"));
await sharp(buf).resize(180, 180).png().toFile(join(process.cwd(), "public", "apple-touch-icon.png"));

console.log("Icons generated in public/icons/");
