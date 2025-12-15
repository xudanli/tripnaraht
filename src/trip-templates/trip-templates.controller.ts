// src/trip-templates/trip-templates.controller.ts
import { Controller, Get, Post, Param, Query, Body, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TripTemplatesService } from './trip-templates.service';
import { GetTripTemplatesQueryDto, TripTemplateResponseDto, CreateTripFromTemplateDto } from './dto/trip-template.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('trip-templates')
@Controller('trip-templates')
export class TripTemplatesController {
  constructor(private readonly tripTemplatesService: TripTemplatesService) {}

  @Get()
  @ApiOperation({
    summary: '获取行程模板列表',
    description: '获取不同主题的行程模板（如亲子游、特种兵旅游、休闲度假）。支持按主题、目的地筛选。',
  })
  @ApiQuery({ name: 'theme', required: false, enum: ['FAMILY', 'BACKPACKER', 'LEISURE', 'BUSINESS', 'HONEYMOON', 'ADVENTURE'] })
  @ApiQuery({ name: 'destination', required: false, example: 'JP' })
  @ApiQuery({ name: 'isPublic', required: false, type: Boolean, default: true })
  @ApiResponse({
    status: 200,
    description: '成功返回模板列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@Query() query: GetTripTemplatesQueryDto) {
    try {
      const templates = await this.tripTemplatesService.findAll(query);
      return successResponse(templates);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: '获取行程模板详情',
    description: '根据模板ID获取模板的完整信息，包括配置详情。',
  })
  @ApiParam({ name: 'id', description: '模板ID (UUID)', example: 'uuid' })
  @ApiResponse({
    status: 200,
    description: '成功返回模板详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '模板不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(@Param('id') id: string) {
    try {
      const template = await this.tripTemplatesService.findOne(id);
      return successResponse(template);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

@ApiTags('trips')
@Controller('trips')
export class TripsFromTemplateController {
  constructor(private readonly tripTemplatesService: TripTemplatesService) {}

  @Post('from-template')
  @ApiOperation({
    summary: '基于模板快速创建行程',
    description: '根据模板ID和用户提供的参数（目的地、日期、预算等）快速创建行程。模板的配置会自动应用到新行程中。',
  })
  @ApiResponse({
    status: 200,
    description: '成功创建行程（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async createFromTemplate(@Body() dto: CreateTripFromTemplateDto) {
    try {
      const trip = await this.tripTemplatesService.createTripFromTemplate(dto);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
    }
  }
}
