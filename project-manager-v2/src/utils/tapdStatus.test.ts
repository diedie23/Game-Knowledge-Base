import { describe, expect, it } from 'vitest';
import { applyTapdCompletionStatus, mapTapdStatus } from './tapdStatus';

describe('mapTapdStatus', () => {
  it.each(['rejected', '已拒绝', '驳回', 'cancelled'])(
    'keeps rejected state %s separate from completion',
    value => expect(mapTapdStatus(value)).toBe('cancelled'),
  );

  it.each(['resolved', 'released', '已完成', '验收中', '已发布', '已上线', '无需合入'])(
    'maps completed state %s to done',
    value => expect(mapTapdStatus(value)).toBe('done'),
  );

  it('uses TAPD completion time for custom terminal states without conflating rejection', () => {
    const completedAt = new Date(2026, 8, 15);
    expect(applyTapdCompletionStatus(mapTapdStatus('custom_terminal'), completedAt)).toBe('done');
    expect(applyTapdCompletionStatus(mapTapdStatus('已拒绝'), completedAt)).toBe('cancelled');
  });
});
