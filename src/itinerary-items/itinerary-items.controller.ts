// src/itinerary-items/itinerary-items.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ItineraryItemsService } from './itinerary-items.service';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';

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
    status: 201, 
    description: '行程项创建成功',
    schema: {
      example: {
        id: 'uuid-xxxx',
        tripDayId: 'day-uuid',
        placeId: 1,
        type: 'ACTIVITY',
        startTime: '2024-05-01T10:00:00.000Z',
        endTime: '2024-05-01T12:00:00.000Z',
        note: '记得穿和服拍照',
        place: {
          id: 1,
          name: '浅草寺',
          // ...
        }
      }
    }
  })
  @ApiResponse({ 
    status: 400, 
    description: '校验失败：时间冲突或逻辑错误' 
  })
  @ApiResponse({ 
    status: 404, 
    description: '找不到指定的 TripDay 或 Place' 
  })
  create(@Body() createItineraryItemDto: CreateItineraryItemDto) {
    return this.itineraryItemsService.create(createItineraryItemDto);
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
  @ApiResponse({ status: 200, description: '成功返回行程项列表' })
  findAll(@Query('tripDayId') tripDayId?: string) {
    if (tripDayId) {
      return this.itineraryItemsService.findByTripDay(tripDayId);
    }
    return this.itineraryItemsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ 
    summary: '获取单个行程项详情',
    description: '根据 ID 获取完整的行程项信息，包括关联的 Place 和 TripDay'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({ status: 200, description: '成功返回行程项详情' })
  @ApiResponse({ status: 404, description: '行程项不存在' })
  findOne(@Param('id') id: string) {
    return this.itineraryItemsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ 
    summary: '更新行程项',
    description: '更新行程项信息。如果更新了时间，系统会重新校验营业时间。'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 400, description: '校验失败' })
  @ApiResponse({ status: 404, description: '行程项不存在' })
  update(@Param('id') id: string, @Body() updateItineraryItemDto: UpdateItineraryItemDto) {
    return this.itineraryItemsService.update(id, updateItineraryItemDto);
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: '删除行程项',
    description: '删除指定的行程项'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '行程项不存在' })
  remove(@Param('id') id: string) {
    return this.itineraryItemsService.remove(id);
  }
}
