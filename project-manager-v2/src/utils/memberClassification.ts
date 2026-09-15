import type { Resource, ResourceType } from '../types/resource';

export interface TapdMemberClassification {
  type: ResourceType;
  group: string;
  role: string;
  workforceType?: string;
  supplierAffiliation?: string;
}

export interface ResolvedMemberType {
  type: ResourceType;
  typeLocked: boolean;
}

/** Preserve explicit local personnel ownership while allowing TAPD to classify untouched members. */
export function resolveMemberTypeAfterTapdSync(
  existing: Pick<Resource, 'type' | 'typeLocked' | 'workforceType'> | undefined,
  incomingType: ResourceType,
): ResolvedMemberType {
  if (!existing) return { type: incomingType, typeLocked: false };

  if (existing.typeLocked && existing.type) {
    return { type: existing.type, typeLocked: true };
  }

  // Compatibility for members manually classified before typeLocked existed.
  if (existing.workforceType?.trim() === '基地人员') {
    return { type: 'base', typeLocked: true };
  }
  if (existing.type === 'cp' && /供应商|外包|合作方/.test(existing.workforceType || '')) {
    return { type: 'cp', typeLocked: true };
  }

  return { type: incomingType, typeLocked: false };
}

/** Classify TAPD member groups while keeping supplier trial members under CP. */
export function classifyTapdMember(
  memberGroups: string[],
  tapdGroup: string,
  defaultRole: string,
  memberName = '',
): TapdMemberClassification {
  const supplierMemberGroup = memberGroups.find(group => /^供应商(?:\s*[-—_：:]\s*\S+)?$/.test(group.trim()));
  if (supplierMemberGroup) {
    const nameSupplier = memberName.trim().match(/^([^\-—_]+)[\-—_]\s*.+$/)?.[1]?.trim();
    const supplierAffiliation = nameSupplier || supplierMemberGroup.replace(/^供应商\s*[-—_：:]\s*/, '').trim();
    const role = /动效|动画|motion|vfx/i.test(defaultRole) ? 'CP-动效' : 'CP-UI设计';
    return {
      type: 'cp',
      group: supplierAffiliation || '供应商',
      role,
      workforceType: '供应商',
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
