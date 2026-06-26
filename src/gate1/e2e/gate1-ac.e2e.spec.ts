/**
 * Gate 1 Advisor Workspace acceptance criteria E2E (AC-01 ~ AC-12)
 */
import { ForbiddenException } from '@nestjs/common';
import { createGate1Harness } from './gate1-harness';

describe('Gate1 Advisor Workspace AC E2E', () => {
  it('AC-01 ~ AC-12: full Planning cohort concierge flow', async () => {
    const h = createGate1Harness();
    const { advisor, ops, analyst, intruder } = h.ids;

    // AC-01: create project + confirm baseline → COLLECTING path starts at BASELINE_READY
    const project = await h.projects.create(advisor, {
      title: 'E2E 冰岛家庭团',
      cohort: 'PLANNING',
      organizationId: h.ids.org,
      destination: 'IS',
      participantCount: 2,
    });
    expect(project.experimentStatus).toBe('DRAFT');

    await h.baselines.submit(project.id, advisor, {
      mightRejectWithoutTripnara: 'NO',
      participantCount: 2,
      destination: 'IS',
      knownConflicts: [{ type: 'pace' }],
      confirm: true,
    });

    const confirmed = h.store.findFirst('gate1ExperimentBaselines', {
      where: { projectId: project.id, isConfirmed: true },
    });
    expect(confirmed).toBeTruthy();

    const afterBaseline = h.store.findUnique('gate1Projects', { where: { id: project.id } });
    expect(afterBaseline?.experimentStatus).toBe('BASELINE_READY');

    // AC-02: invite member + progress visible
    const { participant: invite } = await h.participants.createInvitation(project.id, advisor, {
      displayName: '成员甲',
    });
    expect(invite.status).toBe('INVITED');

    const progress = await h.participants.listProgress(project.id);
    expect(progress.participants).toHaveLength(1);
    expect(progress.completionRate).toBe(0);

    h.store.update('gate1Participants', {
      where: { id: invite.id as string },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    const progressAfter = await h.participants.listProgress(project.id);
    expect(progressAfter.completionRate).toBe(1);

    // AC-03: privacy analyst + sanitized constraint; advisor sees summary only
    await h.privacy.assignAnalyst(project.id, ops, {
      analystId: analyst,
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
    });

    h.store.create('gate1PrivateConstraints', {
      data: {
        participantId: invite.id,
        fieldKey: 'budget',
        encryptedValue: h.crypto.encrypt('王女士预算只有一万元'),
        authorizationLevel: 'SANITIZED_TO_ADVISOR',
        status: 'ACTIVE',
      },
    });

    const sanitized = await h.privacy.createSanitized(project.id, analyst, {
      participantId: invite.id as string,
      explanation: '部分成员预算约束与当前方案存在冲突',
      impactSummary: '建议调整住宿层级',
    });
    await h.privacy.reviewSanitized(project.id, sanitized.id as string, ops, {
      reviewStatus: 'APPROVED',
    });

    const advisorConstraints = await h.privacy.listSanitizedForAdvisor(project.id);
    expect(advisorConstraints[0].explanation).toContain('预算约束');
    expect(JSON.stringify(advisorConstraints)).not.toMatch(/王女士|一万元/);

    await h.privacy.listPrivateConstraints(project.id, analyst, { reason: '脱敏处理' });
    const auditReads = h.store.findMany('gate1AccessAuditLogs', {
      where: { projectId: project.id, action: 'READ' },
    });
    expect(auditReads.length).toBeGreaterThan(0);

    // AC-04: ops publishes conflict report with human-assisted label
    await h.conflicts.upsertDraft(project.id, ops, {
      humanMinutes: 60,
      findings: [
        {
          conflictType: 'budget',
          severity: 'HIGH',
          confidence: 'HIGH',
          source: 'member_input',
          baselineStatus: 'NEWLY_FOUND',
          title: '预算与住宿冲突',
          description: '部分成员预算约束与当前住宿方案存在冲突',
          isBlocker: true,
        },
      ],
    });
    const publishedConflict = await h.conflicts.publish(project.id, 1, ops, { humanMinutes: 60 });
    expect(publishedConflict.status).toBe('PUBLISHED');
    expect(publishedConflict.sourceType).toBe('HUMAN_ASSISTED');

    const advisorConflicts = await h.conflicts.getPublishedForAdvisor(project.id);
    expect(advisorConflicts[0].humanAssistedLabel).toBe('人工协助');

    // AC-05: advisor confirms conflict finding
    const findingId = (advisorConflicts[0].findings as Array<{ id: string }>)[0].id;
    const acted = await h.conflicts.recordFindingAction(findingId, advisor, {
      action: 'CONFIRM',
      reason: '顾问确认该冲突影响方案',
    });
    expect(acted.advisorFeedback).toBe('CONFIRMED');

    // AC-04 continued: publish two candidates for compare
    const candidateA = await h.candidates.createDraft(project.id, ops, {
      label: '平衡版',
      strategySummary: '南部环线标准节奏',
      constraintSatisfaction: { budget: 'partial' },
      tradeoffs: { pace: 'medium' },
      humanMinutes: 45,
    });
    await h.candidates.publish(project.id, candidateA.id as string, ops, { humanMinutes: 45 });

    const candidateB = await h.candidates.createDraft(project.id, ops, {
      label: '体验版',
      version: 2,
      strategySummary: '增加冰川徒步',
      constraintSatisfaction: { budget: 'low' },
      tradeoffs: { pace: 'fast' },
      humanMinutes: 30,
    });
    await h.candidates.publish(project.id, candidateB.id as string, ops, { humanMinutes: 30 });

    // AC-06: compare candidates
    const comparison = await h.candidates.compare(
      project.id,
      candidateA.id as string,
      candidateB.id as string,
    );
    expect(comparison.dimensions.some((d) => d.key === 'strategySummary' && d.changed)).toBe(true);

    // AC-07: advisor creates modified version without overwriting
    const advisorVersion = await h.candidates.createAdvisorVersion(project.id, advisor, {
      label: '顾问修订版',
      basedOnCandidateId: candidateA.id as string,
      strategySummary: '南部环线 + 缓冲日',
      modificationNote: '增加 Day4 休息',
    });
    expect(advisorVersion.sourceType).toBe('ADVISOR');
    expect(advisorVersion.version).toBeGreaterThan(1);

    const allPublished = await h.candidates.listForAdvisor(project.id);
    expect(allPublished.length).toBeGreaterThanOrEqual(3);

    // AC-08: submit decision record
    const decision = await h.decisions.submit(project.id, advisor, {
      selectedCandidateId: advisorVersion.id as string,
      conflictReportVersion: 1,
      materialChange: true,
      changeTypes: ['ACTIVITY', 'BUFFER'],
      changeEvidence: '采纳顾问修订版并增加缓冲日',
      reasonText: '平衡体验与体力',
    });
    expect(decision.materialChange).toBe(true);
    expect(decision.changeTypes).toEqual(expect.arrayContaining(['ACTIVITY', 'BUFFER']));

    const projectAfterDecision = h.store.findUnique('gate1Projects', { where: { id: project.id } });
    expect(['READY', 'ADVISOR_DECIDING']).toContain(projectAfterDecision?.experimentStatus);

    // AC-09: work logs visible per project
    const workLogs = await h.projects.listWorkLogs(project.id);
    expect(workLogs.totalMinutes).toBeGreaterThan(0);
    expect(workLogs.byTaskType.CONFLICT_REPORT).toBeGreaterThan(0);

    // AC-10: cohort metrics isolated
    const metrics = await h.analytics.getMetrics('PLANNING');
    expect(metrics.cohort).toBe('PLANNING');
    expect(metrics.productization.projectCount).toBeGreaterThan(0);

    // AC-11: unauthorized access denied + audit
    await expect(
      h.access.assertAdvisorProjectAccess(project.id, intruder),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const deniedLogs = h.store.findMany('gate1AccessAuditLogs', {
      where: { action: 'ACCESS_DENIED', actorId: intruder },
    });
    expect(deniedLogs.length).toBeGreaterThan(0);

    // AC-12: cancel project preserves history
    await h.projects.transitionStatus(project.id, advisor, {
      status: 'WITHDRAWN',
      reason: '客户取消订单',
    });
    const cancelled = h.store.findUnique('gate1Projects', { where: { id: project.id } });
    expect(cancelled?.experimentStatus).toBe('WITHDRAWN');
    expect(h.store.findMany('gate1AdvisorDecisions', { where: { projectId: project.id } }).length).toBe(1);
  });

  it('AC-07 isolated: advisor version does not mutate ops draft', async () => {
    const h = createGate1Harness();
    const { advisor, ops } = h.ids;

    const project = await h.projects.create(advisor, {
      title: '版本隔离测试',
      cohort: 'PLANNING',
    });
    await h.baselines.submit(project.id, advisor, {
      mightRejectWithoutTripnara: 'NO',
      confirm: true,
    });

    const original = await h.candidates.createDraft(project.id, ops, {
      label: '原版',
      strategySummary: '原始摘要',
      humanMinutes: 10,
    });
    await h.candidates.publish(project.id, original.id as string, ops, { humanMinutes: 10 });

    await h.candidates.createAdvisorVersion(project.id, advisor, {
      label: '顾问改',
      basedOnCandidateId: original.id as string,
      strategySummary: '修改摘要',
    });

    const unchanged = h.store.findUnique('gate1CandidateStrategies', {
      where: { id: original.id as string },
    });
    expect(unchanged?.strategySummary).toBe('原始摘要');
  });

  it('AC-03 advisor remind respects 24h cooldown', async () => {
    const h = createGate1Harness();
    const { advisor } = h.ids;

    const project = await h.projects.create(advisor, {
      title: '催办测试',
      cohort: 'PLANNING',
    });
    await h.baselines.submit(project.id, advisor, {
      mightRejectWithoutTripnara: 'NO',
      confirm: true,
    });
    const { participant: invite } = await h.participants.createInvitation(project.id, advisor, {
      displayName: '待填写成员',
    });

    const first = await h.reminders.sendAdvisorInitiatedReminder(
      project.id,
      invite.id as string,
      advisor,
    );
    expect(first.sent).toBe(true);

    await expect(
      h.reminders.sendAdvisorInitiatedReminder(project.id, invite.id as string, advisor),
    ).rejects.toThrow(/24 hours/);
  });
});
