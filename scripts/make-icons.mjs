// Renders the extension icons from store/icon.svg (#27) in Chromium, so the
// artwork has one source and the repo needs no image library.
//
// Chrome's guidance for the 128 px icon is 96 px of artwork inside 16 px of
// transparent padding; the store icon is the same file. The toolbar sizes use
// the whole square, because padding at 16 px would leave almost nothing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('store/icon.svg', 'utf8');
const OUTPUTS = [
  { path: 'src/public/icon/16.png', size: 16, padding: 0 },
  { path: 'src/public/icon/32.png', size: 32, padding: 0 },
  { path: 'src/public/icon/48.png', size: 48, padding: 0 },
  { path: 'src/public/icon/128.png', size: 128, padding: 16 },
  { path: 'store/icon-128.png', size: 128, padding: 16 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  mkdirSync('src/public/icon', { recursive: true });
  for (const { path, size, padding } of OUTPUTS) {
    await page.setViewportSize({ width: size, height: size });
    const art = size - 2 * padding;
    await page.setContent(
      `<body style="margin:0;background:transparent">
        <div style="padding:${padding}px;width:${art}px;height:${art}px">${svg.replace(
          '<svg ',
          `<svg width="${art}" height="${art}" `,
        )}</div></body>`,
    );
    writeFileSync(path, await page.screenshot({ omitBackground: true }));
    console.log(path);
  }
} finally {
  await browser.close();
}
