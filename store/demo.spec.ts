/**
 * Records the landing page's demo video (spec §11): `pnpm store:video`. Not
 * part of the test run and not in CI. Needs `ffmpeg` with libx264 on the PATH.
 *
 * It is the appraisal the store images show (scenario.ts), entered at a
 * reader's pace in the panel, which is opened in a tab for the same reason as
 * in capture.spec.ts. The frames come from Chromium's screencast over CDP,
 * each with the time it was painted, and ffmpeg holds each frame for as long
 * as it was on screen. Headless Chromium draws no mouse pointer, so the page
 * gets a dot that follows the mouse, and the mouse travels to each control
 * before clicking it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { LIVE, expect, openPubMed, test } from '../tests/e2e/fixtures';
import { articleUrl } from '../tests/e2e/pmids';
import {
  BASELINE_RISK,
  BOTTOM_LINE,
  EXPECTED_NNT,
  PANEL,
  PICO,
  RATIO_RAW,
  RECORD,
  SEARCH_NOTE,
  blur,
  item,
  openPanelInTab,
} from './scenario';

const OUTPUT = 'site/video/demo.mp4';
const POSTER = 'site/video/demo-poster.png';
/** Milliseconds between keystrokes: quick, but readable as typing. */
const KEY_DELAY = 10;

interface Frame {
  png: Buffer;
  /** Seconds, from the screencast's own clock. */
  time: number;
}

/**
 * A dot that follows the mouse, since a headless recording has no pointer.
 * Spell checking is turned off too: its underlines under medical words are
 * the browser's, not the panel's.
 */
function addPointer(): void {
  const dot = document.createElement('div');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText =
    'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
    'background:rgb(11 92 107 / 0.35);border:2px solid #0b5c6b;pointer-events:none;' +
    'z-index:2147483647;transition:transform .08s;';
  document.addEventListener('mousemove', (event) => {
    dot.style.left = `${event.clientX}px`;
    dot.style.top = `${event.clientY}px`;
  });
  document.addEventListener('mousedown', () => (dot.style.transform = 'scale(.7)'));
  document.addEventListener('mouseup', () => (dot.style.transform = ''));
  document.addEventListener('DOMContentLoaded', () => {
    // Inherited by every field the panel renders later.
    document.documentElement.spellcheck = false;
    document.body.append(dot);
  });
}

/** Moves the mouse to `target` over a short path, then clicks it. */
async function press(panel: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box === null) throw new Error('Nothing to click');
  await panel.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await panel.waitForTimeout(120);
  await target.click();
}

/** Clicks into a field and types into it. */
async function typeInto(panel: Page, target: Locator, text: string): Promise<void> {
  await press(panel, target);
  await target.pressSequentially(text, { delay: KEY_DELAY });
}

/** Scrolls the panel smoothly so that `target` is in view. */
async function scrollTo(panel: Page, target: Locator, block: 'start' | 'end'): Promise<void> {
  await target.evaluate((element, where) => {
    element.scrollIntoView({ block: where, behavior: 'smooth' });
  }, block);
  await panel.waitForTimeout(900);
}

test('landing page demo video', async ({ context, page, extensionId }) => {
  test.skip(LIVE, 'Record the video from saved pages only: unset JCH_LIVE.');
  test.setTimeout(180_000);

  await openPubMed(page, articleUrl(RECORD), 'article');
  await expect(page.locator('#jch-open')).toBeVisible();
  const panel = await openPanelInTab(context, extensionId, addPointer);
  const pause = (ms: number): Promise<void> => panel.waitForTimeout(ms);

  const cdp = await context.newCDPSession(panel);
  const frames: Frame[] = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ png: Buffer.from(data, 'base64'), time: metadata.timestamp ?? 0 });
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await panel.mouse.move(PANEL.width - 40, 120);
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: PANEL.width,
    maxHeight: PANEL.height,
  });

  // The design, and the evidence it was detected from.
  await pause(1500);
  await press(panel, panel.locator('.design__evidence-summary'));
  await pause(1800);

  // The PICO, in the reader's words.
  for (const [key, text] of Object.entries(PICO)) {
    await typeInto(panel, panel.locator(`#jch-pico-${key}`), text);
    await pause(250);
  }
  await blur(panel);
  await pause(900);

  // The relative risk from the abstract, applied to the usual-care rate.
  await press(panel, panel.getByRole('tab', { name: 'Numbers', exact: true }));
  await pause(1000);
  const ratio = panel
    .locator('.numbers__candidate')
    .filter({ has: panel.locator('.numbers__raw', { hasText: RATIO_RAW }) });
  await press(panel, ratio.locator('.numbers__use'));
  await pause(700);
  await typeInto(panel, panel.locator('#jch-numbers-acr'), BASELINE_RISK);
  await pause(400);
  await press(panel, panel.locator('.numbers__submit'));
  await expect(panel.locator('.numbers__nnt')).toHaveText(EXPECTED_NNT);
  await blur(panel);
  await scrollTo(panel, panel.locator('.numbers__result'), 'end');
  await pause(2600);

  // One checklist question, with what to check in the full text.
  await press(panel, panel.getByRole('tab', { name: 'Appraisal', exact: true }));
  await pause(900);
  const search = item(panel, 'Search comprehensiveness');
  await scrollTo(panel, search, 'start');
  await press(panel, search.locator('.validity-choice--unclear'));
  await pause(500);
  await press(panel, search.getByText('Add a note'));
  await typeInto(panel, search.locator('.validity-note'), SEARCH_NOTE);
  await blur(panel);
  await pause(1500);

  // The bottom line, and the summary it goes into.
  await press(panel, panel.getByRole('tab', { name: 'Export', exact: true }));
  await pause(900);
  await typeInto(panel, panel.locator('#jch-bottom-line'), BOTTOM_LINE);
  await blur(panel);
  await pause(800);
  await scrollTo(panel, panel.locator('.export__preview'), 'start');
  await pause(2800);

  await cdp.send('Page.stopScreencast');
  expect(frames.length).toBeGreaterThan(20);

  // ffmpeg's concat list holds each frame until the next one was painted.
  const dir = mkdtempSync(join(tmpdir(), 'jch-demo-'));
  try {
    const list: string[] = ['ffconcat version 1.0'];
    frames.forEach((frame, index) => {
      const name = `f${String(index).padStart(5, '0')}.png`;
      writeFileSync(join(dir, name), frame.png);
      const next = frames[index + 1]?.time ?? frame.time + 2;
      list.push(`file ${name}`, `duration ${Math.max(next - frame.time, 0.001).toFixed(4)}`);
    });
    // The concat demuxer ignores the last entry's duration unless the file
    // is listed once more.
    list.push(`file f${String(frames.length - 1).padStart(5, '0')}.png`);
    writeFileSync(join(dir, 'frames.txt'), `${list.join('\n')}\n`);

    mkdirSync('site/video', { recursive: true });
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-i',
      join(dir, 'frames.txt'),
      '-vf',
      'fps=30,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '26',
      '-movflags',
      '+faststart',
      '-an',
      OUTPUT,
    ]);
    writeFileSync(POSTER, frames[0]!.png);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
