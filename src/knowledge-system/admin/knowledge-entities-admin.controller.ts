import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../../admin/guards/admin-strict-auth.guard';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import type { KnowledgeDomain } from '../contracts/entity-identity.types';
import type { EntityIdentity } from '../contracts/entity-identity.types';
import {
  EntityIdentityRegistryService,
  PHASE1_OBSERVED_SUBJECT_IDS,
  toApiEntityStatus,
} from '../identity/entity-identity-registry.service';
import { KnowledgeEntityCreateFormService } from '../identity/knowledge-entity-create-form.service';
import {
  IdentitySyncSource,
  KnowledgeIdentitySyncService,
} from '../identity/knowledge-identity-sync.service';
import { KnowledgeWorldStateService } from '../world-state/knowledge-world-state.service';
import { KnowledgeRelationRegistryService } from '../relations/knowledge-relation-registry.service';
import { KnowledgeTravelerContextService } from '../traveler-context/knowledge-traveler-context.service';
import { KnowledgeDecisionCaseService } from '../decision-knowledge/knowledge-decision-case.service';
import { KnowledgeSemanticService } from '../semantic/knowledge-semantic.service';
import { buildKnowledgeHealthOverview } from '../semantic/build-knowledge-health-overview.util';
import { countKnowledgeRulesForEntity } from '../identity/count-knowledge-rules-for-entity.util';

function toEntityAdminView(e: EntityIdentity) {
  return {
    canonicalEntityId: e.canonicalEntityId,
    id: e.canonicalEntityId,
    subjectId: e.canonicalEntityId,
    name: e.displayName ?? e.canonicalEntityId,
    displayName: e.displayName,
    type: e.entityType,
    entityType: e.entityType,
    domain: e.domain,
    status: toApiEntityStatus(e.status),
    aliases: e.aliases ?? [],
    country: e.country,
    description: e.description,
    properties: e.properties,
    origin: e.origin,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    sourceRefs: e.sourceRefs,
  };
}

