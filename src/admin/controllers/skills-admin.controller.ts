import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../guards/admin-strict-auth.guard';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { SkillExecutionRecorderService } from '../../skills/services/skill-execution-recorder.service';
import type { SkillMetadata } from '../../skills/interfaces/skill.interface';
import { successResponse } from '../../common/dto/standard-response.dto';
import { loadSkillsManifest, type SkillsManifestRow } from '../utils/skills-manifest.util';
import {
  buildSkillUsageMap,
  getSkillUsageRow,
  isPmConfirmedDeprecated,
  loadSkillDeprecationDecisions,
  loadSkillUsageAudit,
  type SkillUsageRecommendation,
  type SkillUsageTier,
} from '../../skills/utils/skill-usage-audit.util';

export interface AdminSkillListItem {
  name: string;
  description: string;
  version: string;
  category: string;
  toolGroup?: 'DOMAIN' | 'CONTEXT';
  level?: string;
  registered: boolean;
  className?: string;
  sourceFile?: string;
  usageTier?: SkillUsageTier;
  usageRecommendation?: SkillUsageRecommendation;
  harnessPathLikely?: boolean;
  toolSelectMasked?: boolean;
  lifecycleStatus?: 'active' | 'deprecated';
  pmDeprecationConfirmed?: boolean;
  pmUnregistered?: boolean;
}

function applyUsageFields(item: AdminSkillListItem): AdminSkillListItem {
  const usage = getSkillUsageRow(item.name);
  const pmDeprecated = isPmConfirmedDeprecated(item.name);
  const excluded = pmDeprecated || usage?.recommendation === 'CANDIDATE_DEPRECATE';
  return {
    ...item,
    usageTier: usage?.tier,
    usageRecommendation: pmDeprecated ? 'CANDIDATE_DEPRECATE' : usage?.recommendation,
    harnessPathLikely: usage?.harnessPathLikely,
    toolSelectMasked: excluded,
    lifecycleStatus: pmDeprecated ? 'deprecated' : 'active',
    pmDeprecationConfirmed: pmDeprecated,
    pmUnregistered: pmDeprecated,
  };
}

function manifestRowToListItem(row: SkillsManifestRow, registered: boolean): AdminSkillListItem {
  return applyUsageFields({
    name: row.name,
    description: row.description,
    version: row.version,
    category: row.category,
    level: row.level,
    registered,
    className: row.className,
    sourceFile: row.sourceFile,
  });
}

function metadataToListItem(meta: SkillMetadata, registered: boolean): AdminSkillListItem {
  return applyUsageFields({
    name: meta.name,
    description: meta.description,
    version: meta.version,
    category: meta.category,
    toolGroup: meta.toolGroup,
    registered,
  });
}

