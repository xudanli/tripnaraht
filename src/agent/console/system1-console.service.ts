/**
 * System1 Runtime Console Service — 12 模块只读/轻写实现（P0 可测）。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  compileSystem1TaskFrame,
  inferSystem1CandidateClaimTypes,
  replaySystem1Turn,
  resolveSystem1RequiredEvidence,
  resolveSystem1RuntimeFamily,
  SYSTEM1_RUNTIME_BOUNDARY,
} from '../system1-runtime';
import { System1ConsoleStore } from './system1-console.store';

@Injectable()
export class System1ConsoleService {
  constructor(private readonly store: System1ConsoleStore) {}

  async overview() {
    const runs = await this.store.listRuns();
    const n = Math.max(1, runs.length);
    const answerOk = runs.filter(
      (r) => r.recommendedRoute === 'SYSTEM1_ANSWER',
    ).length;
    const escalate = runs.filter(
      (r) => r.recommendedRoute === 'SYSTEM2_ASSISTED',
    ).length;
    const ask = runs.filter((r) => r.recommendedRoute === 'ASK_USER').length;
    const conditional = runs.filter((r) => r.answerMode === 'CONDITIONAL').length;
    const refuse = runs.filter(
      (r) =>
        r.answerMode === 'NO_ANSWER' && r.recommendedRoute !== 'ASK_USER',
    ).length;
    const avgDurationMs =
      runs.reduce((s, r) => s + r.durationMs, 0) / Math.max(1, runs.length);

    let verified = 0;
    let stale = 0;
    let assumed = 0;
    let unavailable = 0;
    let evidenceTotal = 0;
    let sufficiencyScore = 0;
    let totalClaims = 0;
    let grounded = 0;
    let partial = 0;
    let ungrounded = 0;

    for (const r of runs) {
      for (const e of r.trace.retrievedEvidence) {
        evidenceTotal += 1;
        if (e.status === 'VERIFIED') verified += 1;
        else if (e.status === 'STALE') stale += 1;
        else if (e.status === 'ASSUMED') assumed += 1;
        else unavailable += 1;
      }
      if (r.sufficiency === 'SUFFICIENT') sufficiencyScore += 1;
      else if (r.sufficiency === 'PARTIAL') sufficiencyScore += 0.5;
      const ev = r.claimGroundingEval;
      totalClaims += ev.claimsTotal;
      grounded += ev.groundedCount;
      ungrounded += ev.ungroundedCount;
      partial += Math.max(0, ev.claimsTotal - ev.groundedCount - ev.ungroundedCount);
    }

    const labeled = runs.filter((r) => r.labels.length > 0);
    const mislabeled = labeled.filter((r) => r.labels.length > 0).length;
    const routingAccuracy =
      labeled.length === 0 ? 1 : 1 - mislabeled / Math.max(1, labeled.length);

    return {
      schemaId: 'tripnara.system1_dashboard_overview@v1',
      window: {
        from: runs.at(-1)?.createdAt ?? new Date().toISOString(),
        to: new Date().toISOString(),
        tz: 'Asia/Shanghai',
        note: 'Golden Cases (DB-backed seed)',
      },
      runs: {
        total: runs.length,
        successAnswerRate: answerOk / n,
        escalateSystem2Rate: escalate / n,
        askUserRate: ask / n,
        conditionalAnswerRate: conditional / n,
        refuseRate: refuse / n,
        avgDurationMs,
      },
      evidenceQuality: {
        verifiedRate: evidenceTotal ? verified / evidenceTotal : 0,
        staleRate: evidenceTotal ? stale / evidenceTotal : 0,
        assumedRate: evidenceTotal ? assumed / evidenceTotal : 0,
        unavailableRate: evidenceTotal ? unavailable / evidenceTotal : 0,
        avgSufficiencyScore: sufficiencyScore / n,
      },
      claimGrounding: {
        totalClaims,
        groundedClaims: grounded,
        partialClaims: partial,
        ungroundedClaims: ungrounded,
        groundingRate: totalClaims ? grounded / totalClaims : 1,
      },
      routingHealth: {
        system1CorrectRate: routingAccuracy,
        falseEscalateRate: 0,
        falseEnterSystem1Rate: 0,
        note: 'Routing Accuracy 需人工 TaskFrame 标注后才有意义',
      },
      validationMetrics: SYSTEM1_RUNTIME_BOUNDARY.validationMetrics,
    };
  }

  async listRuns(query: {
    q?: string;
    family?: string;
    result?: string;
    page?: number;
    pageSize?: number;
  }) {
    let items = await this.store.listRuns();
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter((r) => r.utterance.toLowerCase().includes(q));
    }
    if (query.family) {
      items = items.filter((r) => r.family === query.family);
    }
    if (query.result === 'CONDITIONAL') {
      items = items.filter((r) => r.answerMode === 'CONDITIONAL');
    } else if (query.result === 'ESCALATE') {
      items = items.filter((r) => r.recommendedRoute === 'SYSTEM2_ASSISTED');
    } else if (query.result === 'ASK_USER') {
      items = items.filter((r) => r.recommendedRoute === 'ASK_USER');
    } else if (query.result === 'STRONG') {
      items = items.filter((r) => r.answerMode === 'STRONG');
    }
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const total = items.length;
    const slice = items.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
      runId: r.runId,
      utterance: r.utterance,
      createdAt: r.createdAt,
      lifecycle: r.lifecycle,
      taskType: r.taskType,
      family: r.family,
      recommendedRoute: r.recommendedRoute,
      answerMode: r.answerMode,
      durationMs: r.durationMs,
      sufficiency: r.sufficiency,
      groundingPassed: r.groundingPassed,
    }));
    return { items: slice, page, pageSize, total };
  }

  async getRunDetail(runId: string) {
    const r = await this.store.getRun(runId);
    if (!r) throw new NotFoundException(`run not found: ${runId}`);
    const t = r.trace;
    const timeline = [
      { step: 'USER_QUERY', status: 'OK', payload: { utterance: r.utterance } },
      { step: 'TASK_FRAME', status: 'OK', payload: t.taskFrame },
      {
        step: 'AUTHORITY',
        status: t.authority.allowed ? 'OK' : 'FAIL',
        payload: t.authority,
      },
      {
        step: 'CLAIM_PLAN',
        status: 'OK',
        payload: { claimPlan: t.candidateClaimTypes ?? [] },
      },
      {
        step: 'REQUIRED_EVIDENCE',
        status: 'OK',
        payload: t.requiredEvidence.map((e) => ({
          key: e.key,
          importance: e.importance,
          onMissing: e.onMissing,
        })),
      },
      {
        step: 'ACQUISITION',
        status: t.acquisition ? 'OK' : 'SKIP',
        payload: t.acquisition ?? null,
      },
      {
        step: 'SUFFICIENCY',
        status:
          t.sufficiency?.status === 'SUFFICIENT'
            ? 'OK'
            : t.sufficiency?.status === 'PARTIAL'
              ? 'WARN'
              : 'FAIL',
        payload: t.sufficiency,
      },
      {
        step: 'CLAIMS',
        status: 'OK',
        payload: t.claims,
      },
      {
        step: 'GROUNDING',
        status: r.claimGroundingEval.passed ? 'OK' : 'FAIL',
        payload: r.claimGroundingEval,
      },
      {
        step: 'FINAL_ANSWER',
        status: 'OK',
        payload: {
          answerMode: t.routeDecision.answerMode,
          recommendedRoute: t.routeDecision.recommendedRoute,
          finalAnswer: r.finalAnswer,
        },
      },
    ];
    return {
      runId: r.runId,
      utterance: r.utterance,
      createdAt: r.createdAt,
      durationMs: r.durationMs,
      finalAnswer: r.finalAnswer,
      timeline,
      taskFrame: t.taskFrame,
      authority: t.authority,
      claimPlan: t.candidateClaimTypes ?? [],
      requiredEvidence: t.requiredEvidence,
      acquisition: t.acquisition ?? null,
      retrievedEvidence: t.retrievedEvidence,
      sufficiency: t.sufficiency,
      claims: t.claims.map((c) => ({
        ...c,
        grounding:
          t.groundingResult.find((g) => g.claimId === c.claimId)?.status ??
          'GROUNDED',
      })),
      claimGroundingEval: r.claimGroundingEval,
      routeDecision: t.routeDecision,
      issues: t.issues,
      upstreamAlignment: r.upstream,
      projected: r.projected,
    };
  }

  async replay(runId: string) {
    const r = await this.store.getRun(runId);
    if (!r) throw new NotFoundException(`run not found: ${runId}`);
    const replayed = replaySystem1Turn(r.trace);
    return {
      original: {
        sufficiency: r.trace.sufficiency?.status,
        groundingPassed: r.groundingPassed,
      },
      replayed: {
        sufficiency: replayed.sufficiency?.status,
        drifted: replayed.drifted,
        drift: replayed.drift,
      },
      drifted: replayed.drifted,
      drift: replayed.drift,
    };
  }

  async listTaskFrames(query: { q?: string; page?: number; pageSize?: number }) {
    const listed = await this.listRuns(query);
    const items = [];
    for (const item of listed.items) {
      const r = await this.store.getRun(item.runId);
      if (!r) continue;
      items.push({
        runId: r.runId,
        utterance: r.utterance,
        unifiedIntent: r.upstream.unifiedIntent,
        contract: r.upstream.contract,
        taskFrame: r.trace.taskFrame,
        family: r.family,
        labels: r.labels,
      });
    }
    return {
      ...listed,
      items,
    };
  }

  async labelTaskFrame(
    runId: string,
    body: { errors: string[]; noteZh?: string; expected?: object },
  ) {
    const r = await this.store.addLabel(runId, {
      kind: body.errors.join(','),
      reason: body.noteZh,
    });
    if (!r) throw new NotFoundException(`run not found: ${runId}`);
    return { runId, labels: r.labels, expected: body.expected ?? null };
  }

  async taskFrameEvalSummary() {
    const runs = await this.store.listRuns();
    const labeled = runs.filter((r) => r.labels.length > 0);
    const byKind: Record<string, number> = {};
    for (const r of labeled) {
      for (const l of r.labels) {
        for (const k of l.kind.split(',')) {
          byKind[k] = (byKind[k] ?? 0) + 1;
        }
      }
    }
    return {
      labeledCount: labeled.length,
      errorRateByKind: byKind,
      routingAccuracy:
        labeled.length === 0 ? null : 1 - labeled.length / Math.max(1, runs.length),
    };
  }

  async listEvidence(query: {
    key?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const bag = new Map<
      string,
      {
        evidenceId: string;
        key: string;
        sourceType: string;
        status: string;
        observedAt?: string;
        useCount: number;
        value: unknown;
      }
    >();
    for (const r of await this.store.listRuns()) {
      for (const e of r.trace.retrievedEvidence) {
        const prev = bag.get(e.evidenceId);
        if (prev) {
          prev.useCount += 1;
        } else {
          bag.set(e.evidenceId, {
            evidenceId: e.evidenceId,
            key: e.key,
            sourceType: e.sourceType,
            status: e.status,
            observedAt: e.observedAt,
            useCount: 1,
            value: e.value,
          });
        }
      }
    }
    let items = [...bag.values()];
    if (query.key) items = items.filter((e) => e.key === query.key);
    if (query.status) items = items.filter((e) => e.status === query.status);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: items.length,
    };
  }

  async getEvidence(evidenceId: string) {
    for (const r of await this.store.listRuns()) {
      const e = r.trace.retrievedEvidence.find((x) => x.evidenceId === evidenceId);
      if (!e) continue;
      const usedByClaims = r.trace.claims
        .filter((c) => c.evidenceKeys.includes(e.key))
        .map((c) => ({
          claimId: c.claimId,
          runId: r.runId,
          type: c.type,
          text: c.text,
          grounding:
            r.trace.groundingResult.find((g) => g.claimId === c.claimId)?.status ??
            'GROUNDED',
        }));
      return { evidence: e, usedByClaims };
    }
    throw new NotFoundException(`evidence not found: ${evidenceId}`);
  }

  async listPolicies() {
    return { items: this.store.codeDefaultPolicies() };
  }

  async getPolicy(scope: string, scopeKey: string) {
    const items = this.store.codeDefaultPolicies();
    const hit = items.find(
      (p) => p.scope === scope.toUpperCase() && p.scopeKey === scopeKey,
    );
    if (!hit) throw new NotFoundException('policy not found');
    return hit;
  }

  async simulatePolicy(body: {
    utterance?: string;
    claimPlan?: string[];
    family?: string;
  }) {
    const frame = body.utterance
      ? compileSystem1TaskFrame({ message: body.utterance })
      : null;
    const claimPlan =
      body.claimPlan ??
      (frame ? inferSystem1CandidateClaimTypes(frame) : []);
    const family =
      (body.family as any) ??
      (frame
        ? resolveSystem1RuntimeFamily(frame, null, body.utterance)
        : null);
    const required = resolveSystem1RequiredEvidence({
      family,
      candidateClaimTypes: claimPlan as any,
    });
    return {
      claimPlan,
      family,
      resolvedEvidenceKeys: required.map((r) => r.key),
      notes: ['resolved via ClaimPlan + Family policy'],
    };
  }

  async listClaims(query: { type?: string; grounding?: string; page?: number; pageSize?: number }) {
    const rows: Array<Record<string, unknown>> = [];
    for (const r of await this.store.listRuns()) {
      for (const c of r.trace.claims) {
        const g =
          r.trace.groundingResult.find((x) => x.claimId === c.claimId)?.status ??
          'GROUNDED';
        rows.push({
          claimId: c.claimId,
          runId: r.runId,
          type: c.type,
          text: c.text,
          evidenceKeys: c.evidenceKeys,
          strength: c.strength,
          grounding: g,
          evalPassed: r.claimGroundingEval.passed,
          createdAt: r.createdAt,
        });
      }
    }
    let items = rows;
    if (query.type) items = items.filter((c) => c.type === query.type);
    if (query.grounding) {
      items = items.filter((c) => c.grounding === query.grounding);
    }
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: items.length,
    };
  }

  async claimStats() {
    const listed = await this.listClaims({ pageSize: 1000 });
    const byType: Record<string, { total: number; grounded: number }> = {};
    for (const c of listed.items) {
      const t = String(c.type);
      byType[t] ??= { total: 0, grounded: 0 };
      byType[t].total += 1;
      if (c.grounding === 'GROUNDED') byType[t].grounded += 1;
    }
    const total = listed.total;
    const grounded = listed.items.filter((c) => c.grounding === 'GROUNDED').length;
    return {
      groundingRate: total ? grounded / total : 1,
      groups: Object.entries(byType).map(([key, v]) => ({
        key,
        total: v.total,
        grounded: v.grounded,
        partial: 0,
        ungrounded: v.total - v.grounded,
        groundingRate: v.total ? v.grounded / v.total : 1,
      })),
    };
  }

  async sufficiencyCases() {
    const runs = await this.store.listRuns();
    return {
      items: runs.map((r) => ({
        runId: r.runId,
        utterance: r.utterance,
        requiredKeys: r.trace.requiredEvidence.map((e) => e.key),
        actual: r.trace.retrievedEvidence.map((e) => ({
          key: e.key,
          status: e.status,
        })),
        predictedSufficiency: r.sufficiency,
        answerMode: r.answerMode,
        label: r.sufficiencyLabel?.label ?? null,
        expectedSufficiency: r.sufficiencyLabel?.expectedSufficiency ?? null,
      })),
    };
  }

  async labelSufficiency(
    runId: string,
    body: {
      label: 'FALSE_SUFFICIENT' | 'FALSE_INSUFFICIENT' | 'CORRECT';
      expectedSufficiency?: string;
      noteZh?: string;
    },
  ) {
    const r = await this.store.setSufficiencyLabel(runId, body);
    if (!r) throw new NotFoundException(`run not found: ${runId}`);
    return { runId, sufficiencyLabel: r.sufficiencyLabel };
  }

  async sufficiencyMetrics() {
    const runs = await this.store.listRuns();
    const labeled = runs.filter((r) => r.sufficiencyLabel);
    const falseSuf = labeled.filter(
      (r) => r.sufficiencyLabel?.label === 'FALSE_SUFFICIENT',
    ).length;
    const falseIns = labeled.filter(
      (r) => r.sufficiencyLabel?.label === 'FALSE_INSUFFICIENT',
    ).length;
    const correct = labeled.filter(
      (r) => r.sufficiencyLabel?.label === 'CORRECT',
    ).length;
    const n = Math.max(1, labeled.length);
    return {
      falseSufficientRate: falseSuf / n,
      falseInsufficientRate: falseIns / n,
      precision: labeled.length ? correct / n : null,
      labeledCount: labeled.length,
    };
  }

  async listGaps() {
    return { items: await this.store.listGaps() };
  }

  async patchGap(id: string, body: Record<string, unknown>) {
    const g = await this.store.updateGap(id, body);
    if (!g) throw new NotFoundException(`gap not found: ${id}`);
    return g;
  }

  async goldenCases() {
    const runs = await this.store.listRuns();
    return {
      items: SYSTEM1_RUNTIME_BOUNDARY.goldenCases.map((utterance, i) => {
        const run = runs.find((r) => r.utterance === utterance);
        return {
          caseId: `golden_${i + 1}`,
          utterance,
          expectedTaskFrame: run?.trace.taskFrame ?? null,
          expectedFamily: run?.family ?? null,
          expectedEvidenceKeys: run?.trace.requiredEvidence.map((e) => e.key) ?? [],
          expectedRoute: run?.recommendedRoute ?? null,
          tags: ['system1', 'regression'],
        };
      }),
    };
  }

  async runGoldenEval() {
    const cases = (await this.goldenCases()).items;
    const runs = await this.store.listRuns();
    const results = cases.map((c) => {
      const run = runs.find((r) => r.utterance === c.utterance);
      const passed = Boolean(run && run.groundingPassed && run.family);
      return {
        caseId: c.caseId,
        passed,
        diffs: passed
          ? []
          : [{ path: 'run', expected: 'seeded', actual: run ? 'partial' : null }],
        runId: run?.runId ?? null,
      };
    });
    return {
      runId: `eval_${Date.now()}`,
      passed: results.every((r) => r.passed),
      results,
    };
  }

  async evalMetrics() {
    const overview = await this.overview();
    const suf = await this.sufficiencyMetrics();
    const tf = await this.taskFrameEvalSummary();
    return {
      claimGroundingRate: overview.claimGrounding.groundingRate,
      evidenceSufficiencyPrecision: suf.precision,
      routingAccuracy: tf.routingAccuracy,
      window: overview.window,
    };
  }

  async authorityPolicy() {
    return {
      allowedActions: [...SYSTEM1_RUNTIME_BOUNDARY.allows],
      forbiddenActions: [...SYSTEM1_RUNTIME_BOUNDARY.forbids],
      boundaryRef: SYSTEM1_RUNTIME_BOUNDARY.schemaId,
      never: [...SYSTEM1_RUNTIME_BOUNDARY.never],
    };
  }

  async listViolations() {
    return { items: await this.store.listViolations() };
  }

  async patchViolation(id: string, body: { status: 'OPEN' | 'FIXED' | 'IGNORED' }) {
    const v = await this.store.updateViolation(id, body.status);
    if (!v) throw new NotFoundException(`violation not found: ${id}`);
    return v;
  }

  async toolMatrix() {
    return { items: await this.store.listTools() };
  }

  async upsertTool(toolId: string, body: Record<string, unknown>) {
    return await this.store.upsertTool(toolId, body);
  }

  async validateTool(body: { toolId: string; claimType: string }) {
    const tools = await this.store.listTools();
    const tool = tools.find((t) => t.toolId === body.toolId);
    if (!tool) return { ok: false, reason: 'tool_not_found' };
    if (tool.forbiddenClaimTypes.includes(body.claimType)) {
      return { ok: false, reason: 'forbidden_claim_type' };
    }
    if (
      tool.allowedClaimTypes.length &&
      !tool.allowedClaimTypes.includes(body.claimType)
    ) {
      return { ok: false, reason: 'claim_type_not_allowed' };
    }
    return { ok: true };
  }

  async addFeedback(body: {
    runId: string;
    rating?: number;
    thumbs?: 'UP' | 'DOWN';
    category?: string;
    commentZh?: string;
  }) {
    if (!await this.store.getRun(body.runId)) {
      throw new NotFoundException(`run not found: ${body.runId}`);
    }
    return await this.store.addFeedback(body);
  }

  async listFeedback() {
    return { items: await this.store.listFeedback() };
  }

  async diagnoseFeedback(id: string, body: { issueCode: string; details?: object }) {
    const fb = await this.store.updateFeedback(id, {
      status: 'DIAGNOSED',
      issueCode: body.issueCode,
    });
    if (!fb) throw new NotFoundException(`feedback not found: ${id}`);
    return fb;
  }

  async replayFeedback(id: string) {
    const items = await this.store.listFeedback();
    const fb = items.find((f) => f.feedbackId === id);
    if (!fb) throw new NotFoundException(`feedback not found: ${id}`);
    const replayed = await this.replay(fb.runId);
    await this.store.updateFeedback(id, { status: 'REPLAYED' });
    return { feedbackId: id, ...replayed };
  }
}
