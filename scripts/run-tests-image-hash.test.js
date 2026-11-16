// Guard: scripts/run-tests.sh rebuilds the API image whenever a file the image installs from changes.
//
// WHY THIS FILE EXISTS. run-tests.sh skips `--build` when a hash of the image's inputs is unchanged.
// Since api/Dockerfile installs with `npm ci` (security cycle 4), the lockfile is one of those inputs:
// left out of the hash, a lockfile-only security update would be tested against the old node_modules.
//
// WHAT IS DELIBERATELY NOT CHECKED: `COPY src ./src` -- src is bind-mounted at run time, not baked in
// for the tests; and the hash command itself, only the file list it reads.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');

describe('run-tests.sh image hash', () => {
  it('hashes every file the Dockerfile copies before installing', () => {
    const copied = [...read('api/Dockerfile').matchAll(/^COPY\s+(.+)\s+\S+\s*$/gm)]
      .flatMap((m) => m[1].trim().split(/\s+/))
      .filter((f) => f !== 'src')
      .map((f) => `api/${f}`);
    const line = read('scripts/run-tests.sh').split('\n').find((l) => l.startsWith('CURRENT_HASH='));
    expect(copied).toContain('api/package-lock.json');
    for (const f of copied) expect(line, f).toContain(f);
  });

  // Every checkout shares one compose project, so one image: a hash file alone would let a checkout
  // reuse an image another checkout built from a different lockfile.
  it('ties the stored hash to the id of the shared image', () => {
    const sh = read('scripts/run-tests.sh');
    expect(sh).toContain('API_IMAGE="${PROJECT}-api"');
    expect(sh).toContain(`docker image inspect --format '{{.Id}}' "$API_IMAGE"`);
    expect(sh).toContain('CURRENT_ID=$(image_id || true)');
    expect(sh).toContain('[ "$(cat "$IMAGE_HASH_FILE")" = "$CURRENT_HASH $CURRENT_ID" ]');
    expect(sh).toContain('echo "$CURRENT_HASH $(image_id)" > "$IMAGE_HASH_FILE"');
  });

  // A wrong image name makes image_id empty on both sides of the comparison: it must build, not match.
  it('builds when the image id cannot be read', () => {
    const sh = read('scripts/run-tests.sh');
    const cond = sh.split('\n').find((l) => l.includes('"$CURRENT_HASH $CURRENT_ID"'));
    expect(cond).toContain('[ -n "$CURRENT_ID" ]');
  });
});
