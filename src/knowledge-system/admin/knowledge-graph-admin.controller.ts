import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../../admin/guards/admin-strict-auth.guard';
import { successResponse } from '../../common/dto/standard-response.dto';
import { KnowledgeGraphService } from '../graph/knowledge-graph.service';

@ApiTags('knowledge-control-center')
@Controller('admin/knowledge/graph')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class KnowledgeGraphAdminController {
  private readonly logger = new Logger(KnowledgeGraphAdminController.name);

  constructor(private readonly graph: KnowledgeGraphService) {}

  @Get('subgraph')
  @ApiOperation({
    summary: '图谱浏览 — subgraph from KnowledgeRelation projections',
    description:
      'Product UI Knowledge Graph browse tab. Not Neo4j. Frontend may also assemble from /relations.',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'relationType', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'focusEntityId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  subgraph(
    @Query('q') q?: string,
    @Query('entityType') entityType?: string,
    @Query('relationType') relationType?: string,
    @Query('country') country?: string,
    @Query('focusEntityId') focusEntityId?: string,
    @Query('limit') limit?: string,
  ) {
    const data = this.graph.subgraph({
      q,
      entityType,
      relationType,
      country,
      focusEntityId,
      limit: limit ? Number(limit) : undefined,
    });
    this.logger.debug(
      `subgraph nodes=${data.nodes.length} edges=${data.edges.length} focus=${focusEntityId ?? '-'}`,
    );
    return successResponse(data);
  }

  @Post('path-query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '路径查询 — BFS over projected relations' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['startEntityId', 'endEntityId'],
      properties: {
        startEntityId: { type: 'string' },
        endEntityId: { type: 'string' },
        maxDepth: { type: 'number' },
        pathType: { type: 'string', enum: ['shortest', 'semantic', 'constraint'] },
        country: { type: 'string' },
        allowedRelationTypes: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  pathQuery(
    @Body()
    body: {
      startEntityId: string;
      endEntityId: string;
      maxDepth?: number;
      pathType?: 'shortest' | 'semantic' | 'constraint';
      country?: string;
      allowedRelationTypes?: string[];
    },
  ) {
    return successResponse(
      this.graph.pathQuery({
        startEntityId: body.startEntityId,
        endEntityId: body.endEntityId,
        maxDepth: body.maxDepth,
        pathType: body.pathType,
        country: body.country,
        allowedRelationTypes: body.allowedRelationTypes,
      }),
    );
  }

  @Post('impact-analysis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '影响分析 — neighborhood BFS by impact type' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['sourceEntityIds'],
      properties: {
        sourceEntityIds: { type: 'array', items: { type: 'string' } },
        impactType: {
          type: 'string',
          enum: ['all', 'direct', 'indirect', 'risk', 'alternative'],
        },
        maxDepth: { type: 'number' },
        country: { type: 'string' },
        timeFrom: { type: 'string' },
        timeTo: { type: 'string' },
      },
    },
  })
  impactAnalysis(
    @Body()
    body: {
      sourceEntityIds: string[];
      impactType?: 'all' | 'direct' | 'indirect' | 'risk' | 'alternative';
      maxDepth?: number;
      country?: string;
      timeFrom?: string;
      timeTo?: string;
    },
  ) {
    return successResponse(
      this.graph.impactAnalysis({
        sourceEntityIds: body.sourceEntityIds ?? [],
        impactType: body.impactType,
        maxDepth: body.maxDepth,
        country: body.country,
      }),
    );
  }
}
