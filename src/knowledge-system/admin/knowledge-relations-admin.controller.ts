import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { successResponse } from '../../common/dto/standard-response.dto';
import type { KnowledgeRelationType } from '../contracts/knowledge-relation.types';
import { KnowledgeRelationRegistryService } from '../relations/knowledge-relation-registry.service';

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
export class KnowledgeRelationsAdminController {
  constructor(private readonly relations: KnowledgeRelationRegistryService) {}

  @Get('relations')
  @ApiOperation({ summary: 'List projected KnowledgeRelations' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: KnowledgeRelationType,
    @Query('source') source?: string,
    @Query('country') country?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return successResponse(
      this.relations.list({
        from,
        to,
        type,
        source,
        country,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
      }),
    );
  }

  @Get('relations/projections')
  @ApiOperation({ summary: 'Adapter projection map (original → V1 vocab)' })
  listProjections() {
    return successResponse({ items: this.relations.listProjections() });
  }

  @Get('relations/:relationId')
  @ApiOperation({ summary: 'Relation detail' })
  @ApiParam({ name: 'relationId' })
  getOne(@Param('relationId') relationId: string) {
    return successResponse(this.relations.get(decodeURIComponent(relationId)));
  }

  @Get('vocabulary/relations')
  @ApiOperation({ summary: 'V1 Relation Vocabulary + counts' })
  vocabulary() {
    return successResponse({ items: this.relations.vocabulary() });
  }

  @Post('relations/reproject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-run adapters and persist projected relations to DB' })
  @ApiQuery({ name: 'spatialLimit', required: false })
  async reproject(@Query('spatialLimit') spatialLimit?: string) {
    return successResponse(
      await this.relations.reprojectAll({
        spatialLimit: spatialLimit ? Number(spatialLimit) : undefined,
      }),
    );
  }

  @Post('relations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a manual KnowledgeRelation (persisted, survives reproject)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['from', 'to', 'type'],
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        type: { type: 'string' },
        confidence: { type: 'number' },
        country: { type: 'string' },
        metadata: { type: 'object' },
        condition: { type: 'object' },
      },
    },
  })
  async create(
    @Body()
    body: {
      from: string;
      to: string;
      type: KnowledgeRelationType;
      confidence?: number;
      country?: string;
      metadata?: Record<string, unknown>;
      condition?: Record<string, unknown>;
    },
  ) {
    return successResponse(await this.relations.createManual(body));
  }

  @Patch('relations/:relationId')
  @ApiOperation({ summary: 'Patch a manual relation' })
  @ApiParam({ name: 'relationId' })
  async update(
    @Param('relationId') relationId: string,
    @Body()
    body: {
      type?: KnowledgeRelationType;
      confidence?: number;
      country?: string;
      metadata?: Record<string, unknown>;
      condition?: Record<string, unknown>;
    },
  ) {
    return successResponse(
      await this.relations.updateManual(decodeURIComponent(relationId), body ?? {}),
    );
  }

  @Delete('relations/:relationId')
  @ApiOperation({ summary: 'Delete a relation (projected rows return on next reproject)' })
  @ApiParam({ name: 'relationId' })
  async remove(@Param('relationId') relationId: string) {
    return successResponse(await this.relations.remove(decodeURIComponent(relationId)));
  }
}
