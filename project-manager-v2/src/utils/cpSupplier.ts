import type { Resource } from '../types';

const GENERIC_LABELS = new Set([
  'cp', '外包', '供应商', '合作方', 'ui', 'ux', 'layout', '设计', '美术', '动效', '交互',
]);

export function normalizeSupplierName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s_\-—–·•:：/\\()[\]【】<>《》]+/g, '');
}

/** Extract supplier names from markers such as （CP全速）, (CP-全速), or 【CP：全速】. */
export function extractCpSupplierNames(title: string): string[] {
  const names: string[] = [];
  const pattern = /[（(【[]\s*CP\s*[-—_:：]?\s*([^）)】\]]+?)\s*[）)】\]]/gi;
  for (const match of title.matchAll(pattern)) {
    const name = String(match[1] || '').trim().replace(/^供应商\s*[:：]?\s*/, '');
    const key = normalizeSupplierName(name);
    if (key.length >= 2 && !GENERIC_LABELS.has(key)) names.push(name);
  }
  return Array.from(new Set(names));
}

/** Infer the supplier discipline from the TAPD owners, with title as fallback. */
export function inferCpSupplierRole(title: string, ownerResources: Resource[]): 'CP-动效' | 'CP-UI设计' {
  const context = [...ownerResources.map(resource => resource.role), title].join(' ').toLowerCase();
  return /动效|动画|vfx|motion/.test(context) ? 'CP-动效' : 'CP-UI设计';
}

/** Internal coordinators paired with base/CP executors should use follow-up load. */
export function hasFollowupAssignment(assigneeIds: number[], resources: Resource[]): boolean {
  const assigned = assigneeIds
    .map(id => resources.find(resource => resource.id === id))
    .filter((resource): resource is Resource => !!resource);
  const hasInternal = assigned.some(resource => !resource.type || resource.type === 'internal');
  const hasExecutionPartner = assigned.some(resource => resource.type === 'base' || resource.type === 'cp');
  return hasInternal && hasExecutionPartner;
}

/**
 * Match CP supplier resources explicitly named in a TAPD title.
 * Configured names and explicit CP markers are normalized before matching.
 */
export function matchCpResourcesFromTitle(title: string, resources: Resource[]): number[] {
  const normalizedTitle = normalizeSupplierName(title || '');
  if (!normalizedTitle) return [];

  const markerKeys = extractCpSupplierNames(title).map(normalizeSupplierName);
  const candidates = resources
    .filter((resource): resource is Resource & { id: number } => resource.type === 'cp' && !!resource.id)
    .map(resource => ({ resource, key: normalizeSupplierName(resource.name || '') }))
    .filter(({ key }) =>
      key.length >= 2
      && !GENERIC_LABELS.has(key)
      && (normalizedTitle.includes(key) || markerKeys.includes(key))
    )
    .sort((a, b) => b.key.length - a.key.length);

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.some(item => item.key.includes(candidate.key))) continue;
    selected.push(candidate);
  }
  return selected.map(({ resource }) => resource.id);
}
