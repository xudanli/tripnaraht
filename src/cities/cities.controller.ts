// src/cities/cities.controller.ts

import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CitiesService } from './cities.service';
import { GetCitiesQueryDto } from './dto/city.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('cities')
@Controller('cities')
export class CitiesController {
  private readonly logger = new Logger(CitiesController.name);

  constructor(private readonly citiesService: CitiesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '获取城市列表',
    description: '支持按国家代码过滤和关键词搜索。可以同时使用 countryCode 和 q 参数进行组合查询。',
  })
  @ApiQuery({
    name: 'countryCode',
    required: false,
    description: '国家代码（ISO 3166-1 alpha-2），例如：JP',
    example: 'JP',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: '搜索关键词（支持中文名、英文名、名称），例如：东京',
    example: '东京',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '返回数量限制',
    example: 50,
    type: Number,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: '偏移量（用于分页）',
    example: 0,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回城市列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@Query() query: GetCitiesQueryDto): Promise<any> {
    try {
      this.logger.debug(`[CitiesController] 收到城市查询请求: ${JSON.stringify(query)}`);
      
      const result = await this.citiesService.findAll(query);
      
      this.logger.debug(`[CitiesController] ✅ 返回城市列表: ${result.cities.length} 个城市 (total=${result.total}, hasMore=${result.hasMore})`);
      
      return successResponse({
        cities: result.cities,
        total: result.total,
        hasMore: result.hasMore,
        limit: result.limit,
        offset: result.offset,
        ...(query.countryCode && {
          countryCode: query.countryCode.toUpperCase(),
        }),
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get cities: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: '获取城市详情',
    description: '根据城市 ID 获取完整的城市信息，包括坐标、时区等',
  })
  @ApiParam({
    name: 'id',
    description: '城市 ID',
    example: 1,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回城市详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '城市不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    try {
      const city = await this.citiesService.findOne(id);
      return successResponse(city);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to get city ${id}: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }
}
