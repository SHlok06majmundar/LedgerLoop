// Renders every logo asset from the two source SVGs in this folder.
//   node brand/generate.mjs
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const mark = readFileSync(join(here, 'logo-mark.svg'));
const glyph = readFileSync(join(here, 'logo-glyph.svg'));

const mobile = join(root, 'apps/mobile/assets');
const web = join(root, 'apps/web/src/app');
mkdirSync(mobile, { recursive: true });

/** Renders an SVG to a square PNG, optionally inset inside transparent padding. */
async function png(svg, size, file, inset = 0) {
  const inner = Math.round(size * (1 - inset * 2));
  const art = await sharp(svg, { density: 1200 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(file);
  console.log('wrote', file);
}

// App store icon: full-bleed mark (the stores apply their own rounding).
await png(mark, 1024, join(mobile, 'icon.png'));
// Android adaptive foreground: the glyph inside the 66% safe zone over the teal background colour.
await png(glyph, 1024, join(mobile, 'adaptive-icon.png'), 0.22);
// Splash: glyph centred on the teal splash background.
await png(glyph, 512, join(mobile, 'splash-icon.png'));
// In-app logo used on the sign-in screens.
await png(mark, 256, join(mobile, 'logo.png'));
// Browser favicon for the web build of the mobile app.
await png(mark, 64, join(mobile, 'favicon.png'));

// Next.js picks up app/icon.svg and app/apple-icon.png automatically.
copyFileSync(join(here, 'logo-mark.svg'), join(web, 'icon.svg'));
await png(mark, 180, join(web, 'apple-icon.png'));
