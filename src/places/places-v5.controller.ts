// src/places/places-v5.controller.ts
// V5 版本的地点 Controller，支持 /api/v5/places/* 路径
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('places-v5')
@Controller('v5/places')
export class PlacesV5Controller {
  constructor(private readonly placesService: PlacesService) {}

  @Get('list')
  @Public()
  @ApiOperation({
    summary: '获取地点列表 V5（支持分页和上下切换）',
    description: 'V5 版本的地点列表接口，支持分页、按类别和城市筛选，支持上下切换。路径：/api/v5/places/list',
  })
  @ApiQuery({ name: 'page', description: '页码（从 1 开始）', example: 1, type: Number, required: false })
  @ApiQuery({ name: 'limit', description: '每页数量（默认 20，最大 100）', example: 20, type: Number, required: false })
  @ApiQuery({
    name: 'category',
    description: '地点类型筛选',
    enum: ['RESTAURANT', 'ATTRACTION', 'SHOPPING', 'HOTEL'],
    required: false,
  })
  @ApiQuery({ name: 'cityId', description: '城市ID筛选', example: 1, type: Number, required: false })
  @ApiQuery({
    name: 'orderBy',
    description: '排序字段',
    enum: ['id', 'rating', 'createdAt', 'updatedAt'],
    example: 'id',
    required: false,
  })
  @ApiQuery({
    name: 'orderDirection',
    description: '排序方向',
    enum: ['asc', 'desc'],
    example: 'desc',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回地点列表（包含分页信息）',
    type: ApiSuccessResponseDto,
  })
  async getPlacesList(@Query() query: PlaceListQueryDto) {
    try {
      const result = await this.placesService.getPlacesList({
        page: query.page,
        limit: query.limit,
        category: query.category,
        cityId: query.cityId,
        orderBy: query.orderBy,
        orderDirection: query.orderDirection,
      });
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, `获取地点列表失败: ${error.message}`);
    }
  }
}
