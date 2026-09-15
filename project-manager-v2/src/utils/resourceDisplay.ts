import type { Resource } from '../types';

/** Use role-name for internal members so same-name accounts remain distinguishable. */
export function formatResourceDisplayName(resource: Pick<Resource, 'name' | 'role' | 'type'>): string {
  if ((resource.type || 'internal') !== 'internal' || !resource.role) return resource.name;
  const role = resource.role.trim();
  const name = resource.name.trim();
  if (!role || name.startsWith(`${role}-`) || name.startsWith(`${role}·`)) return name;
  return `${role}-${name}`;
}
