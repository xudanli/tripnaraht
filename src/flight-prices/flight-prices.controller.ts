// src/flight-prices/flight-prices.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { FlightPriceService } from '../trips/services/flight-price.service';
import { FlightPriceDetailService } from '../trips/services/flight-price-detail.service';
import { FlightPriceDetailEnhancedService } from '../trips/services/flight-price-detail-enhanced.service';
import { PricePredictionService } from './services/price-prediction.service';
import { EstimatePriceDto, EstimatePriceResponseDto } from './dto/estimate-price.dto';
import { CreateFlightPriceDto } from './dto/create-flight-price.dto';
import { UpdateFlightPriceDto } from './dto/update-flight-price.dto';
import { FlightPricePredictionDto } from './dto/predict-price.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('flight-prices')
@Controller('flight-prices')
export class FlightPricesController {
  constructor(
    private readonly flightPriceService: FlightPriceService,
    private readonly flightPriceDetailService: FlightPriceDetailService,
    private readonly flightPriceDetailEnhancedService: FlightPriceDetailEnhancedService,
    private readonly pricePredictionService: PricePredictionService
  ) {}

  @Get('estimate')
  @ApiOperation({
    summary: '估算机票+签证成本',
    description:
      '根据目的地国家代码和出发城市（可选）估算机票和签证的总成本。\n' +
      '返回保守估算值（旺季价格）或平均估算值。',
  })
  @ApiQuery({
    name: 'countryCode',
    description: '目的地国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @ApiQuery({
    name: 'originCity',
    description: '出发城市代码（可选），如 "PEK"（北京）、"PVG"（上海）',
    example: 'PEK',
    required: false,
  })
  @ApiQuery({
    name: 'useConservative',
    description: '是否使用保守估算（旺季价格），默认 true',
    example: true,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回估算成本（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async estimatePrice(
    @Query('countryCode') countryCode: string,
    @Query('originCity') originCity?: string,
    @Query('useConservative') useConservative: string = 'true',
  ) {
    try {
      const useConservativeBool = useConservative !== 'false';
      const totalCost = await this.flightPriceService.getEstimatedCost(
        countryCode,
        originCity,
        useConservativeBool,
      );

      const details = await this.flightPriceService.getPriceDetails(
        countryCode,
        originCity,
      );

      let result;
      if (!details) {
        result = {
          totalCost,
          flightPrice: totalCost,
          visaCost: 0,
          useConservative: useConservativeBool,
          countryCode: countryCode.toUpperCase(),
          originCity: originCity?.toUpperCase(),
        };
      } else {
        result = {
          totalCost,
          flightPrice: useConservativeBool
            ? details.flightPrice.highSeason
            : details.flightPrice.average,
          visaCost: details.visaCost,
          useConservative: useConservativeBool,
          countryCode: countryCode.toUpperCase(),
          originCity: originCity?.toUpperCase(),
        };
      }
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get('details')
  @ApiOperation({
    summary: '获取详细价格信息',
    description:
      '返回指定目的地和出发城市的详细价格信息，包括淡季、旺季、平均价格和签证费用。',
  })
  @ApiQuery({
    name: 'countryCode',
    description: '目的地国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @ApiQuery({
    name: 'originCity',
    description: '出发城市代码（可选）',
    example: 'PEK',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回详细价格信息（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '未找到价格参考数据（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getPriceDetails(
    @Query('countryCode') countryCode: string,
    @Query('originCity') originCity?: string,
  ) {
    try {
      const details = await this.flightPriceService.getPriceDetails(
        countryCode,
        originCity,
      );

      if (!details) {
        return errorResponse(
          ErrorCode.NOT_FOUND,
          `未找到 ${countryCode}${originCity ? ` (${originCity})` : ''} 的价格参考数据`,
        );
      }

      return successResponse(details);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({
    summary: '获取所有价格参考数据',
    description: '返回所有已配置的机票价格参考数据列表。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回价格参考数据列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll() {
    const prices = await this.flightPriceService.findAll();
    return successResponse(prices);
  }

  // 特定路由必须放在 :id 之前，避免路由冲突
  @Get('domestic/estimate')
  @ApiOperation({
    summary: '估算国内航线价格（基于历史数据）',
    description:
      '根据2023-2024年历史数据估算国内航线价格。\n\n' +
      '**计算公式：**\n' +
      '预算价格 = 月度基准价 (P_month) × 周内因子 (F_day)\n\n' +
      '**数据来源：**\n' +
      '- 基于2023-2024年中国航空航班历史数据\n' +
      '- 自动计算周内因子（周一至周日的价格波动）\n' +
      '- 自动计算月度基准价（1-12月的季节性波动）',
  })
  @ApiQuery({
    name: 'originCity',
    description: '出发城市',
    example: '成都',
  })
  @ApiQuery({
    name: 'destinationCity',
    description: '到达城市',
    example: '深圳',
  })
  @ApiQuery({
    name: 'month',
    description: '月份（1-12）',
    example: 3,
    type: Number,
  })
  @ApiQuery({
    name: 'dayOfWeek',
    description: '星期几（0=周一, 6=周日，可选）',
    example: 4,
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回估算价格（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async estimateDomesticPrice(
    @Query('originCity') originCity: string,
    @Query('destinationCity') destinationCity: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('dayOfWeek') dayOfWeek?: string
  ) {
    try {
      const dayOfWeekNum = dayOfWeek ? parseInt(dayOfWeek) : undefined;
      
      if (month < 1 || month > 12) {
        throw new BadRequestException('月份必须在 1-12 之间');
      }
      
      if (dayOfWeekNum !== undefined && (dayOfWeekNum < 0 || dayOfWeekNum > 6)) {
        throw new BadRequestException('星期几必须在 0-6 之间（0=周一, 6=周日）');
      }

      const result = await this.flightPriceDetailService.estimateDomesticPrice(
        originCity,
        destinationCity,
        month,
        dayOfWeekNum
      );
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get('domestic/monthly-trend')
  @ApiOperation({
    summary: '获取航线的月度价格趋势',
    description: '返回指定航线在全年12个月的价格趋势数据。',
  })
  @ApiQuery({
    name: 'originCity',
    description: '出发城市',
    example: '成都',
  })
  @ApiQuery({
    name: 'destinationCity',
    description: '到达城市',
    example: '深圳',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回月度趋势（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getMonthlyTrend(
    @Query('originCity') originCity: string,
    @Query('destinationCity') destinationCity: string
  ) {
    const trend = await this.flightPriceDetailService.getMonthlyTrend(
      originCity,
      destinationCity
    );
    return successResponse(trend);
  }

  @Get('day-of-week-factors')
  @ApiOperation({
    summary: '获取所有周内因子',
    description: '返回周一至周日的周内因子（相对于总平均价的倍数）。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回周内因子列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getDayOfWeekFactors() {
    const factors = await this.flightPriceDetailService.getAllDayOfWeekFactors();
    return successResponse(factors);
  }

  @Post('predict')
  @ApiOperation({
    summary: '预测机票价格趋势',
    description:
      '使用 Prophet 模型（或历史同期均值法）预测未来30天的机票价格趋势，并提供买入信号。\n\n' +
      '**功能：**\n' +
      '- 显示价格趋势红绿灯（BUY/WAIT/NEUTRAL）\n' +
      '- 预测未来30天的价格走势（含置信区间）\n' +
      '- 提供历史价格统计（均值、最低、最高）\n' +
      '- 自然语言建议（如"当前价格处于低位，建议立即购买"）',
  })
  @ApiBody({ type: FlightPricePredictionDto })
  @ApiResponse({
    status: 200,
    description: '成功返回价格预测（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async predictPrice(@Body() dto: FlightPricePredictionDto) {
    try {
      const result = await this.pricePredictionService.predictFlightPrice({
        from_city: dto.from_city,
        to_city: dto.to_city,
        departure_date: dto.departure_date,
        return_date: dto.return_date,
      });
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('domestic/detailed-options')
  @ApiOperation({
    summary: '获取详细价格选项（按航空公司和起飞时间）',
    description:
      '返回指定航线的详细价格选项，包括不同航空公司和不同起飞时间段的价格。\n\n' +
      '**返回内容：**\n' +
      '- 按航空公司分组的价格统计（平均价、最低价、最高价、样本数）\n' +
      '- 每个航空公司不同起飞时间段的价格\n' +
      '- 按起飞时间段分组的价格统计（包含该时段的所有航空公司）',
  })
  @ApiQuery({
    name: 'originCity',
    description: '出发城市',
    example: '成都',
  })
  @ApiQuery({
    name: 'destinationCity',
    description: '到达城市',
    example: '深圳',
  })
  @ApiQuery({
    name: 'month',
    description: '月份（1-12）',
    example: 3,
    type: Number,
  })
  @ApiQuery({
    name: 'dayOfWeek',
    description: '星期几（0=周一, 6=周日，可选）',
    example: 4,
    type: Number,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回详细价格选项（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getDetailedPriceOptions(
    @Query('originCity') originCity: string,
    @Query('destinationCity') destinationCity: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('dayOfWeek') dayOfWeek?: string
  ) {
    try {
      const dayOfWeekNum = dayOfWeek ? parseInt(dayOfWeek) : undefined;

      if (month < 1 || month > 12) {
        throw new BadRequestException('月份必须在 1-12 之间');
      }

      if (dayOfWeekNum !== undefined && (dayOfWeekNum < 0 || dayOfWeekNum > 6)) {
        throw new BadRequestException('星期几必须在 0-6 之间（0=周一, 6=周日）');
      }

      const result = await this.flightPriceDetailEnhancedService.getDetailedPriceOptions(
        originCity,
        destinationCity,
        month,
        dayOfWeekNum
      );
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: '根据 ID 获取价格参考数据',
    description: '返回指定 ID 的价格参考数据详情。',
  })
  @ApiParam({
    name: 'id',
    description: '价格参考数据 ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回价格参考数据（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '未找到指定 ID 的价格参考数据（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    try {
      const priceRef = await this.flightPriceService.findOne(id);
      if (!priceRef) {
        return errorResponse(ErrorCode.NOT_FOUND, `价格参考数据 ID ${id} 不存在`);
      }
      return successResponse(priceRef);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post()
  @ApiOperation({
    summary: '创建价格参考数据',
    description: '创建新的机票价格参考数据。系统会自动计算平均价格。',
  })
  @ApiBody({ type: CreateFlightPriceDto })
  @ApiResponse({
    status: 200,
    description: '成功创建价格参考数据（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async create(@Body() createDto: CreateFlightPriceDto) {
    try {
      const priceRef = await this.flightPriceService.create(createDto);
      return successResponse(priceRef);
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: '更新价格参考数据',
    description: '更新指定 ID 的价格参考数据。如果更新了价格，系统会自动重新计算平均价格。',
  })
  @ApiParam({
    name: 'id',
    description: '价格参考数据 ID',
    example: 1,
  })
  @ApiBody({ type: UpdateFlightPriceDto })
  @ApiResponse({
    status: 200,
    description: '成功更新价格参考数据（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '未找到指定 ID 的价格参考数据（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateFlightPriceDto,
  ) {
    try {
      const existing = await this.flightPriceService.findOne(id);
      if (!existing) {
        return errorResponse(ErrorCode.NOT_FOUND, `价格参考数据 ID ${id} 不存在`);
      }
      const updated = await this.flightPriceService.update(id, updateDto);
      return successResponse(updated);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除价格参考数据',
    description: '删除指定 ID 的价格参考数据。',
  })
  @ApiParam({
    name: 'id',
    description: '价格参考数据 ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: '成功删除价格参考数据',
  })
  @ApiResponse({
    status: 404,
    description: '未找到指定 ID 的价格参考数据',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    try {
      const existing = await this.flightPriceService.findOne(id);
      if (!existing) {
        return errorResponse(ErrorCode.NOT_FOUND, `价格参考数据 ID ${id} 不存在`);
      }
      await this.flightPriceService.remove(id);
      return successResponse({ message: '删除成功' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }
}

