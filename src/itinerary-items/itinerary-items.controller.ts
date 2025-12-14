// src/itinerary-items/itinerary-items.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ItineraryItemsService } from './itinerary-items.service';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('itinerary-items')
@Controller('itinerary-items')
export class ItineraryItemsController {
  constructor(private readonly itineraryItemsService: ItineraryItemsService) {}

  @Post()
  @ApiOperation({ 
    summary: '创建行程项',
    description: '在指定日期添加行程项（活动、用餐、休息、交通等）。系统会自动校验营业时间和时间逻辑。'
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项创建成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '校验失败：时间冲突或逻辑错误（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '找不到指定的 TripDay 或 Place（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async create(@Body() createItineraryItemDto: CreateItineraryItemDto) {
    try {
      const item = await this.itineraryItemsService.create(createItineraryItemDto);
      return successResponse(item);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ 
    summary: '获取所有行程项',
    description: '返回所有行程项列表，按开始时间排序'
  })
  @ApiQuery({ 
    name: 'tripDayId', 
    required: false, 
    description: '可选：筛选指定 TripDay 的行程项',
    type: String 
  })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程项列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@Query('tripDayId') tripDayId?: string) {
    const items = tripDayId
      ? await this.itineraryItemsService.findByTripDay(tripDayId)
      : await this.itineraryItemsService.findAll();
    return successResponse(items);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: '获取单个行程项详情',
    description: '根据 ID 获取完整的行程项信息，包括关联的 Place 和 TripDay'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程项详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(@Param('id') id: string) {
    try {
      const item = await this.itineraryItemsService.findOne(id);
      return successResponse(item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: '更新行程项',
    description: '更新行程项信息。如果更新了时间，系统会重新校验营业时间。'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)' })
  @ApiResponse({ 
    status: 200, 
    description: '更新成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '校验失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async update(@Param('id') id: string, @Body() updateItineraryItemDto: UpdateItineraryItemDto) {
    try {
      const item = await this.itineraryItemsService.update(id, updateItineraryItemDto);
      return successResponse(item);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: '删除行程项',
    description: '删除指定的行程项'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)' })
  @ApiResponse({ 
    status: 200, 
    description: '删除成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async remove(@Param('id') id: string) {
    try {
      await this.itineraryItemsService.remove(id);
      return successResponse({ message: '删除成功' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }
}
