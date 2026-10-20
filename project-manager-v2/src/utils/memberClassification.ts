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

/** Normalize TAPD group labels before comparing values returned by different API deployments. */
export function normalizeTapdGroupName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\s]+/g, '')
    .trim();
}

/**
 * Convert the several /roles response shapes used by TAPD into one id -> label map.
 * TAPD installations may return an object map, a list of Role records, or a wrapped list.
 */
export function extractTapdRoleNames(rawData: unknown): Map<string, string> {
  const data = rawData as any;
  const source = data?.roles ?? data?.Roles ?? data?.Role ?? data?.items ?? data;
  const entries: Array<{ id?: unknown; name?: unknown; key?: unknown; value?: unknown }> = [];

  if (Array.isArray(source)) {
    source.forEach(item => {
      const roleItems = Array.isArray(item?.Role) ? item.Role : [item?.Role ?? item?.role ?? item];
      roleItems.forEach(role => {
        if (role && typeof role === 'object') {
          entries.push({
            id: role.id ?? role.role_id ?? role.key,
            name: role.name ?? role.role_name ?? role.title ?? role.label,
          });
        }
      });
    });
  } else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number') {
        entries.push({ id: key, name: value });
        return;
      }
      const role = (value as any)?.Role ?? (value as any)?.role ?? value;
      if (role && typeof role === 'object') {
        entries.push({
          id: (role as any).id ?? (role as any).role_id ?? key,
          name: (role as any).name ?? (role as any).role_name ?? (role as any).title ?? (role as any).label,
        });
      }
    });
  }

  return new Map(
    entries
      .map(({ id, name }) => [String(id ?? '').trim(), String(name ?? '').trim()] as const)
      .filter(([id, name]) => Boolean(id && name)),
  );
}

/**
 * Extract member group labels from role ids plus direct group fields. This keeps
 * classification working when TAPD returns role names instead of role ids.
 */
export function extractTapdMemberGroups(member: any, roleNames: Map<string, string>): string[] {
  const values: unknown[] = [];
  const roleIds = Array.isArray(member?.role_id)
    ? member.role_id
    : String(member?.role_id ?? '').split(/[,，;；|]/).map(value => value.trim()).filter(Boolean);
  roleIds.forEach((roleId: unknown) => values.push(roleNames.get(String(roleId).trim()) || roleId));

  for (const field of ['role', 'role_name', 'roleName', 'roles', 'groups', 'group', 'department', 'workforce_type', 'workforceType']) {
    const value = member?.[field];
    if (Array.isArray(value)) values.push(...value);
    else if (value != null) values.push(...String(value).split(/[,，;；|]/));
  }

  return Array.from(new Set(values
    .map(value => String(value ?? '').trim())
    .filter(Boolean)));
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
  const groups = memberGroups.map(group => String(group).trim()).filter(Boolean);
  const compactGroups = groups.map(normalizeTapdGroupName);
  const supplierTestIndex = compactGroups.findIndex(group => /^供应商[-—_：:].+/.test(group));
  const baseIndex = compactGroups.findIndex(group => /基地/.test(group));
  const cpIndex = compactGroups.findIndex(group => /(?:^|[^正式])(?:CP|供应商|外包|合作方|外协|第三方|厂商)/i.test(group));

  // A named supplier group is authoritative: it is an external CP account,
  // even when the same user also belongs to a UX role group.
  if (supplierTestIndex >= 0 || cpIndex >= 0) {
    const supplierGroup = groups[supplierTestIndex >= 0 ? supplierTestIndex : cpIndex] || '';
    const nameSupplier = memberName.trim().match(/^([^—_ -]+)[—_ -]\s*.+$/)?.[1]?.trim();
    const supplierAffiliation = nameSupplier
      || supplierGroup.replace(/^(?:供应商|CP|外包|合作方|外协)\s*[-—_：:]?\s*/i, '').trim();
    const role = /动效|动画|motion|vfx/i.test(defaultRole) ? 'CP-动效' : 'CP-UI设计';
    return {
      type: 'cp',
      group: supplierAffiliation || '供应商',
      role,
      workforceType: '供应商',
      supplierAffiliation: supplierAffiliation || undefined,
    };
  }

  // Base must be checked before the generic internal fallback. TAPD often
  // returns "基地人员" as a separate role beside UX-视觉/UX-动效.
  if (baseIndex >= 0) {
    return {
      type: 'base',
      group: tapdGroup,
      role: defaultRole,
      workforceType: groups[baseIndex] || '基地人员',
    };
  }

  const workforceIndex = compactGroups.findIndex(group =>
    /(派遣|正式员工|实习|校招|社招|编制)/.test(group),
  );
  const workforceType = workforceIndex >= 0 ? groups[workforceIndex] : undefined;
  return { type: 'internal', group: tapdGroup, role: defaultRole, workforceType };
}
