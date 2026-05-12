import type { ComplexSideEffect, SideEffectApplyResult, SideEffectPreviewResult } from '../../interfaces/side-effect.interface';
import type { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_TTL_SECONDS = 15 * 60;

function isoInSeconds(ttlSeconds: number): string {
  const msFromNow = Math.max(0, Math.round(ttlSeconds * 1000));
  return new Date(Date.now() + msFromNow).toISOString();
}

function resolveInventoryId(ctx: any, params?: Record<string, any>): string | null {
  const explicit = params?.inventory_id ?? params?.inventoryId;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const ai = ctx?.action_input ?? {};
  const fromInput = ai.inventory_id ?? ai.inventoryId ?? ai.item_id ?? ai.itemId;
  if (typeof fromInput === 'string' && fromInput.trim()) return fromInput.trim();
  const targetRef = ctx?.target_ref;
  if (typeof targetRef === 'string' && targetRef.trim()) return targetRef.trim();
  return null;
}

export function createResourceLockSideEffect(prisma?: PrismaService): ComplexSideEffect {
  return {
    id: 'side_effect.resource_lock.inventory_v1',
    kind: 'RESOURCE_LOCK',
    evidenceRequired: true,
    async preview(ctx, params): Promise<SideEffectPreviewResult | null> {
      const inventoryId = resolveInventoryId(ctx, params);
      if (!inventoryId) return null;
      const ttl_seconds =
        typeof params?.ttl_seconds === 'number' && Number.isFinite(params.ttl_seconds) && params.ttl_seconds > 0
          ? params.ttl_seconds
          : DEFAULT_TTL_SECONDS;
      return {
        kind: 'RESOURCE_LOCK',
        deltaType: 'RESOURCE_AVAILABILITY',
        confidence: 0.9,
        expiresAt: isoInSeconds(ttl_seconds),
        evidenceBundle: {
          kind: 'side_effect_evidence',
          message: 'Inventory lock preview (no side effects applied).',
          evidence: { inventory_id: inventoryId, ttl_seconds },
        },
      };
    },
    async apply(ctx, params): Promise<SideEffectApplyResult | null> {
      const inventoryId = resolveInventoryId(ctx, params);
      if (!inventoryId) return null;
      const ttl_seconds =
        typeof params?.ttl_seconds === 'number' && Number.isFinite(params.ttl_seconds) && params.ttl_seconds > 0
          ? params.ttl_seconds
          : DEFAULT_TTL_SECONDS;
      const expiresAt = isoInSeconds(ttl_seconds);
      if (prisma?.isDbConnected()) {
        const row = await (prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: inventoryId } });
        if (!row) {
          throw new Error(`Inventory not found: ${inventoryId}`);
        }
        if (String(row.availability ?? 'AVAILABLE').toUpperCase() === 'SOLD_OUT') {
          throw new Error(`Inventory sold out: ${inventoryId}`);
        }
        if (row.lockable === false) {
          throw new Error(`Inventory not lockable: ${inventoryId}`);
        }
        await (prisma as any).physicalDomainInventoryItem.update({
          where: { id: inventoryId },
          data: { holdExpiresAt: new Date(expiresAt) },
        });
      }
      return {
        kind: 'RESOURCE_LOCK',
        state_patch: {
          side_effects: {
            inventory_locks: [
              {
                lock_id: `invlock_${ctx.action_id}_${inventoryId}`,
                inventory_id: inventoryId,
                action_id: ctx.action_id,
                action_name: ctx.action_name,
                status: 'LOCKED',
                expires_at: expiresAt,
              },
            ],
          },
        },
        evidenceBundle: {
          kind: 'side_effect_evidence',
          message: 'Inventory lock applied.',
          evidence: { inventory_id: inventoryId, expires_at: expiresAt },
        },
      };
    },
    async rollback(ctx, params): Promise<SideEffectApplyResult | null> {
      const inventoryId = resolveInventoryId(ctx, params);
      if (!inventoryId) return null;
      if (prisma?.isDbConnected()) {
        await (prisma as any).physicalDomainInventoryItem
          .update({
            where: { id: inventoryId },
            data: { holdExpiresAt: null },
          })
          .catch(() => undefined);
      }
      return {
        kind: 'RESOURCE_LOCK',
        state_patch: {
          side_effects: {
            inventory_locks_released: [
              {
                lock_id: `invlock_${ctx.action_id}_${inventoryId}`,
                inventory_id: inventoryId,
                status: 'RELEASED',
              },
            ],
          },
        },
        evidenceBundle: {
          kind: 'side_effect_evidence',
          message: 'Inventory lock released (rollback).',
          evidence: { inventory_id: inventoryId },
        },
      };
    },
  };
}

