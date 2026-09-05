// @ts-nocheck - Test mocks don't need full type fidelity
// Stage 0.5c: TrackView.vue must import getColorForId from utils/trackColors.js,
// not redefine it inline. (Verified via a source-grep test because the
// alternative is to render TrackView.vue and inspect the call site, which
// would require a heavy test setup.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const trackViewPath = resolve(here, '../TrackView.vue');

describe('TrackView.vue getColorForId source (stage 0.5c)', () => {
  it('imports getColorForId from utils/trackColors', () => {
    const src = readFileSync(trackViewPath, 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*getColorForId[^}]*\}\s*from\s*['"]\.\.\/utils\/trackColors(\.js)?['"]/);
  });
  it('does not redefine getColorForId inline', () => {
    const src = readFileSync(trackViewPath, 'utf8');
    expect(src).not.toMatch(/^function\s+getColorForId\s*\(/m);
  });
});
