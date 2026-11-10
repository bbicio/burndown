// B-415: the API is reached only through nginx on the Compose network; publishing its port on the host
// would let a client set X-Forwarded-For itself (`trust proxy` is on). scripts/test-branch.sh adds the
// branch stack's own port in its override.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function serviceBlock(yaml, name) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex(l => new RegExp(`^  ${name}:\s*$`).test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^  \S/.test(l) || /^\S/.test(l));
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

describe('docker-compose.yml', () => {
  it('does not publish a port for the api service', () => {
    const block = serviceBlock(readFileSync('docker-compose.yml', 'utf8'), 'api');
    expect(block).toBeTruthy();
    expect(block).not.toMatch(/^\s+ports:/m);
  });
});
