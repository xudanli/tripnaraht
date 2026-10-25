import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { KnowledgeOntologyService } from '../ontology/knowledge-ontology.service';

@ApiTags('knowledge-control-center')
@Controller('admin/knowledge/ontology')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class KnowledgeOntologyAdminController {
  constructor(private readonly ontology: KnowledgeOntologyService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Ontology overview — domain cards / stats / recent updates',
  })
  overview() {
    return successResponse(this.ontology.overview());
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '将本体投影写入 knowledge_ontology_* 表并刷新内存目录',
    description: '属性管理列表读表；DB 不可用时回退投影。不覆盖 origin=ADMIN 行。',
  })
  async syncCatalog() {
    return successResponse(await this.ontology.refreshFromDbOrProjection('admin_sync'));
  }

  @Get('types')
  @ApiOperation({ summary: 'Ontology type vocabulary' })
  @ApiQuery({ name: 'domain', required: false })
  @ApiQuery({ name: 'kind', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({
    name: 'includeAttributes',
    required: false,
    description: '默认 true：列表项内嵌 attributes + relatedPredicates',
  })
  listTypes(
    @Query('domain') domain?: string,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('includeAttributes') includeAttributes?: string,
  ) {
    return successResponse(
      this.ontology.listTypes({
        domain,
        kind,
        q,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
        includeAttributes:
          includeAttributes === undefined
            ? true
            : !['0', 'false', 'no'].includes(includeAttributes.toLowerCase()),
      }),
    );
  }

  @Get('types/:id')
  @ApiOperation({ summary: 'Ontology type detail + attributes' })
  @ApiParam({ name: 'id' })
  getType(@Param('id') id: string) {
    return successResponse(this.ontology.getType(id));
  }

  @Get('attributes')
  @ApiOperation({
    summary: 'Ontology attribute management list（与 Identity「填写属性」同源）',
    description:
      '表单须调本接口：ownerTypeId=实体 type、limit=200。默认 status=enabled。domain 大小写不敏感。勿另用 types/:id.attributes 作第二数据源。',
  })
  @ApiQuery({ name: 'domain', required: false, description: '领域；大小写不敏感，亦可传类型码' })
  @ApiQuery({ name: 'ownerTypeId', required: false, description: '所属类型=实体 type，如 Place' })
  @ApiQuery({ name: 'valueKind', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    description: '默认 enabled；all|enabled|draft|deprecated',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '同 pageSize；表单侧常用 200' })
  listAttributes(
    @Query('domain') domain?: string,
    @Query('ownerTypeId') ownerTypeId?: string,
    @Query('valueKind') valueKind?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
  ) {
    return successResponse(
      this.ontology.listAttributes({
        domain,
        ownerTypeId,
        valueKind,
        q,
        status,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('attributes/:id')
  @ApiOperation({ summary: 'Ontology attribute detail' })
  @ApiParam({ name: 'id', description: 'attributeId e.g. RouteSegment.currentRoadStatus' })
  getAttribute(@Param('id') id: string) {
    return successResponse(this.ontology.getAttribute(id));
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export ontology catalog JSON' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['full', 'types', 'attributes'] },
        note: { type: 'string' },
      },
    },
  })
  export(
    @Body() body?: { scope?: 'full' | 'types' | 'attributes'; note?: string },
  ) {
    return successResponse(this.ontology.exportCatalog(body));
  }

  @Get('export/history')
  @ApiOperation({ summary: 'Ontology export history' })
  @ApiQuery({ name: 'limit', required: false })
  exportHistory(@Query('limit') limit?: string) {
    return successResponse(
      this.ontology.exportHistory(limit ? Number(limit) : 20),
    );
  }

  @Get('export/:exportId')
  @ApiOperation({ summary: 'Fetch a past ontology export payload' })
  @ApiParam({ name: 'exportId' })
  getExport(@Param('exportId') exportId: string) {
    return successResponse(this.ontology.getExport(exportId));
  }

  @Get('validate')
  @ApiOperation({ summary: 'Ontology catalog validation summary' })
  validate() {
    return successResponse(this.ontology.validate());
  }
}
