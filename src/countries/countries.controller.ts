// src/countries/countries.controller.ts
import { Controller, Get, Put, Param, Body, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { CurrencyStrategyDto } from './dto/currency-strategy.dto';
import { CountryPackDto, CreateOrUpdateCountryPackDto } from './dto/country-pack.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  @ApiOperation({
    summary: '获取所有国家列表',
    description: '返回所有已配置的国家档案列表，包含基本信息和货币代码',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回国家列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll() {
    const countries = await this.countriesService.findAll();
    return successResponse(countries);
  }

  @Get(':countryCode/currency-strategy')
  @ApiOperation({
    summary: '获取国家的货币策略',
    description:
      '返回指定国家的完整货币和支付策略信息，包括：\n' +
      '- 🌍 通用字段：货币代码、支付画像、支付建议（适用于所有国家用户）\n' +
      '- 🇨🇳 中国特定字段：汇率和速算口诀（CNY基准，仅对中国用户有意义）\n' +
      '- 汇率和速算口诀（如"直接除以 20"）\n' +
      '- 支付画像（现金为主/混合/数字化）\n' +
      '- 支付实用建议（小费、ATM、钱包App等）\n' +
      '- 快速对照表（常用金额的汇率对照）',
  })
  @ApiParam({
    name: 'countryCode',
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
    enum: ['JP', 'IS', 'US', 'GB', 'TH'],
  })
  @ApiResponse({
    status: 200,
    description: '成功返回货币策略（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '未找到指定国家的档案（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getCurrencyStrategy(@Param('countryCode') countryCode: string) {
    try {
      const strategy = await this.countriesService.getCurrencyStrategy(countryCode);
      return successResponse(strategy);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get(':countryCode/pack')
  @ApiOperation({
    summary: '获取国家 Pack 配置',
    description: '返回指定国家的地形策略配置，包括风险阈值、体力等级映射、地形约束等',
  })
  @ApiParam({
    name: 'countryCode',
    description: '国家代码',
    example: 'CN_XIZANG',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回国家 Pack 配置',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '未找到指定国家的 Pack 配置',
    type: ApiErrorResponseDto,
  })
  async getCountryPack(@Param('countryCode') countryCode: string) {
    try {
      const pack = await this.countriesService.getCountryPack(countryCode);
      return successResponse(pack);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('packs')
  @ApiOperation({
    summary: '获取所有国家 Pack 配置列表',
    description: '返回所有已配置的国家 Pack 列表，包括风险阈值、体力等级映射、地形约束等',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回所有国家 Pack 配置列表',
    type: ApiSuccessResponseDto,
  })
  async getAllCountryPacks() {
    try {
      const packs = await this.countriesService.getAllCountryPacks();
      return successResponse(packs);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Put(':countryCode/pack')
  @ApiOperation({
    summary: '创建或更新国家 Pack 配置',
    description: '创建或更新指定国家的地形策略配置。注意：目前配置通过文件管理，此接口会提示需要手动修改配置文件',
  })
  @ApiParam({
    name: 'countryCode',
    description: '国家代码',
    example: 'CN_XIZANG',
  })
  @ApiBody({ type: CreateOrUpdateCountryPackDto })
  @ApiResponse({
    status: 200,
    description: '成功更新国家 Pack 配置',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '更新失败（需要通过配置文件手动修改）',
    type: ApiErrorResponseDto,
  })
  async createOrUpdateCountryPack(
    @Param('countryCode') countryCode: string,
    @Body() dto: CreateOrUpdateCountryPackDto,
  ) {
    try {
      const pack = await this.countriesService.createOrUpdateCountryPack(countryCode, dto);
      return successResponse(pack);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

