import { db } from '../db/db';
import type { Resource } from '../types';
import {
  chooseCanonicalResource,
  getSafeResourceMergeKey,
} from '../utils/resourceDedup';

const LEGACY_MOCK_RESOURCES = new Map([
  ['alice (ui)', 'designer'],
  ['bob (fe)', 'frontend'],
  ['charlie (be)', 'backend'],
]);

function isLegacyMockResource(resource: Resource): boolean {
  const name = resource.name.trim().toLowerCase();
  const role = resource.role.trim().toLowerCase();
  return LEGACY_MOCK_RESOURCES.get(name) === role
    && !resource.tapdAccount?.trim()
    && !resource.projectIds?.length
    && !resource.tapdGroups?.length
    && !resource.supplierAffiliation?.trim()
    && !resource.typeLocked;
}

function mergeTaskAssigneeIds(ids: number[] | undefined, replacements: Map<number, number>): number[] | undefined {
  if (!ids) return ids;
  return [...new Set(ids.map(id => replacements.get(Number(id)) || Number(id)))];
}

/**
 * Repair local resource data after older title-sync versions created duplicate
 * supplier placeholders, and remove only the explicitly seeded demo members.
 *
 * The operation is intentionally conservative:
 * - same TAPD account is safe to merge;
 * - title-generated CP placeholders are safe to merge by normalized supplier;
 * - same-name real CP people are never merged automatically;
 * - task, capacity, risk, and notebook references are rewired before deletion.
 */
export async function repairResourceData(): Promise<{
  mergedResources: number;
  removedLegacyResources: number;
  rewiredTasks: number;
}> {
  return db.transaction(
    'rw',
    db.resources,
    db.tasks,
    db.resourceCapacities,
    db.riskRecords,
    db.projectNotes,
    async () => {
      const resources = await db.resources.toArray();
      const replacements = new Map<number, number>();
      const groups = new Map<string, Resource[]>();

      for (const resource of resources) {
        if (!resource.id) continue;
        const key = getSafeResourceMergeKey(resource);
        if (!key) continue;
        const group = groups.get(key) || [];
        group.push(resource);
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const canonical = chooseCanonicalResource(group);
        if (!canonical?.id) continue;
        for (const duplicate of group) {
          if (duplicate.id && duplicate.id !== canonical.id) replacements.set(duplicate.id, canonical.id);
        }
      }

      const legacyIds = resources
        .filter(isLegacyMockResource)
        .map(resource => resource.id)
        .filter((id): id is number => id != null);
      for (const id of legacyIds) replacements.delete(id);

      let rewiredTasks = 0;
      if (replacements.size > 0 || legacyIds.length > 0) {
        await db.tasks.toCollection().modify(task => {
          const before = task.assigneeIds || [];
          const after = mergeTaskAssigneeIds(before, replacements)
            ?.filter(id => !legacyIds.includes(id));
          const legacyAssignee = task.assigneeId == null ? undefined : Number(task.assigneeId);
          const nextLegacyAssignee = legacyAssignee == null
            ? undefined
            : replacements.get(legacyAssignee) || legacyAssignee;
          const legacyAssigneeChanged = legacyAssignee != null
            && (legacyIds.includes(nextLegacyAssignee!) || nextLegacyAssignee !== legacyAssignee);
          if (JSON.stringify(before) !== JSON.stringify(after) || legacyAssigneeChanged) {
            task.assigneeIds = after;
            if (legacyAssigneeChanged) {
              if (legacyIds.includes(nextLegacyAssignee!)) delete task.assigneeId;
              else task.assigneeId = nextLegacyAssignee;
            }
            rewiredTasks++;
          }
        });

        const capacities = await db.resourceCapacities.toArray();
        for (const capacity of capacities) {
          const replacement = replacements.get(capacity.resourceId);
          if (legacyIds.includes(capacity.resourceId)) {
            await db.resourceCapacities.delete(capacity.resourceId);
            continue;
          }
          if (replacement) {
            const existingCapacity = await db.resourceCapacities.get(replacement);
            if (!existingCapacity || (capacity.updatedAt || 0) > (existingCapacity.updatedAt || 0)) {
              await db.resourceCapacities.put({ ...capacity, resourceId: replacement });
            }
            await db.resourceCapacities.delete(capacity.resourceId);
          }
        }

        await db.riskRecords.toCollection().modify(record => {
          if (record.ownerId == null) return;
          const replacement = replacements.get(record.ownerId);
          if (replacement) record.ownerId = replacement;
          if (legacyIds.includes(record.ownerId)) record.ownerId = undefined;
        });

        await db.projectNotes.toCollection().modify(note => {
          if (!Array.isArray(note.ownerIds)) return;
          note.ownerIds = [...new Set(note.ownerIds
            .map(id => replacements.get(id) || id)
            .filter(id => !legacyIds.includes(id)))];
        });
      }

      const duplicateIds = [...replacements.keys()];
      if (duplicateIds.length > 0) await db.resources.bulkDelete(duplicateIds);
      if (legacyIds.length > 0) await db.resources.bulkDelete(legacyIds);

      return {
        mergedResources: duplicateIds.length,
        removedLegacyResources: legacyIds.length,
        rewiredTasks,
      };
    },
  );
}
