/**
 * 对比 POST /assess 与 GET /planning-conflicts / feasibility must 是否一致
 * Usage: npx tsx scripts/compare-assess-vs-conflicts.ts [tripId]
 */
const TRIP = process.argv[2] ?? '492ff5d0-8461-461a-b975-3f65474e8108';
const BASE = process.env.BACKEND ?? 'http://127.0.0.1:3000/api';

async function getJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  const [assess, conflicts, feasibility] = await Promise.all([
    getJson(`/trips/${TRIP}/assess`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    getJson(`/trips/${TRIP}/planning-conflicts`),
    getJson(`/trips/${TRIP}/feasibility-report`),
  ]);

  if (!assess.body.success) {
    console.error('assess failed', assess.status, assess.body);
    process.exit(1);
  }

  const data = assess.body.data;
  const mustConflicts = (conflicts.body.data?.conflicts ?? []).filter(
    (c: { priority?: string }) => c.priority === 'must_handle',
  );
  const suggestConflicts = (conflicts.body.data?.conflicts ?? []).filter(
    (c: { priority?: string }) => c.priority === 'suggest_adjust',
  );
  const mustFeasibility = (feasibility.body.data?.issues ?? []).filter(
    (i: { priority?: string }) => i.priority === 'must_handle',
  );
  const travelMust = mustFeasibility.filter(
    (i: { issueKind?: string }) =>
      i.issueKind === 'same_day_travel' || i.issueKind === 'inter_day_travel',
  );

  const issueDays = assess.body.data.days.filter(
    (d: { status?: string }) => d.status === 'HAS_ISSUES',
  );
  const attentionDays = assess.body.data.days.filter(
    (d: { status?: string }) => d.status === 'NEEDS_ATTENTION',
  );
  const feasibilityDims = assess.body.data.days.flatMap(
    (d: { date: string; dimensions?: Array<{ dimension: string }> }) =>
      (d.dimensions ?? [])
        .filter((dim) => dim.dimension === 'FEASIBILITY')
        .map(() => d.date),
  );
  const bufferPoor = assess.body.data.days.flatMap((d: { date: string; dimensions?: Array<{ dimension: string; score: number; issues?: string[] }> }) =>
    (d.dimensions ?? [])
      .filter((dim) => dim.dimension === 'BUFFER' && (dim.issues?.length ?? 0) > 0)
      .map((dim) => ({ date: d.date, score: dim.score, issues: dim.issues })),
  );
  const transportPoor = assess.body.data.days.flatMap((d: { date: string; dimensions?: Array<{ dimension: string; score: number; issues?: string[] }> }) =>
    (d.dimensions ?? [])
      .filter((dim) => dim.dimension === 'TRANSPORT' && (dim.issues?.length ?? 0) > 0)
      .map((dim) => ({ date: d.date, score: dim.score, issues: dim.issues })),
  );

  console.log(JSON.stringify({
    tripId: TRIP,
    assess: {
      effectiveTravelMode: data.effectiveTravelMode,
      overallGrade: data.overallGrade,
      overallAverageScore: data.overallAverageScore,
      hasIssuesDays: data.hasIssuesDays,
      needsAttentionDays: data.needsAttentionDays,
      reasonableDays: data.reasonableDays,
      planningConflicts: data.planningConflicts?.summary,
      tripWideItems: data.planningConflicts?.tripWideItems?.length,
    },
    conflicts: {
      mustHandle: conflicts.body.data?.summary?.mustHandle,
      mustCount: mustConflicts.length,
      suggestAdjust: conflicts.body.data?.summary?.suggestAdjust,
      suggestCount: suggestConflicts.length,
    },
    feasibility: {
      mustHandle: feasibility.body.data?.summary?.mustHandle,
      travelMust: travelMust.length,
    },
    assessTransportIssues: transportPoor,
    assessBufferIssues: bufferPoor,
    assessHasIssuesDays: issueDays.map((d: { date: string; overallScore: number }) => ({
      date: d.date,
      score: d.overallScore,
    })),
    assessNeedsAttentionDays: attentionDays.map((d: { date: string; overallScore: number }) => ({
      date: d.date,
      score: d.overallScore,
    })),
    assessFeasibilityDimensionDays: [...new Set(feasibilityDims)],
    alignmentNotes: [
      mustConflicts.length > 0 && data.hasIssuesDays === 0
        ? 'WARN: conflicts has must but assess has no HAS_ISSUES days'
        : null,
      suggestConflicts.length > 0 &&
      data.needsAttentionDays === 0 &&
      data.hasIssuesDays === 0
        ? 'WARN: conflicts has suggest_adjust but assess has no NEEDS_ATTENTION/HAS_ISSUES days'
        : null,
      travelMust.length > 0 && bufferPoor.length === 0 && transportPoor.length === 0
        ? 'WARN: feasibility travel must but assess TRANSPORT/BUFFER clean'
        : null,
      (assess.body.data?.planningConflicts?.summary?.mustHandle ?? 0) !== mustConflicts.length
        ? `WARN: assess planningConflicts.mustHandle=${assess.body.data?.planningConflicts?.summary?.mustHandle} vs conflicts must=${mustConflicts.length}`
        : null,
    ].filter(Boolean),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
