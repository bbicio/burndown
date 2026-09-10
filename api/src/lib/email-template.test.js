const test = require('node:test');
const assert = require('node:assert/strict');
const { renderEmailHtml } = require('./email-template');

test('renderEmailHtml: includes the passed bodyHtml unchanged', () => {
  const html = renderEmailHtml({ bodyHtml: '<p>Hello there</p>', appUrl: 'https://pdash.example.com' });
  assert.match(html, /<p>Hello there<\/p>/);
});

test('renderEmailHtml: header shows the PDash text logo (P and Dash in separate styled spans, matching login.html)', () => {
  const html = renderEmailHtml({ bodyHtml: '<p>x</p>', appUrl: 'https://pdash.example.com' });
  assert.match(html, /<span[^>]*>P<\/span><span[^>]*>Dash<\/span>/);
});

test('renderEmailHtml: footer links to the given appUrl', () => {
  const html = renderEmailHtml({ bodyHtml: '<p>x</p>', appUrl: 'https://pdash.example.com' });
  assert.match(html, /href="https:\/\/pdash\.example\.com"/);
});

test('renderEmailHtml: footer shows the given year', () => {
  const html = renderEmailHtml({ bodyHtml: '<p>x</p>', appUrl: 'https://pdash.example.com', year: 2031 });
  assert.match(html, /2031/);
});

test('renderEmailHtml: defaults year to the current calendar year when omitted', () => {
  const html = renderEmailHtml({ bodyHtml: '<p>x</p>', appUrl: 'https://pdash.example.com' });
  assert.match(html, new RegExp(String(new Date().getFullYear())));
});
