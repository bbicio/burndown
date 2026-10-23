// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractBlock } from '../../scripts/lib/extract-source.mjs';

// B-051: the Send Notification recipient list used to be an innerHTML template with the user's name in it, so a
// name like `</option><option value="x">Fake` injected a second option. navFillRecipientOptions builds the
// options as text nodes instead. nav.js is a classic script, so the function is cut out and run here.
const src = readFileSync('js/nav.js', 'utf8');
const navFillRecipientOptions = new Function('document', `return ${extractBlock(src, 'function navFillRecipientOptions(')};`)(document);

function fill(users, opts) {
  const sel = document.createElement('select');
  sel.innerHTML = '<option value="">Loading…</option>';
  navFillRecipientOptions(sel, users, { broadcast: false, selfId: 'me', ...opts });
  return sel;
}

describe('navFillRecipientOptions', () => {
  it('a name containing markup stays one option, as literal text', () => {
    const evil = '</option><option value="x">Fake';
    const sel = fill([{ id: 'u1', first_name: evil, last_name: '', email: 'e@x.io' }]);
    expect(sel.options.length).toBe(1);
    expect(sel.options[0].textContent).toBe(evil);
    expect(sel.options[0].value).toBe('u1');
  });

  it('broadcast puts "All users (broadcast)" first, with an empty value', () => {
    const sel = fill([{ id: 'u1', first_name: 'Ann', last_name: 'Lee', email: 'a@x.io' }], { broadcast: true });
    expect([...sel.options].map(o => [o.value, o.textContent])).toEqual([['', 'All users (broadcast)'], ['u1', 'Ann Lee']]);
  });

  it('without broadcast there is no such option', () => {
    const sel = fill([{ id: 'u1', first_name: 'Ann', last_name: '', email: 'a@x.io' }]);
    expect([...sel.options].map(o => o.textContent)).toEqual(['Ann']);
  });

  it('the current user is left out', () => {
    const sel = fill([{ id: 'me', first_name: 'Me', last_name: '', email: 'm@x.io' }, { id: 'u2', first_name: 'Bob', last_name: '', email: 'b@x.io' }]);
    expect([...sel.options].map(o => o.value)).toEqual(['u2']);
  });

  it('a user without a name shows the email', () => {
    const sel = fill([{ id: 'u3', first_name: '', last_name: '', email: 'nobody@x.io' }]);
    expect(sel.options[0].textContent).toBe('nobody@x.io');
  });

  it('replaces the "Loading…" placeholder', () => {
    const sel = fill([{ id: 'u1', first_name: 'Ann', last_name: '', email: 'a@x.io' }]);
    expect([...sel.options].some(o => o.textContent === 'Loading…')).toBe(false);
  });
});
