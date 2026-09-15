import { describe, expect, it } from 'vitest';
import { classifyTapdMember } from './memberClassification';

describe('TAPD member classification', () => {
  it('keeps supplier-name trial members under the matching CP supplier', () => {
    expect(classifyTapdMember(['UX-视觉', '供应商-小林'], 'UX-视觉', 'UI设计')).toEqual({
      type: 'cp',
      group: '小林',
      role: 'CP-UI设计',
      workforceType: '供应商',
      supplierAffiliation: '小林',
    });
    expect(classifyTapdMember(['UX-动效', '供应商'], 'UX-动效', '动效', '全速-伍旭娇')).toMatchObject({
      type: 'cp', group: '全速', role: 'CP-动效',
    });
  });

  it('keeps ordinary supplier and base groups unchanged', () => {
    expect(classifyTapdMember(['UX-动效', '供应商'], 'UX-动效', '动效').type).toBe('cp');
    expect(classifyTapdMember(['UX-视觉', '基地人员'], 'UX-视觉', 'UI设计').type).toBe('base');
  });
});
