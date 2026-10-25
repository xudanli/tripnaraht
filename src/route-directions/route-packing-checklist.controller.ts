import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../common/dto/standard-response.dto';
import { CreateRoutePackingChecklistDto } from './dto/create-route-packing-checklist.dto';
import { UpdateRoutePackingChecklistDto } from './dto/update-route-packing-checklist.dto';
import { QueryRoutePackingChecklistDto } from './dto/query-route-packing-checklist.dto';
import { RoutePackingChecklistService } from './services/route-packing-checklist.service';

function parseBooleanQueryParam(value?: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

@ApiTags('RoutePackingChecklists')
@Controller('route-directions/packing-checklists')
export class RoutePackingChecklistController {
  private readonly logger = new Logger(RoutePackingChecklistController.name);

  constructor(
    private readonly packingChecklistService: RoutePackingChecklistService,
  ) {}

  private handleError(error: unknown, fallbackMessage: string) {
    if (error instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, error.message, {
        statusCode: 404,
      });
    }
    if (error instanceof BadRequestException) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, error.message, {
        statusCode: 400,
      });
    }
    if (error instanceof ConflictException) {
      return errorResponse(ErrorCode.CONFLICT, error.message, {
        statusCode: 409,
      });
    }
    this.logger.error(fallbackMessage, error);
    return errorResponse(ErrorCode.INTERNAL_ERROR, fallbackMessage, {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: '查询路线打包清单列表',
    description: '支持按 routeTemplateId / countryCode / isActive 筛选与分页',
  })
  @ApiQuery({ name: 'routeTemplateId', required: false, type: Number })
  @ApiQuery({ name: 'countryCode', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: '成功返回列表' })
  async list(
    @Query() query: QueryRoutePackingChecklistDto,
    @Query('isActive') rawIsActive?: string,
  ) {
    try {
      const result = await this.packingChecklistService.findMany({
        routeTemplateId: query.routeTemplateId,
        countryCode: query.countryCode,
        isActive: parseBooleanQueryParam(rawIsActive) ?? query.isActive,
        page: query.page,
        limit: query.limit,
      });
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to list packing checklists');
    }
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '获取路线打包清单详情' })
  @ApiParam({ name: 'id', description: '打包清单 UUID' })
  @ApiResponse({ status: 200, description: '成功返回详情' })
  @ApiResponse({ status: 404, description: '不存在' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const result = await this.packingChecklistService.findById(id);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to get packing checklist');
    }
  }

  @Public()
  @Post()
  @ApiOperation({
    summary: '创建路线打包清单',
    description: 'routeTemplateId 必填且唯一；templateData 缺必填字段返回 400',
  })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 400, description: '校验失败' })
  @ApiResponse({ status: 409, description: '模板已绑定清单' })
  async create(@Body() dto: CreateRoutePackingChecklistDto) {
    try {
      const result = await this.packingChecklistService.create(dto);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to create packing checklist');
    }
  }

  @Public()
  @Put(':id')
  @ApiOperation({ summary: '局部更新路线打包清单' })
  @ApiParam({ name: 'id', description: '打包清单 UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutePackingChecklistDto,
  ) {
    try {
      const result = await this.packingChecklistService.update(id, dto);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to update packing checklist');
    }
  }

  @Public()
  @Delete(':id')
  @ApiOperation({
    summary: '删除路线打包清单',
    description: '默认软删（isActive=false）；?hard=true 物理删除',
  })
  @ApiParam({ name: 'id', description: '打包清单 UUID' })
  @ApiQuery({ name: 'hard', required: false, type: Boolean })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('hard') hard?: string,
  ) {
    try {
      const result = await this.packingChecklistService.remove(id, {
        hard: parseBooleanQueryParam(hard) === true,
      });
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to delete packing checklist');
    }
  }
}
