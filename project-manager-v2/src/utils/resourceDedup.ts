import type { Resource } from '../types';

function nameKey(resource: Pick<Resource, 'name'>): string {
  return resource.name.trim().replace(/\s+/g, '').toLowerCase();
}

export function isSupplierPersonResource(resource: Resource): boolean {
  return resource.type === 'cp' && (
    !!resource.tapdAccount
    || !!resource.supplierAffiliation
    || /供应商|外包|合作方/.test(resource.workforceType || '')
  );
}

/** Prefer one authoritative CP record when the same supplier person exists more than once. */
export function dedupeResourcesForDisplay(resources: Resource[]): Resource[] {
  const canonicalByName = new Map<string, Resource>();
  for (const resource of resources) {
    if (!isSupplierPersonResource(resource)) continue;
    const key = nameKey(resource);
    const current = canonicalByName.get(key);
    const score = (item: Resource) => (item.tapdAccount ? 4 : 0) + (item.supplierAffiliation ? 2 : 0) + (item.id ? 1 : 0);
    if (!current || score(resource) > score(current)) canonicalByName.set(key, resource);
  }
  return resources.filter(resource => {
    const canonical = canonicalByName.get(nameKey(resource));
    return !canonical || canonical.id === resource.id;
  });
}

/** Task assignments on hidden duplicate records count toward the visible CP member. */
export function getResourceAliasIds(resource: Resource, allResources: Resource[]): number[] {
  if (!resource.id) return [];
  if (!isSupplierPersonResource(resource)) return [resource.id];
  const key = nameKey(resource);
  return allResources
    .filter(candidate => candidate.id && nameKey(candidate) === key)
    .map(candidate => candidate.id!);
}
