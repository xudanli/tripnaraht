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
import { EstimatePriceDto, EstimatePriceResponseDto } from './dto/estimate-price.dto';
import { CreateFlightPriceDto } from './dto/create-flight-price.dto';
import { UpdateFlightPriceDto } from './dto/update-flight-price.dto';

@ApiTags('flight-prices')
@Controller('flight-prices')
export class FlightPricesController {
  constructor(
    private readonly flightPriceService: FlightPriceService,
    private readonly flightPriceDetailService: FlightPriceDetailService
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
    description: '成功返回估算成本',
    type: EstimatePriceResponseDto,
  })
  async estimatePrice(
    @Query('countryCode') countryCode: string,
    @Query('originCity') originCity?: string,
    @Query('useConservative') useConservative: string = 'true',
  ): Promise<EstimatePriceResponseDto> {
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

    if (!details) {
      return {
        totalCost,
        flightPrice: totalCost,
        visaCost: 0,
        useConservative: useConservativeBool,
        countryCode: countryCode.toUpperCase(),
        originCity: originCity?.toUpperCase(),
      };
    }

    return {
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
    description: '成功返回详细价格信息',
  })
  @ApiResponse({
    status: 404,
    description: '未找到价格参考数据',
  })
  async getPriceDetails(
    @Query('countryCode') countryCode: string,
    @Query('originCity') originCity?: string,
  ) {
    const details = await this.flightPriceService.getPriceDetails(
      countryCode,
      originCity,
    );

    if (!details) {
      throw new NotFoundException(
        `未找到 ${countryCode}${originCity ? ` (${originCity})` : ''} 的价格参考数据`,
      );
    }

    return details;
  }

  @Get()
  @ApiOperation({
    summary: '获取所有价格参考数据',
    description: '返回所有已配置的机票价格参考数据列表。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回价格参考数据列表',
  })
  findAll() {
    return this.flightPriceService.findAll();
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
    description: '成功返回价格参考数据',
  })
  @ApiResponse({
    status: 404,
    description: '未找到指定 ID 的价格参考数据',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const priceRef = await this.flightPriceService.findOne(id);
    if (!priceRef) {
      throw new NotFoundException(`价格参考数据 ID ${id} 不存在`);
    }
    return priceRef;
  }

  @Post()
  @ApiOperation({
    summary: '创建价格参考数据',
    description: '创建新的机票价格参考数据。系统会自动计算平均价格。',
  })
  @ApiBody({ type: CreateFlightPriceDto })
  @ApiResponse({
    status: 201,
    description: '成功创建价格参考数据',
  })
  create(@Body() createDto: CreateFlightPriceDto) {
    return this.flightPriceService.create(createDto);
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
    description: '成功更新价格参考数据',
  })
  @ApiResponse({
    status: 404,
    description: '未找到指定 ID 的价格参考数据',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateFlightPriceDto,
  ) {
    const existing = await this.flightPriceService.findOne(id);
    if (!existing) {
      throw new NotFoundException(`价格参考数据 ID ${id} 不存在`);
    }
    return this.flightPriceService.update(id, updateDto);
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
    const existing = await this.flightPriceService.findOne(id);
    if (!existing) {
      throw new NotFoundException(`价格参考数据 ID ${id} 不存在`);
    }
    return this.flightPriceService.remove(id);
  }

  @Get('domestic/estimate')
  @ApiOperation({
    summary: '估算国内航线价格（基于历史数据）',
    description:
      '根据2024年历史数据估算国内航线价格。\n\n' +
      '**计算公式：**\n' +
      '预算价格 = 月度基准价 (P_month) × 周内因子 (F_day)\n\n' +
      '**数据来源：**\n' +
      '- 基于2024年中国航空航班历史数据\n' +
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
    description: '成功返回估算价格',
    schema: {
      type: 'object',
      example: {
        estimatedPrice: 2375,
        lowerBound: 2138,
        upperBound: 2613,
        monthlyBasePrice: 2200,
        dayOfWeekFactor: 1.08,
        sampleCount: 45,
      },
    },
  })
  async estimateDomesticPrice(
    @Query('originCity') originCity: string,
    @Query('destinationCity') destinationCity: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('dayOfWeek') dayOfWeek?: string
  ) {
    const dayOfWeekNum = dayOfWeek ? parseInt(dayOfWeek) : undefined;
    
    if (month < 1 || month > 12) {
      throw new BadRequestException('月份必须在 1-12 之间');
    }
    
    if (dayOfWeekNum !== undefined && (dayOfWeekNum < 0 || dayOfWeekNum > 6)) {
      throw new BadRequestException('星期几必须在 0-6 之间（0=周一, 6=周日）');
    }

    return this.flightPriceDetailService.estimateDomesticPrice(
      originCity,
      destinationCity,
      month,
      dayOfWeekNum
    );
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
    description: '成功返回月度趋势',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          month: { type: 'number' },
          basePrice: { type: 'number' },
          sampleCount: { type: 'number' },
        },
      },
    },
  })
  async getMonthlyTrend(
    @Query('originCity') originCity: string,
    @Query('destinationCity') destinationCity: string
  ) {
    return this.flightPriceDetailService.getMonthlyTrend(
      originCity,
      destinationCity
    );
  }

  @Get('day-of-week-factors')
  @ApiOperation({
    summary: '获取所有周内因子',
    description: '返回周一至周日的周内因子（相对于总平均价的倍数）。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回周内因子列表',
  })
  async getDayOfWeekFactors() {
    return this.flightPriceDetailService.getAllDayOfWeekFactors();
  }
}