@ApiTags('Admin — Skills')
@Controller('admin/skills')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set (Bearer value alternative)',
})
export class SkillsAdminController {
  constructor(
    private readonly skillsRegistry: SkillsRegistryService,
    private readonly skillExecutionRecorder: SkillExecutionRecorderService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Skill 目录列表（分页）',
    description:
      '合并 skills-manifest.json 与运行时 SkillsRegistry；支持按 category / 关键词 / 是否已注册筛选',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20, description: '最大 200' })
  @ApiQuery({ name: 'category', required: false, description: '如 world / decision / rag' })
  @ApiQuery({ name: 'q', required: false, description: '名称或描述模糊搜索' })
  @ApiQuery({
    name: 'registered',
    required: false,
    description: 'true=仅运行时已注册；false=仅 manifest 未注册',
  })
  @ApiQuery({ name: 'usageTier', required: false, description: 'CORE | WORKBENCH | REFERENCED | DORMANT' })
  @ApiQuery({
    name: 'usageRecommendation',
    required: false,
    description: 'KEEP | WIRE_OR_DOCUMENT | REVIEW | CANDIDATE_DEPRECATE',
  })
  async listSkills(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('registered') registered?: string,
    @Query('usageTier') usageTier?: string,
    @Query('usageRecommendation') usageRecommendation?: string,
  ) {
    const page = Math.max(1, pageRaw ? parseInt(pageRaw, 10) : 1);
    const pageSize = Math.min(200, Math.max(1, pageSizeRaw ? parseInt(pageSizeRaw, 10) : 20));

    const registeredSet = new Set(
      this.skillsRegistry.getAllSkillMetadata().map((m) => m.name),
    );
    const manifest = loadSkillsManifest();
    const byName = new Map<string, AdminSkillListItem>();

    for (const row of manifest?.skills ?? []) {
      byName.set(row.name, manifestRowToListItem(row, registeredSet.has(row.name)));
    }
    for (const meta of this.skillsRegistry.getAllSkillMetadata()) {
      if (!byName.has(meta.name)) {
        byName.set(meta.name, metadataToListItem(meta, true));
      } else {
        const existing = byName.get(meta.name)!;
        byName.set(meta.name, {
          ...existing,
          ...metadataToListItem(meta, true),
          sourceFile: existing.sourceFile,
          className: existing.className,
          level: existing.level,
        });
      }
    }

    let rows = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));

    if (category?.trim()) {
      const c = category.trim().toLowerCase();
      rows = rows.filter((r) => r.category.toLowerCase() === c);
    }
    if (registered === 'true') {
      rows = rows.filter((r) => r.registered);
    } else if (registered === 'false') {
      rows = rows.filter((r) => !r.registered);
    }
    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.description.toLowerCase().includes(needle),
      );
    }
    if (usageTier?.trim()) {
      const t = usageTier.trim().toUpperCase();
      rows = rows.filter((r) => r.usageTier === t);
    }
    if (usageRecommendation?.trim()) {
      const rec = usageRecommendation.trim().toUpperCase();
      rows = rows.filter((r) => r.usageRecommendation === rec);
    }

    const usageAudit = loadSkillUsageAudit();
    const total = rows.length;
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);

    return successResponse({
      rows: slice,
      total,
      page,
      pageSize,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
      manifestGeneratedAt: manifest?.generatedAt,
      usageAuditGeneratedAt: usageAudit?.generatedAt,
      runtimeRegisteredCount: registeredSet.size,
      catalogTotal: byName.size,
    });
  }

  @Get('executions/summary')
  @ApiOperation({ summary: 'Skill 执行汇总（按 skill / routePath / step）' })
  @ApiQuery({ name: 'requestId', required: false })
  @ApiQuery({ name: 'startTime', required: false })
  @ApiQuery({ name: 'endTime', required: false })
  async getExecutionsSummary(
    @Query('requestId') requestId?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const summary = await this.skillExecutionRecorder.aggregateSummary({
      requestId,
      startTime,
      endTime,
    });
    return successResponse(summary);
  }

  @Get('executions')
  @ApiOperation({ summary: 'Skill 执行流水（分页）' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'requestId', required: false, description: 'route_and_run request_id' })
  @ApiQuery({ name: 'skillName', required: false })
  @ApiQuery({ name: 'routePath', required: false, description: 'LIGHTWEIGHT | STATE_MACHINE | CLAUDE_DYNAMIC' })
  @ApiQuery({ name: 'success', required: false, description: 'true | false' })
  @ApiQuery({ name: 'startTime', required: false })
  @ApiQuery({ name: 'endTime', required: false })
  async listExecutions(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('requestId') requestId?: string,
    @Query('skillName') skillName?: string,
    @Query('routePath') routePath?: string,
    @Query('success') success?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    let successFilter: boolean | undefined;
    if (success === 'true') successFilter = true;
    else if (success === 'false') successFilter = false;

    if (requestId?.trim()) {
      const rows = await this.skillExecutionRecorder.getTraceByRequestId(requestId.trim());
      const bySkill: Record<string, { calls: number; success: number; total_duration_ms: number }> =
        {};
      for (const row of rows) {
        const key = row.canonicalName ?? row.skillName;
        if (!bySkill[key]) {
          bySkill[key] = { calls: 0, success: 0, total_duration_ms: 0 };
        }
        bySkill[key].calls += 1;
        if (row.success) bySkill[key].success += 1;
        bySkill[key].total_duration_ms += row.durationMs;
      }
      return successResponse({
        source: 'db',
        requestId: requestId.trim(),
        rows,
        bySkill,
      });
    }

    const result = await this.skillExecutionRecorder.listExecutions({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      skillName,
      routePath,
      success: successFilter,
      startTime,
      endTime,
    });
    return successResponse(result);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Skill 目录汇总（按 category / 注册状态）' })
  async getSummary() {
    const manifest = loadSkillsManifest();
    const registeredSet = new Set(
      this.skillsRegistry.getAllSkillMetadata().map((m) => m.name),
    );
    const byCategory: Record<string, { total: number; registered: number }> = {};
    const names = new Set<string>();

    for (const row of manifest?.skills ?? []) {
      names.add(row.name);
      if (!byCategory[row.category]) {
        byCategory[row.category] = { total: 0, registered: 0 };
      }
      byCategory[row.category].total += 1;
      if (registeredSet.has(row.name)) {
        byCategory[row.category].registered += 1;
      }
    }
    for (const name of registeredSet) {
      names.add(name);
      const meta = this.skillsRegistry.getSkill(name)?.metadata;
      const cat = meta?.category ?? 'unknown';
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, registered: 0 };
      }
      if (!manifest?.skills?.some((s) => s.name === name)) {
        byCategory[cat].total += 1;
        byCategory[cat].registered += 1;
      }
    }

    return successResponse({
      catalogTotal: names.size,
      manifestTotal: manifest?.skills?.length ?? 0,
      runtimeRegisteredCount: registeredSet.size,
      manifestOnlyCount: (manifest?.skills ?? []).filter((s) => !registeredSet.has(s.name)).length,
      manifestGeneratedAt: manifest?.generatedAt,
      usageAuditGeneratedAt: loadSkillUsageAudit()?.generatedAt,
      deprecationDecisions: loadSkillDeprecationDecisions(),
      pmConfirmedDeprecatedCount: loadSkillDeprecationDecisions()?.deprecated.length ?? 0,
      byCategory,
      byUsageTier: Object.fromEntries(
        (['CORE', 'WORKBENCH', 'REFERENCED', 'DORMANT'] as const).map((tier) => [
          tier,
          Array.from(buildSkillUsageMap().values()).filter((u) => u.tier === tier).length,
        ]),
      ),
      byUsageRecommendation: (() => {
        const counts: Record<string, number> = {};
        for (const u of buildSkillUsageMap().values()) {
          counts[u.recommendation] = (counts[u.recommendation] ?? 0) + 1;
        }
        return counts;
      })(),
      legacyAliases: {
        'dem.get.profile': 'dem.get_profile',
        'dem.getProfile': 'dem.get_profile',
        'geo.check.hazard.zones': 'geo.checkHazardZones',
      },
    });
  }

  @Get(':name')
  @ApiOperation({ summary: '单个 Skill 详情' })
  @ApiParam({ name: 'name', description: 'Skill 名，如 world.buildContext' })
  async getSkillDetail(@Param('name') name: string) {
    const skill = this.skillsRegistry.getSkill(name);
    const manifest = loadSkillsManifest();
    const manifestRow = manifest?.skills?.find((s) => s.name === name);
    const usage = getSkillUsageRow(name);
    const pmDeprecated = isPmConfirmedDeprecated(name);

    if (!skill && !manifestRow) {
      throw new NotFoundException(`Skill not found: ${name}`);
    }

    return successResponse({
      name,
      registered: Boolean(skill),
      metadata: skill?.metadata ?? null,
      inputSchema: skill?.metadata?.inputSchema ?? null,
      manifest: manifestRow ?? null,
      usage: usage ?? null,
      toolSelectMasked: pmDeprecated || usage?.recommendation === 'CANDIDATE_DEPRECATE',
      lifecycleStatus: pmDeprecated ? 'deprecated' : 'active',
      pmDeprecationConfirmed: pmDeprecated,
      deprecationDecisions: loadSkillDeprecationDecisions(),
    });
  }
}
