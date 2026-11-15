const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.APP_URL;
const { renderAdminNotificationLink } = require('./email');

test('a valid path becomes an Open in PDash link on the app origin', () => {
  const html = renderAdminNotificationLink('/pipeline.html');
  assert.match(html, /href="http:\/\/localhost\/pipeline\.html"/);
  assert.match(html, />Open in PDash</);
});

test('a valid absolute url on the app origin is kept', () => {
  assert.match(renderAdminNotificationLink('http://localhost/costgrid.html?cgId=1'), /href="http:\/\/localhost\/costgrid\.html\?cgId=1"/);
});

test('an invalid or absent url gives no link', () => {
  assert.equal(renderAdminNotificationLink('javascript:alert(1)'), '');
  assert.equal(renderAdminNotificationLink('https://example.com/x'), '');
  assert.equal(renderAdminNotificationLink(null), '');
});

test('a quote in a path cannot close the href attribute', () => {
  const html = renderAdminNotificationLink('/x"onmouseover="y');
  assert.ok(!html.includes('"onmouseover'), html);
  assert.match(html, /&quot;onmouseover/);
});
