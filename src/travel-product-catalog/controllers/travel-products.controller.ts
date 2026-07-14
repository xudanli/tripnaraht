import { Controller, Get, HttpException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TravelProductType } from '@prisma/client';
import { Public } from '../../auth/decorators/public.decorator';
import {
  errorResponse,
  ErrorCode,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ListOfferingsQueryDto, ListSessionsQueryDto } from '../dto/travel-product-catalog.dto';
import { TravelProductCatalogService } from '../services/travel-product-catalog.service';

/**
 * C 端只读 Travel Product Catalog — 体验优先；Offering 仅 PUBLISHED
 */
@ApiTags('travel-products')
@Public()
@Controller('travel-products')
export class TravelProductsController {
  constructor(private readonly catalog: TravelProductCatalogService) {}

  private async wrap<T>(fn: () => Promise<T>) {
    try {
      return successResponse(await fn());
    } catch (e: unknown) {
      if (e instanceof HttpException) {
        const status = e.getStatus();
        const body = e.getResponse();
        const message =
          typeof body === 'string'
            ? body
            : typeof body === 'object' && body && 'message' in body
              ? String((body as { message: unknown }).message)
              : e.message;
        if (status === 404) return errorResponse(ErrorCode.NOT_FOUND, message);
        if (status === 400) return errorResponse(ErrorCode.BAD_REQUEST, message);
      }
      throw e;
    }
  }

  @Get('taxonomy')
  @ApiOperation({ summary: '产品分类字典（C 端）' })
  getTaxonomy() {
    return successResponse(this.catalog.getTaxonomy());
  }

  @Get('places/:placeId/experiences')
  @ApiOperation({
    summary: '地点可用体验项目（规划层，无供应商）— 添加活动主入口',
  })
  @ApiParam({ name: 'placeId', example: 381041 })
  listExperiencesAtPlace(@Param('placeId', ParseIntPipe) placeId: number) {
    return this.wrap(() => this.catalog.listExperiencesAtPlace(placeId));
  }

  @Get('experiences')
  @ApiOperation({
    summary:
      '体验定义列表（可按国家/类型扫全表；地点场景优先用 places/:id/experiences）',
  })
  @ApiQuery({ name: 'countryCode', required: false, example: 'IS' })
  @ApiQuery({ name: 'productType', required: false, enum: TravelProductType })
  listExperiences(
    @Query('countryCode') countryCode?: string,
    @Query('productType') productType?: TravelProductType,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wrap(() =>
      this.catalog.listExperiences({
        countryCode,
        productType,
        q,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('experiences/by-code/:code')
  getExperienceByCode(@Param('code') code: string) {
    return this.wrap(() => this.catalog.getExperienceByCode(code));
  }

  @Get('experiences/:id')
  @ApiOperation({ summary: '体验定义详情' })
  getExperience(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getExperience(id));
  }

  @Get('offerings')
  @ApiOperation({
    summary:
      '已发布产品列表；可选 experienceDefinitionId / placeId（体验选定后再升格供应商 SKU）',
  })
  listOfferings(@Query() query: ListOfferingsQueryDto) {
    return this.wrap(() => this.catalog.listOfferings(query, { publishedOnly: true }));
  }

  @Get('offerings/:id')
  @ApiOperation({ summary: '已发布产品详情（含 placeLinks / 默认 rates）' })
  getOffering(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getOffering(id, { publishedOnly: true }));
  }

  @Get('offerings/:id/sessions')
  @ApiOperation({ summary: '已发布产品的班次（可按 date/from/to 过滤）' })
  listSessions(@Param('id') id: string, @Query() query: ListSessionsQueryDto) {
    return this.wrap(async () => {
      await this.catalog.getOffering(id, { publishedOnly: true });
      return this.catalog.listSessions(id, query);
    });
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: '班次详情（须归属已发布产品）' })
  getSession(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getSession(id, { publishedOnly: true }));
  }
}
