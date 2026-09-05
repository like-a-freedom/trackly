import { describe, it, expect } from 'vitest';
import { useConfirm } from '../useConfirm';

describe('useConfirm alias (stage 0.5a)', () => {
  it('exposes confirm as an alias of showConfirm', () => {
    const { confirm, showConfirm } = useConfirm();
    expect(confirm).toBe(showConfirm);
  });
});
