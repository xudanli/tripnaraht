// src/countries/countries.controller.ts
import { Controller, Get, Put, Param, Body, Query, NotFoundException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { CurrencyStrategyDto } from './dto/currency-strategy.dto';
import { CountryPackDto, CreateOrUpdateCountryPackDto } from './dto/country-pack.dto';
import { GetCountriesQueryDto } from './dto/get-countries-query.dto';
import { CountryProfileDto } from './dto/country-profile.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  private readonly logger = new Logger(CountriesController.name);

  constructor(private readonly countriesService: CountriesService) {}

  @Public()
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

  @Public()
  @Get()
  @ApiOperation({
    summary: '获取国家列表',
    description: '支持搜索和分页。可以按中文名、英文名或国家代码搜索。',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: '搜索关键词（支持中文名、英文名、国家代码），例如：日本',
    example: '日本',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '返回数量限制（最大1000，不指定则返回所有国家）',
    example: 100,
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
    description: '成功返回国家列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@Query() query: GetCountriesQueryDto) {
    try {
      this.logger.debug(`[CountriesController] 收到国家查询请求: ${JSON.stringify(query)}`);
      
      const result = await this.countriesService.findAll(query);
      
      this.logger.debug(`[CountriesController] ✅ 返回国家列表: ${result.countries.length} 个国家 (total=${result.total}, hasMore=${result.hasMore})`);
      
      return successResponse({
        countries: result.countries,
        total: result.total,
        hasMore: result.hasMore,
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get countries: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get(':countryCode/profile')
  @ApiOperation({
    summary: '获取完整的国家档案信息',
    description:
      '返回指定国家的完整档案信息，包括：\n' +
      '- 基础信息（国家代码、名称、更新时间）\n' +
      '- 货币和支付信息（货币代码、汇率、支付类型、支付建议）\n' +
      '- 电源信息（电压、频率、插座类型）\n' +
      '- 紧急信息（报警电话、医疗电话等）\n' +
      '- 签证信息（针对中国公民的签证政策）\n' +
      '- 合规信息（驾驶规则、无人机规则、酒精政策等）\n' +
      '- 旅行文化（小费习惯、禁忌列表、节庆信息等）',
  })
  @ApiParam({
    name: 'countryCode',
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回完整的国家档案信息（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '未找到指定国家的档案（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getCountryProfile(@Param('countryCode') countryCode: string) {
    try {
      const profile = await this.countriesService.getCountryProfile(countryCode);
      return successResponse(profile);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`Failed to get country profile: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
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

  @Get(':countryCode/payment-info')
  @ApiOperation({
    summary: '获取目的地支付实用信息（故事5.1）',
    description: '获取目的地的支付规则和技巧，包括主流支付方式、小费规则、ATM取款贴士、实时汇率换算等',
  })
  @ApiParam({
    name: 'countryCode',
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回支付实用信息',
    type: ApiSuccessResponseDto,
  })
  async getPaymentInfo(@Param('countryCode') countryCode: string) {
    try {
      const strategy = await this.countriesService.getCurrencyStrategy(countryCode);
      
      // 增强支付信息
      return successResponse({
        countryCode: strategy.countryCode,
        countryName: strategy.countryName,
        currency: {
          code: strategy.currencyCode,
          name: strategy.currencyName,
          exchangeRateToCNY: strategy.exchangeRateToCNY,
          exchangeRateToUSD: strategy.exchangeRateToUSD,
          quickRule: strategy.quickRule,
          quickTip: strategy.quickTip,
          quickTable: strategy.quickTable,
        },
        paymentMethods: {
          type: strategy.paymentType,
          advice: strategy.paymentAdvice,
        },
        practicalTips: {
          tipping: strategy.paymentAdvice?.tipping || '请查看当地小费习惯',
          atmNetworks: strategy.paymentAdvice?.atm_network || '请查询支持银联的ATM网络',
          walletApps: strategy.paymentAdvice?.wallet_apps || [],
          cashPreparation: strategy.paymentAdvice?.cash_preparation || '建议准备少量现金',
        },
        merchantInfo: {
          unionPaySupported: '请查询当地商户',
          popularMerchantTypes: ['请查询当地热门商户'],
        },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':countryCode/terrain-advice')
  @ApiOperation({
    summary: '获取目的地地形适配建议（故事5.2）',
    description: '获取目的地地形对应的行程规划要点，包括高海拔适应策略、徒步路线风险阈值、装备清单、体力训练建议等',
  })
  @ApiParam({
    name: 'countryCode',
    description: '国家代码',
    example: 'NP',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回地形适配建议',
    type: ApiSuccessResponseDto,
  })
  async getTerrainAdvice(@Param('countryCode') countryCode: string) {
    try {
      const pack = await this.countriesService.getCountryPack(countryCode);
      
      return successResponse({
        countryCode: pack.countryCode,
        terrainConfig: {
          riskThresholds: pack.riskThresholds,
          effortLevelMapping: pack.effortLevelMapping,
          terrainConstraints: pack.terrainConstraints,
        },
        adaptationStrategies: {
          highAltitude: pack.riskThresholds?.highAltitudeM
            ? `海拔超过 ${pack.riskThresholds.highAltitudeM}m 时，建议进行高反风险评估和适应计划`
            : '请根据实际海拔调整',
          routeRisk: pack.riskThresholds?.steepSlopePct
            ? `陡坡阈值：${pack.riskThresholds.steepSlopePct}%`
            : '请根据路线难度评估',
        },
        equipmentRecommendations: {
          basedOnTerrain: '请根据地形配置选择合适的装备',
          trainingAdvice: '建议提前进行体力训练，特别是高海拔地区',
        },
        seasonalConstraints: {
          roadAccess: '请查询季节性道路通行时间限制',
          weatherImpact: '请关注季节性天气对路线的影响',
        },
      });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

