import {
  buildInventorySnapshotsMeta,
  LIGHTWEIGHT_INVENTORY_SENSOR_DECLARATIONS,
} from './lightweight-live-inventory.registry';

describe('lightweight-live-inventory.registry', () => {
  it('buildInventorySnapshotsMeta skips empty and computes stale_after_iso', () => {
    const meta = buildInventorySnapshotsMeta({
      flight: '2026-06-01T12:00:00.000Z',
      hotel: undefined,
    });
    expect(meta?.registry_version).toBe(1);
    expect(meta?.sensors.length).toBe(1);
    expect(meta?.sensors[0].sensor_id).toBe('flight');
    expect(meta?.sensors[0].default_ttl_seconds).toBe(
      LIGHTWEIGHT_INVENTORY_SENSOR_DECLARATIONS.flight.default_ttl_seconds,
    );
    expect(meta?.sensors[0].stale_after_iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns undefined when no snapshots', () => {
    expect(buildInventorySnapshotsMeta({})).toBeUndefined();
  });
});