@ApiTags('knowledge-control-center')
@Controller('admin/knowledge')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class KnowledgeEntitiesAdminController {
  private readonly logger = new Logger(KnowledgeEntitiesAdminController.name);

  constructor(
    private readonly registry: EntityIdentityRegistryService,
    private readonly createForm: KnowledgeEntityCreateFormService,
    private readonly identitySync: KnowledgeIdentitySyncService,
    private readonly worldState: KnowledgeWorldStateService,
    private readonly relations: KnowledgeRelationRegistryService,
    private readonly travelerContext: KnowledgeTravelerContextService,
    private readonly decisionCases: KnowledgeDecisionCaseService,
    private readonly semantic: KnowledgeSemanticService,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Knowledge Control Center health overview (Phase 1–6)',
    description: 'Health metrics only — not a knowledge volume dashboard.',
  })
  health() {
    const overview = buildKnowledgeHealthOverview({
      identity: this.registry,
      worldState: this.worldState,
      relations: this.relations,
      travelerContext: this.travelerContext,
      decisionCases: this.decisionCases,
      semantic: this.semantic,
    });
    return successResponse({
      ...overview,
      ...overview.metrics,
      ...overview.countsForOps,
    });
  }

  @Get('overview')
  @ApiOperation({ summary: 'Alias of /health — metrics + red lines' })
  overview() {
    return successResponse(
      buildKnowledgeHealthOverview({
        identity: this.registry,
        worldState: this.worldState,
        relations: this.relations,
        travelerContext: this.travelerContext,
        decisionCases: this.decisionCases,
        semantic: this.semantic,
      }),
    );
  }

  @Get('entities')
  @ApiOperation({ summary: 'List canonical entities' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'domain', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sourceSystem', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  listEntities(
    @Query('q') q?: string,
    @Query('domain') domain?: KnowledgeDomain,
    @Query('entityType') entityType?: string,
    @Query('status') status?: string,
    @Query('sourceSystem') sourceSystem?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = this.registry.list({
      q,
      domain,
      entityType,
      status,
      sourceSystem,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
    return successResponse(data);
  }

  @Get('entities/unresolved')
  @ApiOperation({
    summary: 'Subjects that lack a clean canonical mapping (ops queue)',
    description: 'Uses Phase 0 observed subjectId seed; POST check-subjects for ad-hoc lists.',
  })
  listUnresolved() {
    return successResponse({
      items: this.registry.listUnresolved(PHASE1_OBSERVED_SUBJECT_IDS),
      seed: 'PHASE1_OBSERVED_SUBJECT_IDS',
    });
  }

  @Get('entities/create-types')
  @ApiOperation({
    summary: '新建实体可选类型（中文名 + 联动能力）',
    description: '第一步：选择类型；Place 等会标记支持国家/POI 联动',
  })
  listCreateTypes() {
    return successResponse(this.createForm.listCreatableTypes());
  }

  @Post('entities/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '同步 Identity（CPRE / Country Pack / place_db / ontology 快照）→ DB',
    description:
      '将 CPRE 目录、CountryProfile、place_db 链接写入 knowledge_entity_identities；落 ontology catalog 快照。不覆盖 origin=ADMIN 行。',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['cpre', 'country_pack', 'place_db', 'ontology_snapshot'],
          },
          description: '省略则同步全部来源',
        },
      },
    },
  })
  async syncEntities(
    @Body() body?: { sources?: IdentitySyncSource[] },
  ) {
    const allowed: IdentitySyncSource[] = [
      'cpre',
      'country_pack',
      'place_db',
      'ontology_snapshot',
    ];
    const sources =
      Array.isArray(body?.sources) && body.sources.length > 0
        ? body.sources.filter((s): s is IdentitySyncSource =>
            allowed.includes(s as IdentitySyncSource),
          )
        : allowed;
    if (sources.length === 0) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'sources 无效', {
        allowed,
      });
    }
    const result = await this.identitySync.sync(sources);
    return successResponse(result);
  }

  @Get('entities/sync')
  @ApiOperation({ summary: '最近一次 Identity 同步结果（进程内）' })
  getLastSync() {
    return successResponse({
      lastSync: this.identitySync.getLastSync(),
    });
  }

  @Get('entities/sync/runs')
  @ApiOperation({ summary: 'Identity 同步运行历史（DB）' })
  @ApiQuery({ name: 'limit', required: false })
  async listSyncRuns(@Query('limit') limit?: string) {
    const runs = await this.identitySync.listRuns(limit ? Number(limit) : 10);
    return successResponse({ items: runs, total: runs.length });
  }

  @Post('entities')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create canonical Identity entity（显式新建，≠ resolve）',
    description:
      '写入 Identity 目录一条规范实体（origin=ADMIN，DB 可用时持久化）。可传 linkedPoiId 关联 POI 并回填；type 须在 ontology types 投影中。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type'],
      properties: {
        name: { type: 'string', description: '展示名（选 POI 时可省略）', example: 'Tokyo Station' },
        type: { type: 'string', description: '本体类型码', example: 'Place' },
        canonicalEntityId: {
          type: 'string',
          description: '规范 ID（可选，不传则后端生成）',
          example: 'place:tokyo_station',
        },
        domain: { type: 'string', description: '领域', example: 'Place' },
        country: { type: 'string', description: '国家码', example: 'JP' },
        linkedPoiId: {
          type: 'string',
          description: '关联 CPRE POI（如 is.reynisfjara）',
          example: 'is.reynisfjara',
        },
        linkedEntityIds: {
          type: 'array',
          items: { type: 'string' },
          description: '关联其它已有规范实体',
        },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: '别名',
          example: ['東京駅', 'Tokyo Sta.'],
        },
        description: { type: 'string', description: '描述', example: '中央车站' },
        status: { type: 'string', description: '状态 enabled/draft', example: 'enabled' },
        properties: { type: 'object', description: '扩展属性' },
      },
    },
  })
  createEntity(
    @Body()
    body: {
      name?: string;
      type?: string;
      canonicalEntityId?: string;
      domain?: string;
      country?: string;
      linkedPoiId?: string;
      linkedEntityIds?: string[];
      aliases?: string[];
      description?: string;
      status?: string;
      properties?: Record<string, unknown>;
    },
  ) {
    const result = this.registry.createCanonical({
      name: body?.name ?? '',
      type: body?.type ?? '',
      canonicalEntityId: body?.canonicalEntityId,
      domain: body?.domain,
      country: body?.country,
      linkedPoiId: body?.linkedPoiId,
      linkedEntityIds: body?.linkedEntityIds,
      aliases: body?.aliases,
      description: body?.description,
      status: body?.status,
      properties: body?.properties,
    });
    if (result.ok === false) {
      return errorResponse(ErrorCode[result.code], result.message, result.details);
    }
    return successResponse(toEntityAdminView(result.entity));
  }

  @Patch('entities/:canonicalEntityId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update canonical Identity entity（部分更新）',
    description:
      '按 canonicalEntityId 更新展示名/类型/国家/别名/状态/关联等；不可改 ID。origin 记为 ADMIN 并持久化。不存在返回 NOT_FOUND。',
  })
  @ApiParam({ name: 'canonicalEntityId', description: '规范实体ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '展示名' },
        type: { type: 'string', description: '本体类型码' },
        domain: { type: 'string', description: '领域' },
        country: { type: 'string', description: '国家码' },
        linkedPoiId: { type: 'string', description: '关联 CPRE POI' },
        linkedEntityIds: {
          type: 'array',
          items: { type: 'string' },
          description: '关联其它规范实体（替换）',
        },
        aliases: { type: 'array', items: { type: 'string' }, description: '别名（替换）' },
        description: { type: 'string', description: '描述' },
        status: { type: 'string', description: 'enabled / draft' },
        properties: { type: 'object', description: '扩展属性（浅合并）' },
      },
    },
  })
  updateEntity(
    @Param('canonicalEntityId') canonicalEntityId: string,
    @Body()
    body: {
      name?: string;
      type?: string;
      domain?: string;
      country?: string;
      linkedPoiId?: string;
      linkedEntityIds?: string[];
      aliases?: string[];
      description?: string;
      status?: string;
      properties?: Record<string, unknown>;
    },
  ) {
    const result = this.registry.updateCanonical(canonicalEntityId, body ?? {});
    if (result.ok === false) {
      return errorResponse(ErrorCode[result.code], result.message, result.details);
    }
    return successResponse(toEntityAdminView(result.entity));
  }

  @Get('entities/:canonicalEntityId/relations')
  @ApiOperation({ summary: 'Relations for an entity (Phase 3)' })
  entityRelations(@Param('canonicalEntityId') canonicalEntityId: string) {
    const id = decodeURIComponent(canonicalEntityId);
    return successResponse({
      entityId: id,
      items: this.relations.listForEntity(id),
    });
  }

  @Get('entities/:canonicalEntityId')
  @ApiOperation({ summary: 'Entity detail' })
  @ApiParam({ name: 'canonicalEntityId' })
  getEntity(@Param('canonicalEntityId') canonicalEntityId: string) {
    // Express may not decode encoded colons the same way; accept raw
    const id = decodeURIComponent(canonicalEntityId);
    const entity = this.registry.get(id);
    if (!entity) {
      throw new NotFoundException(`Entity not found: ${id}`);
    }
    const rels = this.relations.listForEntity(id);
    const factsCount = this.worldState.listFacts({
      entityId: id,
      page: 1,
      pageSize: 1,
    }).total;
    const rulesCount = countKnowledgeRulesForEntity(id, [
      entity.displayName ?? '',
      ...(entity.aliases ?? []),
    ]);
    return successResponse({
      ...entity,
      relationsCount: rels.length,
      factsCount,
      rulesCount,
    });
  }

  @Post('entities/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Identity resolve debug (sourceRef or alias → canonical)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        system: { type: 'string', example: 'poi' },
        sourceId: { type: 'string', example: 'is.reynisfjara' },
        alias: { type: 'string', example: 'Reynisfjara' },
      },
    },
  })
  resolve(
    @Body()
    body: {
      system?: string;
      sourceId?: string;
      alias?: string;
    },
  ) {
    if (!body?.alias && !(body?.system && body?.sourceId) && !body?.sourceId) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'Provide alias, or system+sourceId, or sourceId');
    }
    const result = this.registry.resolve(body);
    this.logger.debug(
      `resolve system=${body.system} sourceId=${body.sourceId} alias=${body.alias} → ${result.canonicalEntityId} (${result.matchType})`,
    );
    return successResponse(result);
  }

  @Post('entities/check-subjects')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch-check WorldFact subjectIds for canonical coverage' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        subjects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subjectId: { type: 'string' },
              subjectType: { type: 'string' },
            },
          },
        },
      },
    },
  })
  checkSubjects(@Body() body: { subjects?: Array<{ subjectId: string; subjectType?: string }> }) {
    const subjects = body?.subjects ?? [];
    if (!Array.isArray(subjects) || subjects.length === 0) {
      return errorResponse(ErrorCode.BAD_REQUEST, 'subjects[] required');
    }
    return successResponse(this.registry.checkSubjects(subjects.slice(0, 500)));
  }
}
