import { describe, expect, it } from 'vitest';
import { formatFilterRange } from '../filterRange';
describe('filter range readout', () => {
  it('shows coincident limits once', () => expect(formatFilterRange([933,933],0,'m')).toBe('933 m'));
  it('keeps precision and negative slopes', () => expect(formatFilterRange([-10.1,10.7],1,'%')).toBe('-10.1 – 10.7 %'));
  it('shows length with its unit', () => expect(formatFilterRange([0,50],2,'km')).toBe('0.00 – 50.00 km'));
});
