import { loadIsCertRuntimeScenariosFromFile } from './is-cert-runtime.harness';
import {
  runIsCert401ConcurrentScenario,
  runIsCert401Scenario,
  runIsCert402Scenario,
  runIsCert403Scenario,
  runIsCert303ReplaceWritebackScenario,
  runIsCert405Scenario,
  runIsCertWritebackScenario,
} from './is-cert-writeback.harness';

describe('IS-CERT writeback integration (mock DB)', () => {
  const scenarios = loadIsCertRuntimeScenariosFromFile();
  const writebackScenario = scenarios.find((s) => s.scenarioId === 'IS-CERT-302');

  const prevMat = process.env.RFC001_ITINERARY_MATERIALIZE;

  beforeEach(() => {
    process.env.RFC001_ITINERARY_MATERIALIZE = '1';
  });

  afterEach(() => {
    if (prevMat === undefined) delete process.env.RFC001_ITINERARY_MATERIALIZE;
    else process.env.RFC001_ITINERARY_MATERIALIZE = prevMat;
  });

  it('IS-CERT-302 applies REMOVE repair → child PlanVersion + itinerary delete', async () => {
    expect(writebackScenario).toBeDefined();
    const result = await runIsCertWritebackScenario(writebackScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.removedItemIds).toContain('stop_1');
    expect(result.artifacts?.writeback.appliedOptionId).toMatch(/^REPAIR-SDR101/);
    expect(result.artifacts?.effectivePlanVersionId).toContain('plan_cert_302_v1_tep_');
  });

  it('IS-CERT-401 idempotent replay on duplicate accept', async () => {
    expect(writebackScenario).toBeDefined();
    const result = await runIsCert401Scenario(writebackScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.idempotentReplay).toBe(false);
  });

  it('IS-CERT-401-CONCURRENT dual accept coalesces to single apply', async () => {
    expect(writebackScenario).toBeDefined();
    const result = await runIsCert401ConcurrentScenario(writebackScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.planVersionId).toBeDefined();
  });

  it('IS-CERT-402 rejects stale basePlanVersionId with STALE_REPAIR_OPTION', async () => {
    expect(writebackScenario).toBeDefined();
    const result = await runIsCert402Scenario(writebackScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
  });

  it('IS-CERT-403 rolls back failed materialization and allows retry', async () => {
    expect(writebackScenario).toBeDefined();
    const result = await runIsCert403Scenario(writebackScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.itineraryMaterialized).toBe(true);
  });

  it('IS-CERT-303 applies REPLACE fallback with precomputed POI', async () => {
    const replaceScenario = scenarios.find((s) => s.scenarioId === 'IS-CERT-303');
    expect(replaceScenario).toBeDefined();
    const result = await runIsCert303ReplaceWritebackScenario(replaceScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.appliedAction).toBe('REPLACE');
    expect(result.artifacts?.writeback.replacementPoiId).toBe('poi_indoor_museum');
  });

  it('IS-CERT-405 slip→daylight hook→REMOVE writeback restores daylight window', async () => {
    const slipScenario = scenarios.find((s) => s.scenarioId === 'IS-CERT-405');
    expect(slipScenario).toBeDefined();
    const result = await runIsCert405Scenario(slipScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.writeback.appliedAction).toBe('REMOVE');
    expect(result.artifacts?.writeback.removedItemIds).toContain('stop_405');
    expect(result.artifacts?.optionId).toMatch(/^REPAIR-SDR202/);
  });
});
