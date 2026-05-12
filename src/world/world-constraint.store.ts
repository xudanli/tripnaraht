/**
 * WorldConstraintStore — 当前世界约束唯一快照（非事件流、非 cache）
 */

import type { ConstraintField, ConstraintDomain } from './constraint-field.interface';

export class WorldConstraintStore {
  readonly roads = new Map<string, ConstraintField>();

  readonly weather = new Map<string, ConstraintField>();

  readonly bookings = new Map<string, ConstraintField>();

  version = 0;

  lastUpdatedAt = 0;

  private pickMap(
    type: ConstraintDomain,
  ): Map<string, ConstraintField> {
    switch (type) {
      case 'ROAD':
        return this.roads;
      case 'WEATHER':
        return this.weather;
      case 'BOOKING':
        return this.bookings;
      default: {
        const _e: never = type;
        return _e;
      }
    }
  }

  /**
   * 覆盖写入同 id 约束；递增全局 `version` 与 `lastUpdatedAt`，并写入条目级 `version`。
   */
  upsert(field: ConstraintField): void {
    this.version++;
    this.lastUpdatedAt = Date.now();
    const stamped: ConstraintField = { ...field, version: this.version };
    this.pickMap(field.type).set(field.id, stamped);
  }

  get(domain: ConstraintDomain, id: string): ConstraintField | undefined {
    return this.pickMap(domain).get(id);
  }
}
