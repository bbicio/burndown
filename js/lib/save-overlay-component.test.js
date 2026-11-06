import { describe, it, expect, beforeEach } from 'vitest';
import './icons.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const src = read('js/nav.js');
const { PdOverlay, navEnsureSaveOverlay } = new Function(src + 'return { PdOverlay, navEnsureSaveOverlay };')();

beforeEach(() => {
  PdOverlay.hide();
  document.body.className = '';
  document.body.removeAttribute('style');
  document.body.innerHTML = '<div id="app-shell"></div><div class="modal" id="m"></div><button id="b">b</button>';
});

describe('PdOverlay', () => {
  it('show() renders the Saving copy and makes every other body child inert', () => {
    PdOverlay.show();
    const el = document.getElementById('pd-save-overlay');
    expect(el.hidden).toBe(false);
    expect(el.classList.contains('is-visible')).toBe(true);
    expect(el.querySelector('.pd-save-overlay__title').textContent).toBe('Saving changes…');
    expect(el.querySelector('.pd-save-overlay__msg').textContent).toBe("Please don't close this page.");
    expect(document.getElementById('app-shell').hasAttribute('inert')).toBe(true);
    expect(document.getElementById('m').hasAttribute('inert')).toBe(true);
    expect(el.hasAttribute('inert')).toBe(false);
    expect(document.body.classList.contains('pd-save-locked')).toBe(true);
    expect(PdOverlay.isVisible()).toBe(true);
  });
  it('show({ title, message }) overrides the copy; a second show() only updates it', () => {
    PdOverlay.show();
    PdOverlay.show({ title: 'T', message: 'M' });
    const el = document.getElementById('pd-save-overlay');
    expect(el.querySelector('.pd-save-overlay__title').textContent).toBe('T');
    expect(el.querySelector('.pd-save-overlay__msg').textContent).toBe('M');
    PdOverlay.hide();
    expect(document.getElementById('app-shell').hasAttribute('inert')).toBe(false);
    expect(document.getElementById('b').hasAttribute('inert')).toBe(false);
  });
  it('hide() keeps an inert that was already there and body classes it did not add', () => {
    document.getElementById('m').setAttribute('inert', ''); document.body.classList.add('modal-open');
    PdOverlay.show(); PdOverlay.hide();
    expect(document.getElementById('m').hasAttribute('inert')).toBe(true);
    expect(document.getElementById('app-shell').hasAttribute('inert')).toBe(false);
    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(document.body.classList.contains('pd-save-locked')).toBe(false);
    expect(document.getElementById('pd-save-overlay').hidden).toBe(true);
    expect(PdOverlay.isVisible()).toBe(false);
  });
  it('hide() gives focus back to the element focused before show()', () => {
    document.getElementById('b').focus(); PdOverlay.show(); PdOverlay.hide();
    expect(document.activeElement.id).toBe('b');
  });
  it('hide() without a previous show() is a no-op', () => {
    expect(() => PdOverlay.hide()).not.toThrow();
    expect(document.getElementById('app-shell').hasAttribute('inert')).toBe(false);
  });
  it('swallows key events while visible and lets them through after hide()', () => {
    const seen = [];
    const onKey = e => seen.push(e.type + ':' + e.key);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    PdOverlay.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    expect(seen).toEqual([]);
    PdOverlay.hide();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(seen).toEqual(['keydown:Escape']);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
  });
  it('navEnsureSaveOverlay() creates the element once', () => {
    navEnsureSaveOverlay(); navEnsureSaveOverlay();
    expect(document.querySelectorAll('#pd-save-overlay').length).toBe(1);
  });
  it('tokens.css defines the overlay tokens and style.css uses no hex in .pd-save-overlay', () => {
    const tokens = read('css/tokens.css');
    for (const t of ['--z-blocking: 1090', '--overlay-scrim', '--overlay-spinner-track', '--overlay-progress-track', '--shadow-overlay']) {
      expect(tokens).toContain(t);
    }
    const css = read('css/style.css');
    const block = css.slice(css.indexOf('.pd-save-overlay'));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
