/**
 * Decision-time World Consistency — same-tick harness (Safety External first).
 *
 * Principle: One decision, one consistent world.
 *
 * Run:
 *   npx jest src/harness/evals/decision-world-consistency/decision-world-consistency.harness.spec.ts
 */

import { evaluateDecisionTickConsistency } from './evaluate-decision-tick-consistency.util';
import {
  resolveDecisionWindSpeedMps,
  WEATHER_EVIDENCE_PRECEDENCE,
  ROAD_EVIDENCE_PRECEDENCE,
} from './evidence-precedence.util';
import {
  fixturePoiClosedAlignedTick,
  fixturePoiClosedDivergentTick,
  fixturePoiOpenAlignedTick,
  fixturePoiUnverifiedAlignedTick,
  fixtureRoadClosedAlignedTick,
  fixtureRoadClosedLookDivergentTick,
  fixtureStrongWindAlignedViaPrecedenceTick,
  fixtureStrongWindDivergentLegacyCgusTick,
} from './safety-consistency.fixtures';
import { projectRoadBridgeToTickViews } from './project-road-bridge-to-tick-views.util';
import { projectPoiBridgeToTickViews } from './project-poi-bridge-to-tick-views.util';
import {
  assertSharedRoadSourceVersion,
  materializeLookRoadAuthorityForDecisionTick,
} from '../../../trips/decision/world-consistency/look-road-authority-bridge';
import { buildLookRoadSuspectedClosedHint } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';
import {
  assertSharedPoiSourceVersion,
  materializePoiAuthorityForDecisionTick,
} from '../../../trips/decision/world-consistency/poi-authority-bridge';
import { buildPoiSuspectedClosedHint } from '../../../trips/decision/world-consistency/poi-authority-bridge.types';

