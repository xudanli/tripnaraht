import {
  Controller,
  Get,
  Logger,
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
import { AdminStrictAuthGuard } from '../../admin/guards/admin-strict-auth.guard';
import { successResponse } from '../../common/dto/standard-response.dto';
import { KnowledgeSemanticService } from '../semantic/knowledge-semantic.service';
import { SEMANTIC_HARD_BLOCK_POLICY } from '../semantic/vector-hard-block.guard.util';

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
export class KnowledgeSemanticAdminController {
  private readonly logger = new Logger(KnowledgeSemanticAdminController.name);

  constructor(private readonly semantic: KnowledgeSemanticService) {}

  @Get('documents')
  @ApiOperation({
    summary: 'Semantic documents (RAG proxy)',
    description:
      'Thin view over knowledge_files / demo. hardBlockEligible is always false.',
  })
  @ApiQuery({ name: 'countryCode', required: false })
  @ApiQuery({ name: 'collection', required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  async listDocuments(
    @Query('countryCode') countryCode?: string,
    @Query('collection') collection?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const data = await this.semantic.listDocuments({
      countryCode,
      collection,
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    this.logger.debug(`documents total=${data.total} upstream=${data.upstream}`);
    return successResponse(data);
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: 'Semantic document detail' })
  @ApiParam({ name: 'documentId' })
  async getDocument(@Param('documentId') documentId: string) {
    return successResponse({
      document: await this.semantic.getDocument(documentId),
      policy: SEMANTIC_HARD_BLOCK_POLICY,
    });
  }

  @Get('retrieval-traces')
  @ApiOperation({
    summary: 'Recent retrieval traces (explanation-only)',
    description: 'Never used for HARD BLOCK. Prefer existing /api/rag for full retrieve.',
  })
  @ApiQuery({ name: 'limit', required: false })
  listTraces(@Query('limit') limit?: string) {
    return successResponse(
      this.semantic.listRetrievalTraces(limit ? Number(limit) : undefined),
    );
  }
}
