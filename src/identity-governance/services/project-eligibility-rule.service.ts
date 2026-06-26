import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityAuditLogService } from './audit-log.service';

export type UpsertEligibilityRuleInput = {
  ruleType: string;
  conditionKey: string;
  operator: string;
  value: Record<string, unknown>;
  severity: string;
  evidenceRequirement: string;
  waiverPolicy: string;
  explanationTemplate?: string;
};

@Injectable()
export class ProjectEligibilityRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async listActiveRules(listingId: string) {
    return this.prisma.projectEligibilityRule.findMany({
      where: { listingId, isActive: true },
      orderBy: [{ severity: 'asc' }, { conditionKey: 'asc' }],
    });
  }

  async getRuleSnapshotVersion(listingId: string): Promise<number> {
    const latest = await this.prisma.projectEligibilityRule.findFirst({
      where: { listingId, isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest?.version ?? 1;
  }

  async upsertRule(
    managerUserId: string,
    listingId: string,
    input: UpsertEligibilityRuleInput,
    templateId?: string,
  ) {
    await this.assertListingManager(listingId, managerUserId);

    const version = (await this.getRuleSnapshotVersion(listingId)) + 1;
    const existing = await this.prisma.projectEligibilityRule.findFirst({
      where: { listingId, conditionKey: input.conditionKey, isActive: true },
    });

    if (existing) {
      await this.prisma.projectEligibilityRule.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }

    const rule = await this.prisma.projectEligibilityRule.create({
      data: {
        listingId,
        templateId: templateId ?? null,
        ruleType: input.ruleType,
        conditionKey: input.conditionKey,
        operator: input.operator,
        value: input.value as Prisma.InputJsonValue,
        severity: input.severity,
        evidenceRequirement: input.evidenceRequirement,
        waiverPolicy: input.waiverPolicy,
        explanationTemplate: input.explanationTemplate ?? null,
        version,
      },
    });

    await this.auditLog.record({
      actorId: managerUserId,
      action: 'ELIGIBILITY_RULE_UPSERTED',
      targetType: 'PROJECT_ELIGIBILITY_RULE',
      targetId: rule.id,
      after: { conditionKey: rule.conditionKey, version, templateId: templateId ?? null },
    });

    await this.expireStaleAssessments(listingId, version);

    return rule;
  }

  async upsertRuleFromTemplate(
    managerUserId: string,
    listingId: string,
    input: UpsertEligibilityRuleInput,
    templateId: string,
  ) {
    return this.upsertRule(managerUserId, listingId, input, templateId);
  }

  async expireStaleAssessments(listingId: string, currentVersion: number): Promise<number> {
    const result = await this.prisma.projectFitAssessment.updateMany({
      where: {
        listingId,
        status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        ruleSnapshotVersion: { lt: currentVersion },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async seedDefaultRules(managerUserId: string, listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');

    const defaults: UpsertEligibilityRuleInput[] = [
      {
        ruleType: 'RESOURCE',
        conditionKey: 'dates_available',
        operator: 'EQ',
        value: { expected: true },
        severity: 'BLOCKER',
        evidenceRequirement: 'SELF_DECLARE',
        waiverPolicy: 'NOT_ALLOWED',
        explanationTemplate: '需能完整参与项目标注的出发与返回日期',
      },
      {
        ruleType: 'RESOURCE',
        conditionKey: 'budget_affordable',
        operator: 'GTE',
        value: { minCents: listing.budgetMinCents ?? 0 },
        severity: 'BLOCKER',
        evidenceRequirement: 'SELF_DECLARE',
        waiverPolicy: 'NOT_ALLOWED',
        explanationTemplate: '需能承担项目总价及已披露的必要额外费用',
      },
    ];

    if (listing.budgetMinCents) {
      defaults.push({
        ruleType: 'POLICY',
        conditionKey: 'equipment_ready',
        operator: 'EQ',
        value: { expected: true },
        severity: 'MUST_CONFIRM',
        evidenceRequirement: 'SELF_DECLARE',
        waiverPolicy: 'LEADER_APPROVAL',
        explanationTemplate: '需拥有或愿意租赁项目列出的必要装备',
      });
    }

    const created = [];
    for (const rule of defaults) {
      created.push(await this.upsertRule(managerUserId, listingId, rule));
    }
    return created;
  }

  private async assertListingManager(listingId: string, userId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');
    if (listing.responsibleUserId !== userId && listing.createdByUserId !== userId) {
      throw new ForbiddenException('无权配置该项目准入规则');
    }
  }
}
