import type { ResourceType } from '../types/resource';

export interface TapdMemberClassification {
  type: ResourceType;
  group: string;
  role: string;
  workforceType?: string;
  supplierAffiliation?: string;
}

/**
 * Classify TAPD member groups. Groups named "供应商-姓名/名称" represent
 * pre-base trial members in this workspace: keep them under 基地人员/测试,
 * while retaining the supplier affiliation for display and auditing.
 */
export function classifyTapdMember(
  memberGroups: string[],
  tapdGroup: string,
  defaultRole: string,
): TapdMemberClassification {
  const supplierTestGroup = memberGroups.find(group => /^供应商\s*[-—_：:]\s*\S+/.test(group.trim()));
  if (supplierTestGroup) {
    const supplierAffiliation = supplierTestGroup.replace(/^供应商\s*[-—_：:]\s*/, '').trim();
    return {
      type: 'base',
      group: '测试',
      role: '测试',
      workforceType: supplierAffiliation ? `供应商测试·${supplierAffiliation}` : '供应商测试',
      supplierAffiliation: supplierAffiliation || undefined,
    };
  }

  const workforceType = memberGroups.find(group =>
    /(基地|外包|派遣|正式员工|实习|校招|社招|供应商|合作方|编制)/.test(group)
  );
  const type: ResourceType = workforceType && /供应商|合作方|外包/.test(workforceType)
    ? 'cp'
    : workforceType && /基地/.test(workforceType)
      ? 'base'
      : 'internal';
  return { type, group: tapdGroup, role: defaultRole, workforceType };
}
