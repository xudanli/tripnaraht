import { ConfigService } from '@nestjs/config';
import { WorldFactResolverService } from './world-fact-resolver.service';
import { WorldFactRepository } from './world-fact.repository';

describe('WorldFactResolverService', () => {
  it('resolveLatestByFactKey returns null when missing', async () => {
    const repo = {
      findLatestRowByFactKey: jest.fn().mockResolvedValue(null),
    } as unknown as WorldFactRepository;
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const svc = new WorldFactResolverService(repo, config);
    await expect(svc.resolveLatestByFactKey('missing')).resolves.toBeNull();
  });

  it('resolveLatestByFactKey wraps row with freshness', async () => {
    const created = new Date('2026-05-08T12:00:00Z');
    const row = {
      id: 'f1',
      factKey: 'country:IS:aggregated_wind_mps',
      subjectType: 'country',
      subjectId: 'IS',
      predicate: 'aggregated_wind_mps',
      valueJson: { mps: 15 },
      confidence: 0.8,
      severity: null,
      sourceType: 'research_shadow',
      sourceRef: 'req',
      validFrom: null,
      validTo: null,
      observedAt: created,
      snapshotVersion: 'poc/v1',
      supersedesFactId: null,
      createdAt: created,
    };
    const repo = {
      findLatestRowByFactKey: jest.fn().mockResolvedValue(row),
    } as unknown as WorldFactRepository;
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const svc = new WorldFactResolverService(repo, config);
    const out = await svc.resolveLatestByFactKey('country:IS:aggregated_wind_mps');
    expect(out?.fact.id).toBe('f1');
    expect(out?.freshness.referenceTimeIso).toBe(created.toISOString());
    expect(typeof out?.freshness.freshnessScore).toBe('number');
  });

  it('hides expired when WORLD_FACT_HIDE_EXPIRED=1', async () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const row = {
      id: 'f1',
      factKey: 'k',
      subjectType: 'c',
      subjectId: 'IS',
      predicate: 'p',
      valueJson: {},
      confidence: 1,
      severity: null,
      sourceType: 't',
      sourceRef: null,
      validFrom: null,
      validTo: past,
      observedAt: past,
      snapshotVersion: null,
      supersedesFactId: null,
      createdAt: past,
    };
    const repo = {
      findLatestRowByFactKey: jest.fn().mockResolvedValue(row),
    } as unknown as WorldFactRepository;
    const config = {
      get: jest.fn().mockImplementation((k: string) => (k === 'WORLD_FACT_HIDE_EXPIRED' ? '1' : undefined)),
    } as unknown as ConfigService;
    const svc = new WorldFactResolverService(repo, config);
    await expect(svc.resolveLatestByFactKey('k')).resolves.toBeNull();
  });
});
