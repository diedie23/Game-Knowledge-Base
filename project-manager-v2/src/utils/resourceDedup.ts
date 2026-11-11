import type { Resource } from '../types';
import { normalizeSupplierIdentity } from './cpSupplier';

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

/** A placeholder generated from a title marker such as "（CP全速）". */
export function isGeneratedSupplierResource(resource: Resource): boolean {
  return resource.type === 'cp'
    && !resource.tapdAccount?.trim()
    && !resource.supplierAffiliation?.trim()
    && /供应商|外包|合作方/.test(resource.workforceType || '')
    && /^CP[-—_：:]?/.test(resource.role || '');
}

/**
 * Return conservative identity keys for a supplier resource.
 * Account and affiliation are authoritative; a name-only key is used only
 * for title-generated placeholders, never for arbitrary CP people.
 */
export function getSupplierResourceIdentityKeys(resource: Resource): string[] {
  if (resource.type !== 'cp') return [];
  const keys = new Set<string>();
  const account = resource.tapdAccount?.trim().toLowerCase();
  if (account) keys.add(`account:${account}`);
  const affiliation = normalizeSupplierIdentity(resource.supplierAffiliation || '');
  if (affiliation.length >= 2) keys.add(`supplier:${affiliation}`);
  if (isGeneratedSupplierResource(resource)) {
    const name = normalizeSupplierIdentity(resource.name || '');
    if (name.length >= 2) keys.add(`supplier:${name}`);
  }
  return [...keys];
}

/**
 * Only return a merge key when the records are safe to consolidate. This
 * deliberately avoids merging two real CP people merely because their names
 * happen to be the same.
 */
export function getSafeResourceMergeKey(resource: Resource): string | undefined {
  const account = resource.tapdAccount?.trim().toLowerCase();
  if (account && resource.type === 'cp') return `account:${account}`;
  if (isGeneratedSupplierResource(resource)) {
    const supplier = normalizeSupplierIdentity(resource.name || '');
    return supplier.length >= 2 ? `supplier:${supplier}` : undefined;
  }
  return undefined;
}

/** Prefer TAPD-backed and richly classified records as canonical records. */
export function chooseCanonicalResource(resources: Resource[]): Resource | undefined {
  return [...resources].sort((left, right) => {
    const score = (item: Resource) =>
      (item.tapdAccount?.trim() ? 100 : 0)
      + (item.supplierAffiliation?.trim() ? 20 : 0)
      + (item.typeLocked ? 10 : 0)
      + (item.projectIds?.length || 0)
      + (item.id ? 1 : 0);
    return score(right) - score(left) || (left.id || 0) - (right.id || 0);
  })[0];
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
