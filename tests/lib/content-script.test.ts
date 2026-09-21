// @vitest-environment happy-dom
/**
 * The two ways opening the panel can fail, and what the reader sees.
 *
 * Both matter because a dead click is indistinguishable from a working one. The
 * synchronous case is the one that actually happened: after the extension is
 * reloaded, a page left open keeps running the old content script, and
 * `chrome.runtime.sendMessage` on that dead context throws instead of returning
 * a promise, so a lone `.catch` never runs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPanel } from '../../src/entrypoints/content';

type ChromeStub = { runtime: { sendMessage: (message: unknown) => unknown } };

function withSendMessage(sendMessage: (message: unknown) => unknown): void {
  (globalThis as unknown as { chrome: ChromeStub }).chrome = { runtime: { sendMessage } };
}

function button(): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = 'Journal Club';
  return element;
}

afterEach(() => {
  delete (globalThis as unknown as { chrome?: ChromeStub }).chrome;
});

describe('requestPanel', () => {
  it('asks the background to open the panel', () => {
    const sendMessage = vi.fn(() => Promise.resolve());
    withSendMessage(sendMessage);
    const element = button();

    requestPanel(element);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_SIDE_PANEL' });
    expect(element.disabled).toBe(false);
    expect(element.textContent).toBe('Journal Club');
  });

  it('tells the reader to reload when the extension context is gone', () => {
    withSendMessage(() => {
      throw new Error('Extension context invalidated.');
    });
    const element = button();

    // Must not propagate: an uncaught error here is what showed up in the
    // browser's extension error list with no explanation on the page itself.
    expect(() => requestPanel(element)).not.toThrow();
    expect(element.textContent).toBe('Reload the page');
    expect(element.disabled).toBe(true);
    expect(element.title).toMatch(/reload this page/i);
  });

  it('tells the reader to reload when the message is rejected instead', async () => {
    withSendMessage(() => Promise.reject(new Error('Receiving end does not exist.')));
    const element = button();

    requestPanel(element);
    await Promise.resolve();
    await Promise.resolve();

    expect(element.textContent).toBe('Reload the page');
    expect(element.disabled).toBe(true);
  });

  it('survives a browser that returns nothing at all', () => {
    withSendMessage(() => undefined);
    const element = button();

    expect(() => requestPanel(element)).not.toThrow();
    // Nothing failed observably, so the button is left alone.
    expect(element.textContent).toBe('Journal Club');
  });
});
