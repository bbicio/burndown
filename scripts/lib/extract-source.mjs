// Cuts one function or method out of a classic script's source so a test can run it against stubs.
// From the first occurrence of `head`, up to the `}` closing the first `{` after the first `)` that follows it.
export function extractBlock(src, head) {
  const start = src.indexOf(head);
  if (start < 0) throw new Error(`${head} not found`);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  return src.slice(start, i);
}
