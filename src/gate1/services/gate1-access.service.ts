import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { hasAdminPlatformAccess } from '../../auth/platform-roles';
import { Gate1GuardService } from './gate1-support.services';

const ORG_PROJECT_VIEW_ROLES = ['OWNER', 'AGENCY_ADMIN', 'OPERATIONS', 'ADVISOR'] as const;
const ORG_PORTFOLIO_ROLES = ['OWNER', 'AGENCY_ADMIN'] as const;

function parseIdList(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class Gate1AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly config: ConfigService,
  ) {}

  isOpsUser(userId: string, roles?: string[]): boolean {
    if (hasAdminPlatformAccess(roles)) return true;
    return parseIdList(this.config.get<string>('GATE1_OPS_USER_IDS')).includes(userId);
  }

  async assertOpsAccess(userId: string, roles?: string[]): Promise<void> {
    if (!this.isOpsUser(userId, roles)) {
      await this.recordDeniedAccess(userId, 'ops_route');
      throw new ForbiddenException('Gate1 ops access required');
    }
  }

  async assertAdvisorProjectAccess(
    projectId: string,
    userId: string,
    roles?: string[],
  ) {
    const project = await this.guard.requireProject(projectId);
    if (this.isOpsUser(userId, roles)) return project;
    if (project.advisorUserId === userId || project.projectManagerId === userId) {
      return project;
    }
    if (project.organizationId && (await this.hasOrgRole(project.organizationId, userId, ORG_PROJECT_VIEW_ROLES))) {
      return project;
    }
    await this.recordDeniedAccess(userId, 'advisor_project', projectId);
    throw new ForbiddenException('No access to this Gate1 project');
  }

  async assertAdvisorFindingAccess(findingId: string, userId: string, roles?: string[]) {
    const finding = await this.prisma.gate1ConflictFinding.findUnique({
      where: { id: findingId },
      include: { report: true },
    });
    if (!finding) return this.assertAdvisorProjectAccess('', userId, roles);
    return this.assertAdvisorProjectAccess(finding.report.projectId, userId, roles);
  }

  async assertAdvisorReadinessFindingAccess(findingId: string, userId: string, roles?: string[]) {
    const finding = await this.prisma.gate1ReadinessFinding.findUnique({
      where: { id: findingId },
      include: { report: true },
    });
    if (!finding) return this.assertAdvisorProjectAccess('', userId, roles);
    return this.assertAdvisorProjectAccess(finding.report.projectId, userId, roles);
  }

  async assertOrgPortfolioAccess(organizationId: string, userId: string, roles?: string[]) {
    if (this.isOpsUser(userId, roles)) return;
    if (!(await this.hasOrgRole(organizationId, userId, ORG_PORTFOLIO_ROLES))) {
      await this.recordDeniedAccess(userId, 'org_portfolio', organizationId);
      throw new ForbiddenException('Agency admin access required for organization portfolio');
    }
  }

  private async hasOrgRole(
    organizationId: string,
    userId: string,
    allowed: readonly string[],
  ): Promise<boolean> {
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        status: 'ACTIVE',
      },
    });
    if (!member) return false;
    const allowedSet = new Set(allowed.map((r) => r.toUpperCase()));
    return member.roles.some((r) => allowedSet.has(String(r).toUpperCase()));
  }

  private async recordDeniedAccess(actorId: string, resourceType: string, resourceId?: string) {
    if (resourceType !== 'advisor_project' || !resourceId) return;
    await this.prisma.gate1AccessAuditLog.create({
      data: {
        projectId: resourceId,
        actorId,
        action: 'ACCESS_DENIED',
        resourceType,
        resourceId,
        reason: 'RBAC',
      },
    });
  }
}