describe('Decision-time World Consistency harness (Safety)', () => {
  it('exposes evidence precedence contract (weather > seasonal; Look last for road)', () => {
    expect(WEATHER_EVIDENCE_PRECEDENCE[0]).toBe('AUTHORITY_OBSERVATION');
    expect(
      WEATHER_EVIDENCE_PRECEDENCE[WEATHER_EVIDENCE_PRECEDENCE.length - 1],
    ).toBe('SEASONAL_PRIOR');
    expect(ROAD_EVIDENCE_PRECEDENCE[0]).toBe('AUTHORITY_ROAD_FACT');
    expect(
      ROAD_EVIDENCE_PRECEDENCE[ROAD_EVIDENCE_PRECEDENCE.length - 1],
    ).toBe('LOOK_NON_AUTHORITATIVE');
  });

  it('T1 without bridge: Look-divergent tick → FAIL (documents pre-bridge split-brain)', () => {
    const report = evaluateDecisionTickConsistency(
      fixtureRoadClosedLookDivergentTick(),
    );
    // eslint-disable-next-line no-console
    console.log(report.tableRows.join('\n'));
    expect(report.overall).toBe('FAIL');
  });

  describe('P0-1 Road bridge acceptance A/B/C', () => {
    const lookHint = buildLookRoadSuspectedClosedHint({
      lookObservationId: 'look_obs_harness',
      roadId: 'F208',
      tripId: 'trip_harness',
      suspectedAt: '2026-07-17T10:00:00.000Z',
    });

    it('A Look suspected + Authority CLOSED → PASS + shared sourceVersion', () => {
      const m = materializeLookRoadAuthorityForDecisionTick({
        tickId: 'T1A',
        lookHint,
        authority: {
          kind: 'RESOLVED',
          status: 'CLOSED',
          observedAt: new Date().toISOString(),
          sourceProvider: 'vegagerdin_gagnaveita',
          authority: 'OFFICIAL',
          evidenceId: 'ev_a',
          version: 'vA',
        },
      });
      expect(assertSharedRoadSourceVersion(m)).toBe(true);
      const report = evaluateDecisionTickConsistency(
        projectRoadBridgeToTickViews({
          materialization: m,
          realityRoad: 'CLOSED',
        }),
      );
      // eslint-disable-next-line no-console
      console.log(report.tableRows.join('\n'));
      expect(report.overall).toBe('PASS');
      expect(report.cells[0]?.abuSees).toBe('CLOSED');
      expect(report.cells[0]?.cgusSees).toBe('CLOSED');
      expect(report.cells[0]?.gateSees).toBe('CLOSED');
    });

    it('B Look misreport + Authority OPEN → PASS (Look must not seal CLOSED)', () => {
      const m = materializeLookRoadAuthorityForDecisionTick({
        tickId: 'T1B',
        lookHint,
        authority: {
          kind: 'RESOLVED',
          status: 'OPEN',
          observedAt: new Date().toISOString(),
          sourceProvider: 'vegagerdin_gagnaveita',
          authority: 'OFFICIAL',
          evidenceId: 'ev_b',
          version: 'vB',
        },
      });
      const report = evaluateDecisionTickConsistency(
        projectRoadBridgeToTickViews({
          materialization: m,
          realityRoad: 'OPEN',
        }),
      );
      // eslint-disable-next-line no-console
      console.log(report.tableRows.join('\n'));
      expect(report.overall).toBe('PASS');
      expect(report.cells[0]?.reality).toBe('OPEN');
      expect(report.cells[0]?.abuSees).toBe('OPEN');
      expect(m.lookHint.authoritative).toBe(false);
    });

    it('C Authority UNAVAILABLE → PASS as UNVERIFIED/NEED_CONFIRM (no forged OPEN)', () => {
      const m = materializeLookRoadAuthorityForDecisionTick({
        tickId: 'T1C',
        lookHint,
        authority: {
          kind: 'UNAVAILABLE',
          attemptedAt: new Date().toISOString(),
          reason: 'timeout',
          evidenceId: 'ev_c',
          version: 'vC',
        },
      });
      expect(m.gateDisposition).toBe('NEED_CONFIRM');
      expect(m.cgusSees.treatAsOpenFact).toBe(false);
      const report = evaluateDecisionTickConsistency(
        projectRoadBridgeToTickViews({
          materialization: m,
          realityRoad: 'UNVERIFIED',
        }),
      );
      // eslint-disable-next-line no-console
      console.log(report.tableRows.join('\n'));
      expect(report.overall).toBe('PASS');
      expect(report.cells[0]?.abuSees).toBe('UNVERIFIED');
      expect(assertSharedRoadSourceVersion(m)).toBe(true);
    });
  });

  it('T1b ROAD_CLOSED aligned tick → PASS', () => {
    const report = evaluateDecisionTickConsistency(
      fixtureRoadClosedAlignedTick(),
    );
    expect(report.overall).toBe('PASS');
  });

  it('T2 STRONG_WIND legacy CGUS seasonal typical → FAIL', () => {
    const report = evaluateDecisionTickConsistency(
      fixtureStrongWindDivergentLegacyCgusTick(),
    );
    // eslint-disable-next-line no-console
    console.log(report.tableRows.join('\n'));
    expect(report.overall).toBe('FAIL');
  });

  it('T2b STRONG_WIND after evidence precedence → PASS', () => {
    const report = evaluateDecisionTickConsistency(
      fixtureStrongWindAlignedViaPrecedenceTick(),
    );
    expect(report.overall).toBe('PASS');
  });

  it('resolveDecisionWindSpeedMps prefers authority over seasonal', () => {
    const r = resolveDecisionWindSpeedMps({
      authorityWindMps: 27,
      seasonalTypicalWindMps: 12,
      weatherEvidenceWindMps: 25,
    });
    expect(r?.band).toBe('AUTHORITY_OBSERVATION');
    expect(r?.windSpeedMps).toBe(27);
  });

  it('T3 without bridge: POI divergent → FAIL (documents pre-bridge split-brain)', () => {
    const report = evaluateDecisionTickConsistency(
      fixturePoiClosedDivergentTick(),
    );
    expect(report.overall).toBe('FAIL');
  });

  describe('P0-3 POI bridge acceptance A/B/C', () => {
    it('T3A fixture aligned CLOSED → PASS', () => {
      const report = evaluateDecisionTickConsistency(
        fixturePoiClosedAlignedTick(),
      );
      // eslint-disable-next-line no-console
      console.log(report.tableRows.join('\n'));
      expect(report.overall).toBe('PASS');
    });

    it('T3B fixture aligned OPEN → PASS', () => {
      expect(
        evaluateDecisionTickConsistency(fixturePoiOpenAlignedTick()).overall,
      ).toBe('PASS');
    });

    it('T3C fixture aligned UNVERIFIED → PASS', () => {
      expect(
        evaluateDecisionTickConsistency(
          fixturePoiUnverifiedAlignedTick(),
        ).overall,
      ).toBe('PASS');
    });

    it('A: authority CLOSED materialize → consistency PASS + shared sourceVersion', () => {
      const m = materializePoiAuthorityForDecisionTick({
        tickId: 'T3A_bridge',
        tripId: 'trip_t3',
        poiId: 'is.skaftafell',
        fieldHint: buildPoiSuspectedClosedHint({
          tripId: 'trip_t3',
          poiId: 'is.skaftafell',
        }),
        authority: {
          kind: 'RESOLVED',
          status: 'CLOSED',
          observedAt: new Date().toISOString(),
          sourceProvider: 'vatnajokull_trail_status',
          authority: 'OFFICIAL',
          evidenceId: 'ev_t3a',
          version: 'vT3A',
          ruleType: 'CLOSED',
        },
      });
      expect(assertSharedPoiSourceVersion(m)).toBe(true);
      const report = evaluateDecisionTickConsistency(
        projectPoiBridgeToTickViews({
          materialization: m,
          realityPoi: 'CLOSED',
        }),
      );
      expect(report.overall).toBe('PASS');
    });

    it('C: UNAVAILABLE → UNVERIFIED PASS (no forge)', () => {
      const m = materializePoiAuthorityForDecisionTick({
        tickId: 'T3C_bridge',
        tripId: 'trip_t3',
        poiId: 'is.skaftafell',
        authority: {
          kind: 'UNAVAILABLE',
          attemptedAt: new Date().toISOString(),
          reason: 'empty',
          evidenceId: 'ev_t3c',
          version: 'vT3C',
        },
      });
      expect(
        evaluateDecisionTickConsistency(
          projectPoiBridgeToTickViews({
            materialization: m,
            realityPoi: 'UNVERIFIED',
          }),
        ).overall,
      ).toBe('PASS');
    });
  });
});
