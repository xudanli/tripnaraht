/**
 * P3 — Collect experience-layer outcomes (satisfaction etc.); not used for primary verdict.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import type { ExperienceOutcome } from '../types/decision-semantics.types';

export async function loadExperienceOutcomesSinceDecision(
  prisma: PrismaService,
  tripId: string,
  decidedAt: string,
): Promise<ExperienceOutcome[]> {
  const since = new Date(decidedAt);
  const outcomes: ExperienceOutcome[] = [];

  const [offlineOps, moodChecks, pulses] = await Promise.all([
    prisma.tripInTripOfflineQueueEntry.findMany({
      where: {
        tripId,
        recordedAt: { gte: since },
        operationType: { in: ['micro_feedback', 'experience_pulse'] },
      },
      select: { operationType: true, payload: true, recordedAt: true, syncedAt: true },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    }),
    prisma.tripMoodCheck.findMany({
      where: { tripId, createdAt: { gte: since } },
      select: { score: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.tripExperiencePulse.findMany({
      where: { tripId, submittedAt: { gte: since } },
      select: {
        emotionalValueScore: true,
        expectationConfirmation: true,
        senseOfControl: true,
        spendWorthIt: true,
        teamAtmosphere: true,
        freeText: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    }),
  ]);

  for (const op of offlineOps) {
    const payload = (op.payload ?? {}) as Record<string, unknown>;
    const at = (op.syncedAt ?? op.recordedAt).toISOString();
    const score = Number(payload.score ?? payload.overallScore);
    if (!Number.isFinite(score)) continue;

    outcomes.push({
      metric: 'USER_SATISFACTION',
      value: score,
      source: op.operationType === 'experience_pulse' ? 'SURVEY' : 'USER_CONFIRMATION',
      observedAt: at,
      context: payload.context ? String(payload.context) : undefined,
    });
  }

  for (const mood of moodChecks) {
    outcomes.push({
      metric: 'GROUP_CONFLICT',
      value: mood.score <= 2 ? 'elevated' : 'normal',
      source: 'USER_CONFIRMATION',
      observedAt: mood.createdAt.toISOString(),
      context: 'mood_check',
    });
  }

  for (const pulse of pulses) {
    const scores = [
      pulse.emotionalValueScore,
      pulse.expectationConfirmation,
      pulse.senseOfControl,
      pulse.spendWorthIt,
      pulse.teamAtmosphere,
    ].filter((s): s is number => typeof s === 'number');
    if (!scores.length) continue;

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    outcomes.push({
      metric: 'USER_SATISFACTION',
      value: Math.round(avg * 10) / 10,
      source: 'SURVEY',
      observedAt: pulse.submittedAt.toISOString(),
      context: pulse.freeText ?? undefined,
    });
  }

  return outcomes;
}
