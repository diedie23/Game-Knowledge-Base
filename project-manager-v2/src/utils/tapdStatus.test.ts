import { describe, expect, it } from 'vitest';
import { mapTapdStatus } from './tapdStatus';

describe('mapTapdStatus', () => {
  it.each(['rejected', '已拒绝', '驳回', 'cancelled'])(
    'keeps rejected state %s separate from completion',
    value => expect(mapTapdStatus(value)).toBe('cancelled'),
  );

  it.each(['resolved', '已完成', '验收中', '无需合入'])(
    'maps completed state %s to done',
    value => expect(mapTapdStatus(value)).toBe('done'),
  );
});
