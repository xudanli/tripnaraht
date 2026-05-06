import { PhysicalDomainAdminController } from './physical-domain-admin.controller';
import { PhysicalValidatorService } from '../../domain/ontology/validator/physical-validator.service';

describe('PhysicalDomainAdminController', () => {
  let c: PhysicalDomainAdminController;
  let db: {
    budgets: Map<string, any>;
    inventory: Map<string, any>;
    constraints: Map<string, any>;
    sources: Map<string, any>;
  };

  beforeEach(() => {
    db = {
      budgets: new Map(),
      inventory: new Map(),
      constraints: new Map(),
      sources: new Map(),
    };
    const prisma: any = {
      physicalDomainBudget: {
        findUnique: jest.fn(async ({ where }: any) => db.budgets.get(where.accountId) ?? null),
        findMany: jest.fn(async () => Array.from(db.budgets.values())),
        upsert: jest.fn(async ({ where, update, create }: any) => {
          const cur = db.budgets.get(where.accountId);
          const next = cur ? { ...cur, ...update } : { ...create };
          db.budgets.set(where.accountId, next);
          return next;
        }),
      },
      physicalDomainInventoryItem: {
        findUnique: jest.fn(async ({ where }: any) => db.inventory.get(where.id) ?? null),
        findMany: jest.fn(async () => Array.from(db.inventory.values())),
        upsert: jest.fn(async ({ where, update, create }: any) => {
          const cur = db.inventory.get(where.id);
          const next = cur ? { ...cur, ...update } : { ...create };
          db.inventory.set(where.id, next);
          return next;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const cur = db.inventory.get(where.id);
          const next = { ...cur, ...data };
          db.inventory.set(where.id, next);
          return next;
        }),
      },
      physicalDomainConstraintConfig: {
        findUnique: jest.fn(async ({ where }: any) => db.constraints.get(where.ruleId) ?? null),
        findMany: jest.fn(async () => Array.from(db.constraints.values())),
        upsert: jest.fn(async ({ where, update, create }: any) => {
          const cur = db.constraints.get(where.ruleId);
          const next = cur ? { ...cur, ...update } : { ...create };
          db.constraints.set(where.ruleId, next);
          return next;
        }),
        delete: jest.fn(async ({ where }: any) => {
          const cur = db.constraints.get(where.ruleId) ?? null;
          db.constraints.delete(where.ruleId);
          return cur;
        }),
      },
      physicalDomainDataSourceConfig: {
        findUnique: jest.fn(async ({ where }: any) => db.sources.get(where.sourceId) ?? null),
        findMany: jest.fn(async () => Array.from(db.sources.values())),
        upsert: jest.fn(async ({ where, update, create }: any) => {
          const cur = db.sources.get(where.sourceId);
          const next = cur ? { ...cur, ...update } : { ...create };
          db.sources.set(where.sourceId, next);
          return next;
        }),
      },
    };
    c = new PhysicalDomainAdminController(prisma, new PhysicalValidatorService(prisma));
  });

  it('exposes read-only static physical policies (Policy Lab Phase A)', async () => {
    const res = (await c.getStaticPhysicalPolicies()) as any;
    expect(res.success).toBe(true);
    expect(res.data.physical_validator_version).toBeDefined();
    expect(Array.isArray(res.data.policies)).toBe(true);
    expect(res.data.policies[0].id).toBe('ICELAND_HIGHLAND_DEFAULT');
    expect(res.data.policies[0].status).toBe('ACTIVE_FALLBACK');
    expect(res.data.policies[0].open_window_utc.inclusive_from).toBe('06-20');
    expect(res.data.policies[0].open_window_utc.inclusive_to).toBe('10-14');
  });

  it('budget adjust updates available and spent', async () => {
    const before = (await c.getBudget('acct-1') as any).data;
    expect(before.available).toBe(3000);

    await c.adjustBudget('acct-1', { amount: 120, op: 'DEBIT' });
    const after = (await c.getBudget('acct-1') as any).data;
    expect(after.available).toBe(2880);
    expect(after.spent).toBe(120);
  });

  it('budget list supports pagination and filters', async () => {
    await c.patchBudget('acct-usd-1', { total: 1000, available: 800, held: 100, spent: 100 });
    await c.patchBudget('acct-eur-1', { total: 500, available: 500, held: 0, spent: 0 });
    const list = (await c.listBudgets({ q: 'usd', currency: 'USD', page: 1, limit: 10 }) as any).data;
    expect(Array.isArray(list.items)).toBe(true);
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.items.every((x: any) => String(x.accountId).toLowerCase().includes('usd'))).toBe(true);
    expect(list.items.every((x: any) => x.currency === 'USD')).toBe(true);
    expect(list.pagination.page).toBe(1);
    expect(list.pagination.limit).toBe(10);
    expect(typeof list.pagination.total).toBe('number');
  });

  it('budget list supports anomaly status filter', async () => {
    await c.patchBudget('acct-bad-1', { total: 100, available: 80, held: 40, spent: 10 }); // 130 > 100 anomaly
    const out = (await c.listBudgets({ status: 'ANOMALY', page: 1, limit: 50 }) as any).data;
    expect(out.items.some((x: any) => x.accountId === 'acct-bad-1')).toBe(true);
  });

  it('inventory lock/unlock should set and clear holdExpiresAt', async () => {
    await c.createInventory({
      id: 'inv-1',
      type: 'HOTEL',
      price: 100,
      availability: 'AVAILABLE',
      lockable: true,
    });
    const locked = (await c.lockInventory('inv-1', {}) as any).data;
    expect(locked.holdExpiresAt instanceof Date).toBe(true);

    const unlocked = (await c.unlockInventory('inv-1') as any).data;
    expect(unlocked.holdExpiresAt).toBeNull();
  });

  it('constraint patch and rollback should work', async () => {
    await c.patchConstraint('wind_speed_drive_limit_v1', {
      enabled: true,
      threshold: 45,
      description: 'Wind speed hard block threshold',
    });
    const patched = (await c.getConstraints() as any).data.find((x: any) => x.ruleId === 'wind_speed_drive_limit_v1');
    expect(patched.threshold).toBe(45);
    expect(patched.description).toBe('Wind speed hard block threshold');

    await c.rollbackConstraint('wind_speed_drive_limit_v1');
    const rolled = (await c.getConstraints() as any).data.find((x: any) => x.ruleId === 'wind_speed_drive_limit_v1');
    expect(rolled.enabled).toBe(true);
    expect(rolled.params).toEqual({});
  });

  it('get constraint by ruleId should return row', async () => {
    await c.patchConstraint('r-conflict-1', {
      enabled: true,
      params: {
        kind: 'CONFLICT_MATRIX',
        conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
        effect: 'HARD_BLOCK',
        priority: 100,
      } as any,
    });
    const row = (await c.getConstraintByRuleId('r-conflict-1') as any).data;
    expect(row?.ruleId).toBe('r-conflict-1');
  });

  it('delete constraint should remove existing rule', async () => {
    await c.patchConstraint('r-del-1', { enabled: true, threshold: 12 });
    const out = (await c.deleteConstraint('r-del-1') as any).data;
    expect(out.ruleId).toBe('r-del-1');
    expect(out.deleted).toBe(true);
    const row = (await c.getConstraintByRuleId('r-del-1') as any).data;
    expect(row).toBeNull();
  });

  it('delete constraint should be idempotent when rule not found', async () => {
    const out = (await c.deleteConstraint('r-not-found') as any).data;
    expect(out.ruleId).toBe('r-not-found');
    expect(out.deleted).toBe(false);
  });

  it('patch constraint should reject invalid CONFLICT_MATRIX params', async () => {
    await expect(
      c.patchConstraint('bad-rule', {
        enabled: true,
        params: {
          kind: 'CONFLICT_MATRIX',
          conditions: [],
          effect: 'HARD_BLOCK',
          priority: 10,
        } as any,
      }),
    ).rejects.toThrow();
  });

  it('validate constraint should pass on valid CONFLICT_MATRIX params', () => {
    const out = c.validateConstraint({
      params: {
        kind: 'CONFLICT_MATRIX',
        conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
        effect: 'HARD_BLOCK',
        priority: 100,
      } as any,
    });
    expect((out as any).data?.valid).toBe(true);
  });

  it('validate constraint should throw on invalid CONFLICT_MATRIX params', () => {
    expect(() =>
      c.validateConstraint({
        params: {
          kind: 'CONFLICT_MATRIX',
          conditions: [],
          effect: 'HARD_BLOCK',
          priority: 100,
        } as any,
      }),
    ).toThrow();
  });

  it('data source test reflects enabled status', async () => {
    const ok = (await c.testDataSource('weather-api') as any).data;
    expect(ok.ok).toBe(true);

    await c.patchDataSource('weather-api', { enabled: false });
    const bad = (await c.testDataSource('weather-api') as any).data;
    expect(bad.ok).toBe(false);
  });

  it('resource quote should return resourceHash and quote fields', async () => {
    await c.createInventory({
      id: 'inv-q-1',
      type: 'HOTEL',
      price: 230,
      availability: 'AVAILABLE',
      lockable: true,
    });
    const out = (await c.quoteResource({ accountId: 'acct-q-1', inventoryId: 'inv-q-1' }) as any).data;
    expect(out.inventoryId).toBe('inv-q-1');
    expect(out.price).toBe(230);
    expect(typeof out.resourceHash).toBe('string');
    expect(out.resourceHash.length).toBe(64);
  });

  it('resource hold + commit should stay in held under manual capture mode', async () => {
    await c.createInventory({
      id: 'inv-h-1',
      type: 'FLIGHT',
      price: 500,
      availability: 'AVAILABLE',
      lockable: true,
    });
    const hold = (await c.holdResource({
      accountId: 'acct-h-1',
      inventoryId: 'inv-h-1',
      amount: 400,
      idempotencyKey: 'idem-h-1',
    }) as any).data;
    expect(hold.status).toBe('HELD');

    const afterHold = (await c.getBudget('acct-h-1') as any).data;
    expect(afterHold.available).toBe(2600);
    expect(afterHold.held).toBe(400);

    const committed = (await c.commitResource({
      accountId: 'acct-h-1',
      inventoryId: 'inv-h-1',
      amount: 400,
      holdId: hold.holdId,
    }) as any).data;
    expect(committed.status).toBe('PENDING_CAPTURE');
    expect(committed.captureMode).toBe('MANUAL_CONFIRMATION');

    const afterCommit = (await c.getBudget('acct-h-1') as any).data;
    expect(afterCommit.held).toBe(400);
    expect(afterCommit.spent).toBe(0);
  });

  it('resource commit should throw RESOURCE_STALE_RECOMPUTE on hash mismatch', async () => {
    await c.createInventory({
      id: 'inv-c-1',
      type: 'CAR',
      price: 120,
      availability: 'AVAILABLE',
      lockable: true,
    });
    const hold = (await c.holdResource({
      accountId: 'acct-c-1',
      inventoryId: 'inv-c-1',
      amount: 100,
      idempotencyKey: 'idem-c-1',
    }) as any).data;

    await expect(
      c.commitResource({
        accountId: 'acct-c-1',
        inventoryId: 'inv-c-1',
        amount: 100,
        holdId: hold.holdId,
        expectedResourceHash: 'bad_hash',
      }),
    ).rejects.toThrow('RESOURCE_STALE_RECOMPUTE');
  });

  it('resource release should move held back to available', async () => {
    await c.createInventory({
      id: 'inv-r-1',
      type: 'HOTEL',
      price: 150,
      availability: 'AVAILABLE',
      lockable: true,
    });
    await c.holdResource({
      accountId: 'acct-r-1',
      inventoryId: 'inv-r-1',
      amount: 120,
      idempotencyKey: 'idem-r-1',
    });

    const released = (await c.releaseResource({
      accountId: 'acct-r-1',
      inventoryId: 'inv-r-1',
      amount: 120,
    }) as any).data;
    expect(released.released).toBe(true);
    expect(released.status).toBe('RELEASED');

    const after = (await c.getBudget('acct-r-1') as any).data;
    expect(after.held).toBe(0);
    expect(after.available).toBe(3000);
  });

  it('resource compensate should refund from spent to available', async () => {
    await c.createInventory({
      id: 'inv-p-1',
      type: 'FLIGHT',
      price: 220,
      availability: 'AVAILABLE',
      lockable: true,
    });
    const hold = (await c.holdResource({
      accountId: 'acct-p-1',
      inventoryId: 'inv-p-1',
      amount: 200,
      idempotencyKey: 'idem-p-1',
    }) as any).data;
    await c.commitResource({
      accountId: 'acct-p-1',
      inventoryId: 'inv-p-1',
      amount: 200,
      holdId: hold.holdId,
    });

    await c.patchBudget('acct-p-1', { held: 0, spent: 200 });
    const comp = (await c.compensateResource({
      accountId: 'acct-p-1',
      inventoryId: 'inv-p-1',
      amount: 200,
      reason: 'provider_failed',
    }) as any).data;
    expect(comp.compensated).toBe(true);
    expect(comp.status).toBe('REFUNDED');

    const after = (await c.getBudget('acct-p-1') as any).data;
    expect(after.spent).toBe(0);
    expect(after.available).toBe(3000);
  });
});
