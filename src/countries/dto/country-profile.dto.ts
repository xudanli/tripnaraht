// src/countries/dto/country-profile.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentType } from '@prisma/client';

/**
 * 电源信息
 */
export class PowerInfoDto {
  @ApiPropertyOptional({ description: '电压（V）', example: 100 })
  voltage?: number;

  @ApiPropertyOptional({ description: '频率（Hz）', example: 50 })
  frequency?: number;

  @ApiPropertyOptional({ description: '插座类型数组', example: ['A', 'B'], type: [String] })
  plugTypes?: string[];

  @ApiPropertyOptional({ description: '备注信息' })
  note?: string;
}

/**
 * 紧急信息
 */
export class EmergencyInfoDto {
  @ApiPropertyOptional({ description: '警察电话', example: '110' })
  police?: string;

  @ApiPropertyOptional({ description: '火警电话', example: '119' })
  fire?: string;

  @ApiPropertyOptional({ description: '医疗电话', example: '119' })
  medical?: string;

  @ApiPropertyOptional({ description: '救护车电话', example: '119' })
  ambulance?: string;

  @ApiPropertyOptional({ description: '备注信息' })
  note?: string;

  @ApiPropertyOptional({ description: '大使馆联系方式' })
  embassy?: {
    phone?: string;
    address?: string;
  };
}

/**
 * 签证信息
 */
export class VisaInfoDto {
  @ApiPropertyOptional({ description: '是否需要签证', example: false })
  required?: boolean;

  @ApiPropertyOptional({ description: '签证类型', example: '免签' })
  type?: string;

  @ApiPropertyOptional({ description: '停留期限', example: '15天' })
  duration?: string;

  @ApiPropertyOptional({ description: '申请要求', type: [String] })
  requirements?: string[];

  @ApiPropertyOptional({ description: '备注信息' })
  notes?: string;
}

/**
 * 合规信息
 */
export class ComplianceInfoDto {
  @ApiPropertyOptional({ description: '签证政策' })
  visaPolicy?: {
    forCN?: string;
    forUS?: string;
    [key: string]: any;
  };

  @ApiPropertyOptional({ description: '驾驶规则' })
  drivingRules?: {
    requiresInternationalLicense?: boolean;
    driveOnLeft?: boolean;
    [key: string]: any;
  };

  @ApiPropertyOptional({ description: '无人机规则' })
  droneRules?: {
    allowed?: boolean;
    notes?: string;
    [key: string]: any;
  };

  @ApiPropertyOptional({ description: '酒精政策' })
  alcoholPolicy?: any;

  @ApiPropertyOptional({ description: '旅行警告' })
  travelWarnings?: any;

  @ApiPropertyOptional({ description: '海关规定' })
  customs?: any;
}

/**
 * 旅行文化信息
 */
export class TravelCultureDto {
  @ApiPropertyOptional({ description: '小费文化' })
  tipping?: string;

  @ApiPropertyOptional({ description: '禁忌列表', type: [String] })
  taboos?: string[];

  @ApiPropertyOptional({ description: '着装提示' })
  dressCode?: string;

  @ApiPropertyOptional({ description: '节庆日历' })
  festivals?: Array<{
    name?: string;
    month?: number;
    description?: string;
    [key: string]: any;
  }>;

  @ApiPropertyOptional({ description: '礼仪提示' })
  etiquette?: string;

  @ApiPropertyOptional({ description: '风俗习惯' })
  customs?: any;
}

/**
 * 完整国家档案响应DTO
 */
export class CountryProfileDto {
  @ApiProperty({ description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' })
  isoCode!: string;

  @ApiProperty({ description: '国家中文名称', example: '日本' })
  nameCN!: string;

  @ApiPropertyOptional({ description: '国家英文名称', example: 'Japan' })
  nameEN?: string;

  @ApiProperty({ description: '最后更新时间' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: '货币代码（ISO 4217）', example: 'JPY' })
  currencyCode?: string;

  @ApiPropertyOptional({ description: '货币名称', example: '日元' })
  currencyName?: string;

  @ApiPropertyOptional({ description: '汇率（1 外币 = 多少 CNY）🇨🇳 中国特定', example: 0.0483 })
  exchangeRateToCNY?: number;

  @ApiPropertyOptional({ description: '汇率（1 外币 = 多少 USD）🌍 国际化', example: 0.0067 })
  exchangeRateToUSD?: number;

  @ApiPropertyOptional({ description: '支付画像类型', enum: PaymentType, example: PaymentType.CASH_HEAVY })
  paymentType?: PaymentType;

  @ApiPropertyOptional({ 
    description: '支付详细信息',
    example: {
      tipping: '绝对不要给小费',
      atm_network: '7-11 ATM支持银联取现',
      wallet_apps: ['Suica', 'PayPay'],
      cash_preparation: '建议准备少量现金',
    },
  })
  paymentInfo?: {
    tipping?: string;
    atm_network?: string;
    wallet_apps?: string[];
    cash_preparation?: string;
    notes?: string;
    [key: string]: any;
  };

  @ApiPropertyOptional({ description: '电源信息', type: PowerInfoDto })
  powerInfo?: PowerInfoDto;

  @ApiPropertyOptional({ description: '紧急信息', type: EmergencyInfoDto })
  emergency?: EmergencyInfoDto;

  @ApiPropertyOptional({ description: '中国公民签证信息', type: VisaInfoDto })
  visaForCN?: VisaInfoDto;

  @ApiPropertyOptional({ description: '合规信息', type: ComplianceInfoDto })
  complianceInfo?: ComplianceInfoDto;

  @ApiPropertyOptional({ description: '旅行文化', type: TravelCultureDto })
  travelCulture?: TravelCultureDto;
}
