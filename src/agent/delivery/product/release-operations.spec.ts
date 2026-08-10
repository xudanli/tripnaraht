import {
  admitReleaseOpsBacklogItem,
  createEmptyReleaseOpsBacklog,
  rejectRoadmapCapabilityProposal,
} from './release-ops-backlog.util';
import {
  attachIncidentFix,
  attachIncidentRegression,
  attachIncidentRootCause,
  attachIncidentTrace,
  closeIncidentPipeline,
  startIncidentClosurePipeline,
} from './incident-closure-pipeline.util';
import { openNaraIncident } from './nara-incident-record.util';
import {
  freezeReleaseCandidate,
  projectReleaseCandidateIntoTrace,
} from './release-candidate.util';
import { conductReleaseReview } from './release-review.util';
import { buildTrustWillingnessReport } from './trust-willingness.util';
import {
  createBetaTripCohort,
  enrollBetaTrip,
} from './beta-trip-cohort.util';
import { buildTripQualityScorecard } from './trip-quality-scorecard.util';
import { markRegressionRun } from './real-world-regression-golden.util';

describe('Release Operations', () => {
  it('rejects roadmap capabilities; backlog requires real evidence', () => {
    expect(rejectRoadmapCapabilityProposal('新 Temporal Runtime').ok).toBe(
      false,
    );
    const backlog = createEmptyReleaseOpsBacklog();
    expect(backlog.noDefaultNextSprintCapability).toBe(true);
    expect(
      admitReleaseOpsBacklogItem({
        backlog,
        source: 'INCIDENT',
        tripId: '',
        evidenceRef: 'x',
        summaryZh: '无 trip',
      }).ok,
    ).toBe(false);
    const ok = admitReleaseOpsBacklogItem({
      backlog,
      source: 'LATENCY',
      tripId: 't1',
      evidenceRef: 'trace_99',
      summaryZh: 'Apply P95 过高',
    });
    expect(ok.ok).toBe(true);
  });

  it('P0/P1 requires Trace→RootCause→Fix→Regression; RC freeze + layered review', () => {
    const incident = openNaraIncident({
      tripId: 't1',
      severity: 'P0',
      category: 'STABILITY',
      journeyId: 'ADJUST',
      summaryZh: '越权写入风险',
      unauthorizedMutation: false,
    });
    let pipe = startIncidentClosurePipeline(incident);
    expect(
      closeIncidentPipeline({ incident, pipeline: pipe }).complete,
    ).toBe(false);

    pipe = attachIncidentTrace(pipe, 'agent_turn_trace_1');
    pipe = attachIncidentRootCause(pipe, 'Confirm 校验缺口');
    pipe = attachIncidentFix(pipe, 'fix_pr_42');
    pipe = attachIncidentRegression(pipe, {
      tripId: 't1',
      journeyId: 'ADJUST',
      titleZh: 'Confirm 缺口回归',
    });
    pipe = {
      ...pipe,
      regression: markRegressionRun(pipe.regression!, 'PASS'),
    };
    const closed = closeIncidentPipeline({ incident, pipeline: pipe });
    expect(closed.complete).toBe(true);

    const incompleteRc = freezeReleaseCandidate({
      rcId: 'rc1',
      artifacts: [
        {
          kind: 'MODEL',
          artifactId: 'm1',
          version: '1.0',
          contentDigest: 'd1',
        },
      ],
    });
    expect(incompleteRc.allArtifactKindsPresent).toBe(false);

    const rc = freezeReleaseCandidate({
      rcId: 'rc_v1',
      artifacts: [
        { kind: 'MODEL', artifactId: 'm', version: '1', contentDigest: 'a' },
        { kind: 'PROMPT', artifactId: 'p', version: '1', contentDigest: 'b' },
        { kind: 'RULE', artifactId: 'r', version: '1', contentDigest: 'c' },
        {
          kind: 'KNOWLEDGE',
          artifactId: 'k',
          version: '1',
          contentDigest: 'd',
        },
        {
          kind: 'DECISION_POLICY',
          artifactId: 'dp',
          version: '1',
          contentDigest: 'e',
        },
      ],
    });
    expect(rc.frozen).toBe(true);
    expect(projectReleaseCandidateIntoTrace(rc)).toHaveLength(5);

    const scorecards = [
      buildTripQualityScorecard({
        tripId: 't1',
        journeyOutcomes: [],
        safetyScore: 1,
        reliabilityScore: 0.9,
        taskSuccessScore: 0.85,
        experienceScore: 0.95,
        userWillingToContinue: true,
      }),
      buildTripQualityScorecard({
        tripId: 't2',
        journeyOutcomes: [],
        safetyScore: 1,
        reliabilityScore: 0.88,
        taskSuccessScore: 0.8,
        experienceScore: 0.82,
        userWillingToContinue: true,
      }),
      buildTripQualityScorecard({
        tripId: 't3',
        journeyOutcomes: [],
        safetyScore: 1,
        reliabilityScore: 0.92,
        taskSuccessScore: 0.9,
        experienceScore: 0.85,
        userWillingToContinue: true,
      }),
    ];

    /** Safety 失败不可被高 Experience 平均抵消 */
    const safetyFail = conductReleaseReview({
      rc,
      scorecards: [
        buildTripQualityScorecard({
          tripId: 'bad',
          journeyOutcomes: [],
          safetyScore: 0.5,
          reliabilityScore: 1,
          taskSuccessScore: 1,
          experienceScore: 1,
          unauthorizedMutationCount: 1,
          userWillingToContinue: true,
        }),
      ],
      openP0P1Pipelines: [closed],
    });
    expect(safetyFail.passed).toBe(false);
    expect(safetyFail.averagesCannotOffsetSafety).toBe(true);
    expect(safetyFail.layerResults.SAFETY).toBe(false);
    expect(safetyFail.layerResults.EXPERIENCE).toBe(false);

    const review = conductReleaseReview({
      rc,
      scorecards,
      openP0P1Pipelines: [closed],
    });
    expect(review.passed).toBe(true);
    expect(review.productGoalZh).toMatch(/重要旅行决策/);

    let cohort = createBetaTripCohort({ minCompleteTripsForReleaseEvidence: 3 });
    for (const id of ['t1', 't2', 't3']) {
      cohort = enrollBetaTrip(cohort, {
        tripId: id,
        completeTrip: true,
        journeysTouched: ['QUERY', 'DECIDE', 'ADJUST'],
        userWillingToContinue: true,
      });
    }
    const trust = buildTrustWillingnessReport({
      cohort,
      scorecards,
    });
    expect(trust.capabilityExpansionIsNotGoal).toBe(true);
    expect(trust.passed).toBe(true);
  });
});
