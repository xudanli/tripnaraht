import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityAuditLogService } from './audit-log.service';
import { ProjectEligibilityRuleService, UpsertEligibilityRuleInput } from './project-eligibility-rule.service';
import { ProjectFitConfigService, UpdateListingFitConfigInput } from './project-fit-config.service';

export type RuleTemplateRuleDef = UpsertEligibilityRuleInput;

export type CreateRuleTemplateInput = {
  ownerSubjectType: 'PLATFORM' | 'ORGANIZATION';
  ownerSubjectId: string;
  name: string;
  description?: string;
  destinationTag?: string;
  commercialType?: string;
  rules: RuleTemplateRuleDef[];
  fitConfig?: UpdateListingFitConfigInput;
};

@Injectable()
export class ProjectEligibilityRuleTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly eligibilityRules: ProjectEligibilityRuleService,
    private readonly fitConfig: ProjectFitConfigService,
  ) {}

  async listAvailable(actorUserId: string, organizationId?: string) {
    const filters: Prisma.ProjectEligibilityRuleTemplateWhereInput[] = [
      { ownerSubjectType: 'PLATFORM', status: 'ACTIVE' },
    ];
    if (organizationId) {
      await this.assertOrgManager(organizationId, actorUserId);
      filters.push({ ownerSubjectType: 'ORGANIZATION', ownerSubjectId: organizationId, status: 'ACTIVE' });
    }

    return this.prisma.projectEligibilityRuleTemplate.findMany({
      where: { OR: filters },
      orderBy: [{ ownerSubjectType: 'asc' }, { name: 'asc' }],
    });
  }

  async create(actorUserId: string, input: CreateRuleTemplateInput) {
    if (input.ownerSubjectType === 'ORGANIZATION') {
      await this.assertOrgManager(input.ownerSubjectId, actorUserId);
    } else if (input.ownerSubjectType !== 'PLATFORM') {
      throw new BadRequestException('不支持的模板归属类型');
    }

    if (!input.rules.length) {
      throw new BadRequestException('模板至少包含一条规则');
    }

    const template = await this.prisma.projectEligibilityRuleTemplate.create({
      data: {
        ownerSubjectType: input.ownerSubjectType,
        ownerSubjectId: input.ownerSubjectId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        destinationTag: input.destinationTag?.trim() || null,
        commercialType: input.commercialType?.trim() || null,
        rules: input.rules as unknown as Prisma.InputJsonValue,
        fitConfig: input.fitConfig as Prisma.InputJsonValue | undefined,
        status: 'ACTIVE',
      },
    });

    await this.auditLog.record({
      actorId: actorUserId,
      action: 'RULE_TEMPLATE_CREATED',
      targetType: 'PROJECT_ELIGIBILITY_RULE_TEMPLATE',
      targetId: template.id,
    });

    return template;
  }

  async applyToListing(actorUserId: string, listingId: string, templateId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');
    if (listing.responsibleUserId !== actorUserId && listing.createdByUserId !== actorUserId) {
      throw new ForbiddenException('无权配置该项目准入规则');
    }

    const template = await this.prisma.projectEligibilityRuleTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.status !== 'ACTIVE') {
      throw new NotFoundException('规则模板不存在或已停用');
    }

    const ruleDefs = template.rules as unknown as RuleTemplateRuleDef[];
    const created = [];
    for (const def of ruleDefs) {
      const value = { ...def.value };
      if (def.conditionKey === 'budget_affordable' && listing.budgetMinCents != null) {
        value.minCents = listing.budgetMinCents;
      }
      created.push(
        await this.eligibilityRules.upsertRuleFromTemplate(actorUserId, listingId, {
          ...def,
          value,
        }, templateId),
      );
    }

    if (template.fitConfig && typeof template.fitConfig === 'object') {
      const cfg = template.fitConfig as { enabledSoftDimensions?: string[]; previewQuestionKeys?: string[] };
      await this.fitConfig.updateConfig(actorUserId, listingId, {
        enabledSoftDimensions: cfg.enabledSoftDimensions,
        previewQuestionKeys: cfg.previewQuestionKeys,
      });
    }

    await this.auditLog.record({
      actorId: actorUserId,
      action: 'RULE_TEMPLATE_APPLIED',
      targetType: 'TRUSTED_PROJECT_LISTING',
      targetId: listingId,
      after: { templateId, rulesApplied: created.length },
    });

    return { templateId, rulesApplied: created.length, rules: created };
  }

  private async assertOrgManager(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    const canManage = membership?.roles.some((r) =>
      ['OWNER', 'AGENCY_ADMIN'].includes(r.toUpperCase()),
    );
    if (!membership || membership.status !== 'ACTIVE' || !canManage) {
      throw new ForbiddenException('无权管理机构规则模板');
    }
  }
}
