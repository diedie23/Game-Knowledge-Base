import { describe, expect, it } from 'vitest';
import { classifyTapdMember } from './memberClassification';

describe('TAPD member classification', () => {
  it('places supplier-name trial members under base testing', () => {
    expect(classifyTapdMember(['UX-视觉', '供应商-小林'], 'UX-视觉', 'UI设计')).toEqual({
      type: 'base',
      group: '测试',
      role: '测试',
      workforceType: '供应商测试·小林',
      supplierAffiliation: '小林',
    });
  });

  it('keeps ordinary supplier and base groups unchanged', () => {
    expect(classifyTapdMember(['UX-动效', '供应商'], 'UX-动效', '动效').type).toBe('cp');
    expect(classifyTapdMember(['UX-视觉', '基地人员'], 'UX-视觉', 'UI设计').type).toBe('base');
  });
});
