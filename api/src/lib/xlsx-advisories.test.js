// Payloads aimed at the two xlsx advisories (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9 ReDoS),
// read with the pinned 0.20.3. The advisories do not disclose their triggers: these payloads are the shapes the
// 0.18.5 -> 0.20.3 source diff points at (a sheet named __proto__; a long run of whitespace inside a shared
// string, the pattern of the fixed trailing-whitespace regex). Neither could be shown to hurt 0.18.5 — see
// docs/superpowers/reports/ for the measurement — so these are regression tests, not proof of the original exploit.
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const zlib = require('node:zlib');
const XLSX = require('xlsx');

const STALL_LIMIT_MS = 2000;

function crc32(buf) { let crc = 0xffffffff; for (const b of buf) { let c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const [n, d] of Object.entries(files)) {
    const name = Buffer.from(n), raw = Buffer.from(d), data = zlib.deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    const l = Buffer.concat([lh, name, data]); locals.push(l); centrals.push(Buffer.concat([ch, name])); off += l.length;
  }
  const c = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length, 8); end.writeUInt16LE(centrals.length, 10); end.writeUInt32LE(c.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, c, end]);
}
function workbook(sheetName, sheetXml, sst) {
  const f = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheetXml,
    'xl/sharedStrings.xml': sst,
  };
  return zip(f);
}
const SHEET = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>';
const sst = (t) => `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t xml:space="preserve">${t}</t></si></sst>`;

function buildPollutionXlsx() {
  return workbook('__proto__', SHEET, sst('polluted'));
}
function buildRedosXlsx() {
  return workbook('Sheet1', SHEET, sst('x' + ' '.repeat(200000) + 'y'));
}

const read = (buf) => XLSX.read(buf, { type: 'buffer', cellDates: true });

test('a pollution payload leaves Object.prototype untouched', () => {
  try { read(buildPollutionXlsx()); } catch { /* a refusal is as good as a clean read */ }
  assert.strictEqual(Object.keys(Object.prototype).length, 0);
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(({}).A1, undefined);
});

test('a sheet named __proto__ does not alter Object.prototype', () => {
  let wb;
  try { wb = read(buildPollutionXlsx()); } catch { /* refused */ }
  assert.strictEqual(Object.keys(Object.prototype).length, 0);
  if (wb) assert.ok(!Object.keys(Object.prototype).includes('A1'));
});

test('a ReDoS payload is read under STALL_LIMIT_MS', () => {
  const t = Date.now();
  try { read(buildRedosXlsx()); } catch { /* refused */ }
  assert.ok(Date.now() - t < STALL_LIMIT_MS, `read took ${Date.now() - t} ms`);
});

test('a concurrent request is answered during the read', async () => {
  const server = http.createServer((_req, res) => res.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const started = Date.now();
  try {
    const pending = fetch(`http://127.0.0.1:${server.address().port}/`);
    try { read(buildRedosXlsx()); } catch { /* refused */ }
    const res = await pending;
    assert.strictEqual(res.status, 200);
    assert.ok(Date.now() - started < STALL_LIMIT_MS, `answered after ${Date.now() - started} ms`);
  } finally { server.close(); }
});
