import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  captureReplayAsGoldenFixture,
  serializeGoldenFixtureJson,
} from './e2e-golden-capture';
import {
  captureGoldenFixtureFromReplayFile,
  captureGoldenFixtureFromReplayService,
  parseGoldenCaptureArgs,
  parseGoldenReplayServiceCaptureArgs,
} from './e2e-golden-capture-cli';
import type { E2EReplayResult } from './e2e-case.types';

describe('captureReplayAsGoldenFixture', () => {
  function makeReplayResult(): E2EReplayResult {
    return {
      case: {
        id: 'source-case',
        name: 'Source Case',
        description: 'source desc',
        input: {
          userProfile: {
            pacePreference: 'FAST',
            riskTolerance: 'LOW',
          },
          season: 7,
          countryCode: 'IS',
          userQuery: 'test query',
        },
        expected: {
          routeDirectionTags: ['highlands', 'nature'],
          abuExpected: { action: 'ALLOW' },
          finalState: { allowed: true, planDays: 8 },
        },
        metadata: {
          priority: 'P1',
        },
      } as any,
      actual: {
        routeDirectionId: 'route-123',
        finalPlan: {
          allowed: true,
          days: 8,
        },
        traceSummary: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'captured entropy=0.62 cand=18 repair=3',
          candidateSearchBudget: {
            maxCandidates: 18,
            repairMaxIters: 3,
            repairTopKPerCandidate: 4,
            maxNewCandidatesPerIter: 16,
            maxPoolSize: 36,
            stopWhenFeasibleCount: 8,
          },
          candidateSearchAudit: {
            budget: {
              maxCandidates: 18,
              repairMaxIters: 3,
              repairTopKPerCandidate: 4,
              maxNewCandidatesPerIter: 16,
              maxPoolSize: 36,
              stopWhenFeasibleCount: 8,
            },
            initialVariantCount: 6,
            iterations: [
              {
                iter: 0,
                poolSizeBeforeProjection: 7,
                feasibleCountAfterProjection: 3,
                infeasibleCountAfterProjection: 4,
                repairsGenerated: 5,
                repairsAccepted: 2,
                poolSizeAfterDedup: 8,
              },
            ],
            finalCandidateCount: 8,
            finalFeasibleCount: 3,
            stopReason: 'COMPLETED',
          },
        },
        logs: [
          {
            persona: 'ABU',
            action: 'ALLOW',
            explanation: 'ok',
            reasonCodes: [],
            evidenceRefs: [],
            timestamp: '2026-08-01T10:00:00.000Z',
            decisionSource: 'PHYSICAL',
            decisionStage: 'ABU_GATE',
          },
          {
            persona: 'EXPECTED_UTILITY',
            action: 'EVALUATE',
            explanation: 'trace',
            reasonCodes: [],
            evidenceRefs: [],
            timestamp: '2026-08-01T10:01:00.000Z',
            decisionSource: 'UTILITY',
            decisionStage: 'PLAN_SCORE',
          },
          {
            persona: 'DR_DRE',
            action: 'ADJUST',
            explanation: 'buffer',
            reasonCodes: ['BUFFER_DAY'],
            evidenceRefs: [],
            timestamp: '2026-08-01T10:02:00.000Z',
            decisionSource: 'HUMAN',
            decisionStage: 'PACE_ADJUST',
          },
        ] as any,
      },
      diff: {
        hasDiff: false,
      },
      passed: true,
      executionTime: 10,
    };
  }

  it('captures replay result into golden fixture shape', () => {
    const fixture = captureReplayAsGoldenFixture({
      fixtureId: 'golden-captured-1',
      fixtureName: 'Golden Captured 1',
      fixtureDescription: 'captured fixture',
      source: 'captured-test',
      replayResult: makeReplayResult(),
    });

    expect(fixture.id).toBe('golden-captured-1');
    expect(fixture.metadata?.fixtureKind).toBe('golden');
    expect(fixture.expected.traceSummary?.schemaVersion).toBe('trace/v1');
    expect(fixture.expected.drdreExpected?.mustAdjust).toBe(true);
    expect(fixture.expected.neptuneExpected?.mustRepair).toBe(false);
    expect(fixture.expected.timelineExpected?.orderedStages).toEqual([
      'ABU_GATE',
      'PLAN_SCORE',
      'PACE_ADJUST',
    ]);
    expect(
      fixture.expected.scientificExpected?.optimization?.allowedStopReasons,
    ).toEqual(['COMPLETED']);
  });

  it('serializes golden fixture JSON with newline', () => {
    const fixture = captureReplayAsGoldenFixture({
      fixtureId: 'golden-captured-2',
      fixtureName: 'Golden Captured 2',
      fixtureDescription: 'captured fixture',
      source: 'captured-test',
      replayResult: makeReplayResult(),
    });

    const json = serializeGoldenFixtureJson(fixture);
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json).id).toBe('golden-captured-2');
  });

  it('captures replay result JSON file into golden fixture output file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'golden-capture-'));
    const inputPath = join(dir, 'replay.json');
    const outputPath = join(dir, 'golden.json');
    await writeFile(inputPath, JSON.stringify(makeReplayResult()), 'utf8');

    const result = await captureGoldenFixtureFromReplayFile({
      inputPath,
      outputPath,
      fixtureId: 'golden-captured-file',
      fixtureName: 'Golden Captured File',
      fixtureDescription: 'captured from file',
      source: 'captured-test',
    });

    const written = await readFile(outputPath, 'utf8');
    expect(result.outputPath).toBe(outputPath);
    expect(JSON.parse(written).id).toBe('golden-captured-file');
    expect(JSON.parse(written).metadata.fixtureKind).toBe('golden');
  });

  it('parses CLI arguments for golden capture', () => {
    const parsed = parseGoldenCaptureArgs([
      '--input',
      'in.json',
      '--output',
      'out.json',
      '--id',
      'fixture-1',
      '--name',
      'Fixture 1',
      '--description',
      'desc',
      '--source',
      'captured-test',
    ]);

    expect(parsed).toEqual({
      inputPath: 'in.json',
      outputPath: 'out.json',
      fixtureId: 'fixture-1',
      fixtureName: 'Fixture 1',
      fixtureDescription: 'desc',
      source: 'captured-test',
    });
  });

  it('parses CLI arguments for replay-service golden capture', () => {
    const parsed = parseGoldenReplayServiceCaptureArgs([
      '--case-id',
      'iceland-highlands-001',
      '--output',
      'golden.json',
    ]);

    expect(parsed).toEqual({
      caseId: 'iceland-highlands-001',
      caseFilePath: undefined,
      fixtureId: undefined,
      fixtureName: undefined,
      fixtureDescription: undefined,
      source: undefined,
      outputPath: 'golden.json',
    });
  });

  it('captures golden fixture directly from replay service with defaults', async () => {
    const replayResult = makeReplayResult();
    const replayService = {
      replay: jest.fn().mockResolvedValue(replayResult),
      loadCase: jest.fn().mockResolvedValue(replayResult.case),
    };

    const result = await captureGoldenFixtureFromReplayService(
      {
        caseId: 'source-case',
        fixtureId: 'golden-direct',
        fixtureName: 'Golden Direct',
        fixtureDescription: 'direct',
        source: 'captured-test',
      },
      replayService as any,
    );

    expect(result.fixture.id).toBe('golden-direct');
    expect(result.replayResult.case.id).toBe('source-case');
  });
});
