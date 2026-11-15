const test = require('node:test');
const assert = require('node:assert');
const { xlsxFileError, XLSX_FILE_ERROR } = require('./xlsx-file');

test('a buffer starting with the ZIP signature is accepted', () => {
  assert.strictEqual(xlsxFileError(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])), null);
});
test('a CSV is refused', () => {
  assert.strictEqual(xlsxFileError(Buffer.from('date,hours\n2026-01-01,1\n')), XLSX_FILE_ERROR);
});
test('an .xls (BIFF) file is refused', () => {
  assert.strictEqual(xlsxFileError(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), XLSX_FILE_ERROR);
});
test('an HTML document is refused', () => {
  assert.strictEqual(xlsxFileError(Buffer.from('<html><body></body></html>')), XLSX_FILE_ERROR);
});
test('an empty buffer is refused', () => {
  assert.strictEqual(xlsxFileError(Buffer.alloc(0)), XLSX_FILE_ERROR);
});
test('a 3-byte buffer is refused', () => {
  assert.strictEqual(xlsxFileError(Buffer.from([0x50, 0x4b, 0x03])), XLSX_FILE_ERROR);
});
test('undefined is refused', () => {
  assert.strictEqual(xlsxFileError(undefined), XLSX_FILE_ERROR);
});
test('null is refused', () => {
  assert.strictEqual(xlsxFileError(null), XLSX_FILE_ERROR);
});
test('a string is refused even when it spells the signature', () => {
  assert.strictEqual(xlsxFileError('PK\u0003\u0004'), XLSX_FILE_ERROR);
});
