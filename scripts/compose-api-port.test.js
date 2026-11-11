// B-415: the API is reached only through nginx on the Compose network; publishing its port on the host
// would let a client set X-Forwarded-For itself (`trust proxy` is on). scripts/test-branch.sh adds the
// branch stack's own port in its override.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function serviceBlock(yaml, name) {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex(l => new RegExp(String.raw`^  ${name}:\s*$`).test(l));
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

  it('has no mailpit service: only the test stacks\' overrides define it', () => {
    expect(serviceBlock(readFileSync('docker-compose.yml', 'utf8'), 'mailpit')).toBeNull();
  });

  it('finds a service header followed by trailing spaces, and still sees its ports', () => {
    const yaml = 'services:\n  api:  \n    build: ./api\n    ports:\n      - "3000:3000"\n  db:\n    image: x\n';
    const block = serviceBlock(yaml, 'api');
    expect(block).toBeTruthy();
    expect(block).toMatch(/^\s+ports:/m);
  });
});

// Mailpit's web interface has no authentication and shows a branch stack's login codes and reset
// links: test-branch.sh publishes it on the loopback interface only.
describe('scripts/test-branch.sh override', () => {
  it('publishes the Mailpit interface on 127.0.0.1 only', () => {
    const block = serviceBlock(readFileSync('scripts/test-branch.sh', 'utf8'), 'mailpit');
    expect(block).toBeTruthy();
    expect(block).toMatch(/ports: \["127\.0\.0\.1:\$\{MAIL_PORT\}:8025"\]/);
  });
});
