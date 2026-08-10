import { existsSync } from 'fs';
import {
  loadIcelandSelfDriveKnowledgePack,
  resolveIsKnowledgePackManifestPath,
  resolvePackFileAbsolutePath,
  resolveRepoFileAbsolutePath,
} from './iceland-knowledge-pack.loader';
import {
  createIcelandKnowledgePackResolver,
  isProductionReady,
} from './iceland-knowledge-pack.resolver';

describe('Iceland Self-Drive Knowledge Pack (WP1)', () => {
  const cwd = process.cwd();

  it('loads and validates knowledge-pack.manifest.json', () => {
    const pack = loadIcelandSelfDriveKnowledgePack(cwd);
    expect(pack.packId).toBe('IS_SELF_DRIVE_V1');
    expect(pack.country).toBe('IS');
    expect(pack.schemaId).toBe('tripnara.iceland.self_drive_knowledge_pack@v1');
    expect(pack.destinationPackId).toBe('destination.is');
    expect(Object.keys(pack.domains)).toEqual(
      expect.arrayContaining([
        'vehicleRoadFit',
        'weatherDriving',
        'daylightSeason',
        'fuel',
        'rentalInsurance',
        'regulations',
        'runbooks',
      ]),
    );
  });

  it('indexes all seven domains with status and consumers', () => {
    const resolver = createIcelandKnowledgePackResolver(cwd);
    const domains = resolver.listDomains();
    expect(domains).toHaveLength(7);

    const fuel = resolver.getDomain('FUEL');
    expect(fuel?.status).toBe('ACTIVE');
    expect(fuel?.inProductionMainChain).toBe(true);

    const vehicle = resolver.getDomain('VEHICLE_ROAD_FIT');
    expect(vehicle?.status).toBe('ACTIVE');
    expect(vehicle?.inProductionMainChain).toBe(true);
    expect(vehicle?.runtimeConsumers).toContain('CONSTRAINT_GATEWAY');
  });

  it('resolveRule returns source, version, consumers, production status', () => {
    const resolver = createIcelandKnowledgePackResolver(cwd);
    const resolved = resolver.resolveRule('IS_ROAD_CLOSED_BLOCK');
    expect(resolved).toBeDefined();
    expect(resolved!.rule.version).toBe('1.0.0');
    expect(resolved!.rule.evidence[0]?.path).toBe('rules/is-road-rules.json');
    expect(resolved!.rule.consumerBindings).toContain('CONSTRAINT_GATEWAY');
    expect(resolved!.domain.domainId).toBe('VEHICLE_ROAD_FIT');
    expect(resolved!.pack.packId).toBe('IS_SELF_DRIVE_V1');
    expect(resolved!.productionReady).toBe(true);
  });

  it('fuel and P0 runbook rules are productionReady', () => {
    const resolver = createIcelandKnowledgePackResolver(cwd);
    expect(resolver.resolveRule('IS_FUEL_ASSESSMENT_BLOCK')?.productionReady).toBe(
      true,
    );
    expect(resolver.resolveRule('IS_RB_FUEL_INSUFFICIENT')?.productionReady).toBe(
      true,
    );
    expect(resolver.resolveRule('IS_RB_ROAD_CLOSURE')?.productionReady).toBe(true);
    expect(resolver.resolveRule('IS_RB_STRONG_WIND')?.productionReady).toBe(true);
    expect(resolver.resolveRule('IS_RB_BOOKING_ETA_MISS')?.productionReady).toBe(
      true,
    );
  });

  it('regulation severity norm is indexed but not on production main chain', () => {
    const resolver = createIcelandKnowledgePackResolver(cwd);
    const reg = resolver.resolveRule('IS_KP_REGULATION_SEVERITY_NORM');
    expect(reg?.domain.inProductionMainChain).toBe(false);
    expect(reg?.productionReady).toBe(false);
  });

  it('PACK_FILE and REPO_FILE evidence targets exist on disk', () => {
    const resolver = createIcelandKnowledgePackResolver(cwd);
    const pack = resolver.getPack();
    for (const domain of Object.values(pack.domains)) {
      for (const source of domain.sources) {
        if (source.kind === 'PACK_FILE') {
          const abs = resolvePackFileAbsolutePath(source.path, cwd);
          expect(existsSync(abs)).toBe(true);
        }
        if (source.kind === 'REPO_FILE') {
          const abs = resolveRepoFileAbsolutePath(source.path, cwd);
          expect(existsSync(abs)).toBe(true);
        }
      }
      for (const rule of domain.rules) {
        const paths = resolver.resolveEvidencePaths(rule.evidence, cwd);
        for (const row of paths) {
          if (row.absolutePath) {
            expect(row.exists).toBe(true);
          }
        }
      }
    }
  });

  it('isProductionReady requires ACTIVE + APPROVED + non-STUB + main chain', () => {
    expect(
      isProductionReady(
        { status: 'ACTIVE' },
        {
          status: 'ACTIVE',
          inProductionMainChain: true,
          reviewStatus: 'APPROVED',
        },
        { reviewStatus: 'APPROVED', projectionMode: 'REFERENCE' },
      ),
    ).toBe(true);
    expect(
      isProductionReady(
        { status: 'ACTIVE' },
        {
          status: 'DRAFT',
          inProductionMainChain: false,
          reviewStatus: 'DRAFT',
        },
        { reviewStatus: 'DRAFT', projectionMode: 'STUB' },
      ),
    ).toBe(false);
  });

  it('manifest path is stable under destination-packs/is', () => {
    expect(resolveIsKnowledgePackManifestPath(cwd)).toContain(
      'data/destination-packs/is/knowledge-pack.manifest.json',
    );
    expect(existsSync(resolveIsKnowledgePackManifestPath(cwd))).toBe(true);
  });
});
