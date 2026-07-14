import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductOfferingStatus, TravelProductType } from '@prisma/client';
import { Public } from '../../auth/decorators/public.decorator';
import {
  errorResponse,
  ErrorCode,
  successResponse,
} from '../../common/dto/standard-response.dto';
import {
  CreateExperienceDefinitionDto,
  CreateOperatorDto,
  CreateProductOfferingDto,
  CreateProductSessionDto,
  CreateRatePlanDto,
  ListOfferingsQueryDto,
  ListSessionsQueryDto,
  ReplacePlaceExperienceLinksDto,
  ReplaceProductPlaceLinksDto,
  UpdateExperienceDefinitionDto,
  UpdateOperatorDto,
  UpdateProductOfferingDto,
  UpdateProductSessionDto,
  UpdateRatePlanDto,
} from '../dto/travel-product-catalog.dto';
import { TravelProductCatalogService } from '../services/travel-product-catalog.service';

@ApiTags('Admin - Travel Product Catalog')
@Public()
@Controller('admin/travel-product-catalog')
export class AdminTravelProductCatalogController {
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
        if (status === 400) {
          return errorResponse(
            ErrorCode.BAD_REQUEST,
            message,
            typeof body === 'object' ? (body as Record<string, unknown>) : undefined,
          );
        }
      }
      throw e;
    }
  }

  @Get('taxonomy')
  @ApiOperation({ summary: '产品三级分类字典（只读）' })
  getTaxonomy() {
    return successResponse(this.catalog.getTaxonomy());
  }

  // —— Place ↔ Experience（规划层） ——
  @Get('places/:placeId/experiences')
  @ApiOperation({ summary: '地点挂靠的体验项目（含停用）' })
  listPlaceExperiences(@Param('placeId', ParseIntPipe) placeId: number) {
    return this.wrap(() =>
      this.catalog.listExperiencesAtPlace(placeId, { includeInactive: true }),
    );
  }

  @Put('places/:placeId/experiences')
  @ApiOperation({ summary: '全量替换地点体验挂靠（后台维护「此地可做什么」）' })
  replacePlaceExperiences(
    @Param('placeId', ParseIntPipe) placeId: number,
    @Body() dto: ReplacePlaceExperienceLinksDto,
  ) {
    return this.wrap(() => this.catalog.replacePlaceExperienceLinks(placeId, dto));
  }

  // —— Experiences ——
  @Get('experiences')
  @ApiOperation({ summary: '体验定义列表' })
  @ApiQuery({ name: 'countryCode', required: false })
  @ApiQuery({ name: 'productType', required: false, enum: TravelProductType })
  @ApiQuery({ name: 'q', required: false })
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
  @ApiOperation({ summary: '按 code 取体验定义' })
  getExperienceByCode(@Param('code') code: string) {
    return this.wrap(() => this.catalog.getExperienceByCode(code));
  }

  @Get('experiences/:id')
  @ApiOperation({ summary: '体验定义详情' })
  getExperience(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getExperience(id));
  }

  @Post('experiences')
  @ApiOperation({ summary: '创建体验定义' })
  createExperience(@Body() dto: CreateExperienceDefinitionDto) {
    return this.wrap(() => this.catalog.createExperience(dto));
  }

  @Patch('experiences/:id')
  @ApiOperation({ summary: '更新体验定义' })
  updateExperience(@Param('id') id: string, @Body() dto: UpdateExperienceDefinitionDto) {
    return this.wrap(() => this.catalog.updateExperience(id, dto));
  }

  // —— Operators ——
  @Get('operators')
  @ApiOperation({ summary: '供应商列表' })
  listOperators(
    @Query('countryCode') countryCode?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wrap(() =>
      this.catalog.listOperators({
        countryCode,
        q,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('operators/:id')
  getOperator(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getOperator(id));
  }

  @Post('operators')
  createOperator(@Body() dto: CreateOperatorDto) {
    return this.wrap(() => this.catalog.createOperator(dto));
  }

  @Patch('operators/:id')
  updateOperator(@Param('id') id: string, @Body() dto: UpdateOperatorDto) {
    return this.wrap(() => this.catalog.updateOperator(id, dto));
  }

  // —— Offerings ——
  @Get('offerings')
  @ApiOperation({ summary: '产品列表（含 DRAFT）' })
  listOfferings(@Query() query: ListOfferingsQueryDto) {
    return this.wrap(() => this.catalog.listOfferings(query));
  }

  @Get('offerings/:id')
  getOffering(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getOffering(id));
  }

  @Post('offerings')
  createOffering(@Body() dto: CreateProductOfferingDto) {
    return this.wrap(() => this.catalog.createOffering(dto));
  }

  @Patch('offerings/:id')
  updateOffering(@Param('id') id: string, @Body() dto: UpdateProductOfferingDto) {
    return this.wrap(() => this.catalog.updateOffering(id, dto));
  }

  @Post('offerings/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布产品' })
  publishOffering(@Param('id') id: string) {
    return this.wrap(() =>
      this.catalog.setOfferingStatus(id, ProductOfferingStatus.PUBLISHED),
    );
  }

  @Post('offerings/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停售产品' })
  suspendOffering(@Param('id') id: string) {
    return this.wrap(() =>
      this.catalog.setOfferingStatus(id, ProductOfferingStatus.SUSPENDED),
    );
  }

  @Put('offerings/:id/place-links')
  @ApiOperation({ summary: '全量替换产品空间挂靠' })
  replacePlaceLinks(@Param('id') id: string, @Body() dto: ReplaceProductPlaceLinksDto) {
    return this.wrap(() => this.catalog.replacePlaceLinks(id, dto));
  }

  // —— Sessions ——
  @Get('offerings/:id/sessions')
  @ApiOperation({ summary: '班次列表' })
  listSessions(@Param('id') id: string, @Query() query: ListSessionsQueryDto) {
    return this.wrap(() => this.catalog.listSessions(id, query));
  }

  @Post('offerings/:id/sessions')
  createSession(@Param('id') id: string, @Body() dto: CreateProductSessionDto) {
    return this.wrap(() => this.catalog.createSession(id, dto));
  }

  @Get('sessions/:id')
  @ApiParam({ name: 'id', description: 'session id' })
  getSession(@Param('id') id: string) {
    return this.wrap(() => this.catalog.getSession(id));
  }

  @Patch('sessions/:id')
  updateSession(@Param('id') id: string, @Body() dto: UpdateProductSessionDto) {
    return this.wrap(() => this.catalog.updateSession(id, dto));
  }

  // —— Rates ——
  @Get('offerings/:id/rates')
  listRates(@Param('id') id: string) {
    return this.wrap(() => this.catalog.listRates(id));
  }

  @Post('offerings/:id/rates')
  createRate(@Param('id') id: string, @Body() dto: CreateRatePlanDto) {
    return this.wrap(() => this.catalog.createRate(id, dto));
  }

  @Patch('rates/:id')
  updateRate(@Param('id') id: string, @Body() dto: UpdateRatePlanDto) {
    return this.wrap(() => this.catalog.updateRate(id, dto));
  }
}
