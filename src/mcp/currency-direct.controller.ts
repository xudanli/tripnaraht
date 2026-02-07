import {
  Controller,
  Post,
  Body,
  Get,
  HttpException,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrencyDirectService, ExchangeRateParams, CurrencyConversionParams } from './currency-direct.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('currency')
@Controller('api/currency')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CurrencyDirectController {
  constructor(private readonly currencyService: CurrencyDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '检查 Currency Exchange 服务状态' })
  @ApiResponse({ status: 200, description: '服务状态' })
  async health() {
    return {
      success: true,
      available: this.currencyService.isServiceAvailable(),
    };
  }

  @Get('latest')
  @ApiOperation({ summary: '获取最新汇率' })
  @ApiResponse({ status: 200, description: '最新汇率' })
  async getLatestRates(
    @Query('base') base?: string,
    @Query('symbols') symbols?: string, // 逗号分隔的货币代码
  ) {
    try {
      const params: ExchangeRateParams = {
        base: base || 'USD',
      };

      if (symbols) {
        params.symbols = symbols.split(',').map(s => s.trim().toUpperCase());
      }

      const result = await this.currencyService.getLatestRates(params);
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to get latest rates',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('historical')
  @ApiOperation({ summary: '获取历史汇率' })
  @ApiResponse({ status: 200, description: '历史汇率' })
  async getHistoricalRates(
    @Query('date') date: string, // YYYY-MM-DD
    @Query('base') base?: string,
    @Query('symbols') symbols?: string,
  ) {
    try {
      if (!date) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'INVALID_PARAMS',
              message: 'Date parameter is required (YYYY-MM-DD)',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const params: ExchangeRateParams & { date: string } = {
        date,
        base: base || 'USD',
      };

      if (symbols) {
        params.symbols = symbols.split(',').map(s => s.trim().toUpperCase());
      }

      const result = await this.currencyService.getHistoricalRates(params);
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to get historical rates',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('convert')
  @ApiOperation({ summary: '货币转换' })
  @ApiResponse({ status: 200, description: '转换结果' })
  async convertCurrency(
    @Body() body: CurrencyConversionParams,
  ) {
    try {
      const result = await this.currencyService.convertCurrency(body);
      
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to convert currency',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('convert-multiple')
  @ApiOperation({ summary: '批量货币转换' })
  @ApiResponse({ status: 200, description: '批量转换结果' })
  async convertMultipleCurrencies(
    @Body() body: {
      amount: number;
      from: string;
      to: string[];
    },
  ) {
    try {
      const results = await this.currencyService.convertMultipleCurrencies(
        body.amount,
        body.from,
        body.to,
      );
      
      return {
        success: true,
        amount: body.amount,
        from: body.from,
        results,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to convert multiple currencies',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('trend')
  @ApiOperation({ summary: '获取汇率趋势' })
  @ApiResponse({ status: 200, description: '汇率趋势数据' })
  async getRateTrend(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('days') days?: string,
  ) {
    try {
      if (!from || !to) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: 'INVALID_PARAMS',
              message: 'from and to parameters are required',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const daysCount = days ? parseInt(days) : 7;
      const trends = await this.currencyService.getRateTrend(
        from.toUpperCase(),
        to.toUpperCase(),
        daysCount,
      );
      
      return {
        success: true,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        trends,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to get rate trend',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('supported')
  @ApiOperation({ summary: '获取支持的货币列表' })
  @ApiResponse({ status: 200, description: '支持的货币列表' })
  async getSupportedCurrencies() {
    try {
      const currencies = this.currencyService.getSupportedCurrencies();
      
      return {
        success: true,
        currencies,
        count: currencies.length,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to get supported currencies',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('settings')
  @ApiOperation({ summary: '获取用户货币设置' })
  @ApiResponse({ status: 200, description: '用户设置' })
  async getUserCurrencySettings(@CurrentUser() user: any) {
    try {
      const settings = await this.currencyService.getUserCurrencySettings(user.id);
      
      return {
        success: true,
        settings: settings || {
          defaultCurrency: 'USD',
          preferredCurrencies: [],
        },
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to get user currency settings',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('settings')
  @ApiOperation({ summary: '保存用户货币设置' })
  @ApiResponse({ status: 200, description: '设置保存成功' })
  async saveUserCurrencySettings(
    @CurrentUser() user: any,
    @Body() body: {
      defaultCurrency?: string;
      preferredCurrencies?: string[];
    },
  ) {
    try {
      await this.currencyService.saveUserCurrencySettings(user.id, body);
      
      return {
        success: true,
        message: 'Settings saved successfully',
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CURRENCY_ERROR',
            message: error.message || 'Failed to save user currency settings',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
