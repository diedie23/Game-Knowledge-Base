import type { Resource } from '../types';

const GENERIC_LABELS = new Set([
  'cp', '外包', '供应商', '合作方', 'ui', 'ux', 'layout', '设计', '美术', '动效', '交互',
]);

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s_\-—–·•:：/\\()[\]【】<>《》]+/g, '');
}

/**
 * Match CP supplier resources explicitly named in a TAPD title.
 * Only configured CP resources are considered, which prevents generic title
 * words from creating supplier assignments.
 */
export function matchCpResourcesFromTitle(title: string, resources: Resource[]): number[] {
  const normalizedTitle = normalize(title || '');
  if (!normalizedTitle) return [];

  const candidates = resources
    .filter((resource): resource is Resource & { id: number } => resource.type === 'cp' && !!resource.id)
    .map(resource => ({ resource, key: normalize(resource.name || '') }))
    .filter(({ key }) => key.length >= 2 && !GENERIC_LABELS.has(key) && normalizedTitle.includes(key))
    .sort((a, b) => b.key.length - a.key.length);

  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.some(item => item.key.includes(candidate.key))) continue;
    selected.push(candidate);
  }
  return selected.map(({ resource }) => resource.id);
}
