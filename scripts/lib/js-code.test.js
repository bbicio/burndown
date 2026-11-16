import { describe, it, expect } from 'vitest';
import { jsCode, inlineScripts } from './js-code.mjs';

describe('jsCode', () => {
  it('drops line and block comments, wherever // follows', () => {
    expect(jsCode('a = 1; // x\nload(s)// y\nb = [1]/* z */;')).toBe('a = 1; \nload(s)\nb = [1];');
  });
  it('keeps // and /* inside strings and templates as text, not comments', () => {
    expect(jsCode("u = 'https://x/y'; g = 'src/*'; h = 1;")).toBe("u = ''; g = ''; h = 1;");
    expect(jsCode('t = `a // b`; c = 2;')).toBe('t = ``; c = 2;');
  });
  it('keeps short word-like strings, blanks the others', () => {
    expect(jsCode("x = 'anonymous'; y = \"crossorigin\"; z = 's.integrity = M.integrity';")).toBe("x = 'anonymous'; y = \"crossorigin\"; z = '';");
  });
  it('blanks regex literals, including quotes and slashes inside them', () => {
    expect(jsCode("r = /['\"]\\/x/g; d = a / b / c;")).toBe('r = /r/g; d = a / b / c;');
    expect(jsCode('if (/\\*/.test(s)) y = 1;')).toBe('if (/r/.test(s)) y = 1;');
  });
  it('reads a / after ++ or -- as division', () => {
    expect(jsCode("n = i++ / 2; u = 'a/b'; h = 's.x = y';")).toBe("n = i++ / 2; u = ''; h = '';");
    expect(jsCode('n = i-- / 2;')).toBe('n = i-- / 2;');
  });
  it('never merges lines on an unterminated regex or string', () => {
    expect(jsCode("a = (/x\ns.integrity = M.integrity;")).toBe('a = (/x\ns.integrity = M.integrity;');
    expect(jsCode("t = 'x\ns.integrity = M.integrity;")).toBe("t = 'x'\ns.integrity = M.integrity;");
  });
  it('handles escapes inside strings', () => {
    expect(jsCode("a = 'it\\'s'; b = 1;")).toBe("a = ''; b = 1;");
  });
});

describe('inlineScripts', () => {
  it('returns the bodies of inline scripts only, not markup or src scripts', () => {
    const html = "<p>Don't</p><script src=\"x.js\"></script><script type=\"module\">a = 1;</script><!-- <script>b</script> -->";
    expect(inlineScripts(html)).toEqual(['a = 1;']);
  });
  it('keeps JavaScript scripts only, by type', () => {
    const html = '<script>a;</script><script type="text/javascript">b;</script><script type="text/x-template"><p>c</p></script>'
      + '<script type="application/json">{}</script><script type="importmap">{}</script>';
    expect(inlineScripts(html)).toEqual(['a;', 'b;']);
  });
  it('leaves a <!-- inside a script alone, and reads data-src as no src', () => {
    expect(inlineScripts("<script>x = '<!--'; y = 1;</script><p>-->\n</p>")).toEqual(["x = '<!--'; y = 1;"]);
    expect(inlineScripts('<script data-src="z">a;</script>')).toEqual(['a;']);
  });
});
