// Guard: a test-api.js case id (`PSV-01`, `GP-03`, …) belongs to one test function. An id is the label a
// failing line is read by; when two `async function test…` share one, a red line is ambiguous. That happened
// twice before this guard (TS-01/TS-02 in the two-step and timesheet tests, PA-01/PA-02 in the planning
// assistant and the program-attach tests, both renamed 2026-11-18).
//
// WHAT IS DELIBERATELY NOT CHECKED -- named limits, not gaps:
//   * An id may repeat inside its own function: one case often has several assertions.
//   * It is lexical: an id is an upper-case prefix, a dash and one to three digits right after a quote or a
//     backtick; an id built at run time is not seen.
//   * Code between two test functions is attributed to the one above it.
//   * TEST_CASES.md ids are a separate namespace (manual cases) and are not compared.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

// { id: [function names] } for every id used by more than one top-level test function.
function sharedIds(src) {
  const starts = [...src.matchAll(/^async function (test\w+)\s*\(/gm)].map(m => ({ name: m[1], at: m.index }));
  const owners = new Map();
  starts.forEach((s, i) => {
    const body = src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length);
    for (const m of body.matchAll(/[`'"]([A-Z]{1,6}-\d{1,3})[a-z]?\b/g)) {
      if (!owners.has(m[1])) owners.set(m[1], new Set());
      owners.get(m[1]).add(s.name);
    }
  });
  return Object.fromEntries([...owners].filter(([, f]) => f.size > 1).map(([id, f]) => [id, [...f]]));
}

describe('test-api.js case ids', () => {
  it('finds an id shared by two functions, and ignores repeats inside one', () => {
    const src = "async function testA() {\n  ok(1, 'AB-01 one'); ok(1, `AB-01 again`);\n}\n"
      + "async function testB() {\n  ok(1, 'AB-01 clash'); ok(1, 'CD-02 own');\n}\n";
    expect(sharedIds(src)).toEqual({ 'AB-01': ['testA', 'testB'] });
  });

  it('no id is shared by two test functions of test-api.js', () => {
    const src = readFileSync(join(ROOT, 'test-api.js'), 'utf8');
    expect(sharedIds(src), 'rename the new cases with a prefix no other test function uses').toEqual({});
  });
});
