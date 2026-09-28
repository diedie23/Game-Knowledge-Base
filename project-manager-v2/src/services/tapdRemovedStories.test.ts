import { describe, expect, it } from 'vitest';
import { extractRemovedStoryIds } from './tapdService';

describe('extractRemovedStoryIds', () => {
  it('reads official TAPD RemovedStory wrappers', () => {
    expect(extractRemovedStoryIds({
      status: 1,
      data: [
        { RemovedStory: { id: '101', deleted: '2026-09-28 10:00:00' } },
        { RemovedStory: { id: 102 } },
      ],
    })).toEqual(['101', '102']);
  });

  it('accepts MCP flattened results and removes duplicate IDs', () => {
    expect(extractRemovedStoryIds([
      { id: '201' },
      { Story: { id: '201' } },
      { RemovedStory: { id: '202' } },
    ])).toEqual(['201', '202']);
  });
});
