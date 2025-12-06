// src/countries/dto/currency-strategy.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentType } from '@prisma/client';

/**
 * 货币策略响应 DTO
 * 
 * 包含完整的货币和支付信息，用于前端展示
 */
export class CurrencyStrategyDto {
  @ApiProperty({
    description: '国家代码（ISO 3166-1 alpha-2）',
    example: 'JP',
  })
  countryCode!: string;

  @ApiProperty({
    description: '国家中文名称',
    example: '日本',
  })
  countryName!: string;

  @ApiProperty({
    description: '货币代码',
    example: 'JPY',
  })
  currencyCode!: string;

  @ApiProperty({
    description: '货币名称',
    example: '日元',
  })
  currencyName!: string;

  @ApiProperty({
    description: '支付画像类型',
    enum: PaymentType,
    example: PaymentType.CASH_HEAVY,
  })
  paymentType!: PaymentType;

  @ApiProperty({
    description: '汇率（1 外币 = 多少 CNY）',
    example: 0.0483,
    nullable: true,
  })
  exchangeRateToCNY?: number;

  @ApiProperty({
    description: '速算口诀',
    example: '直接除以 20',
    nullable: true,
  })
  quickRule?: string;

  @ApiProperty({
    description: '速算提示文本',
    example: '看到价格 直接除以 20 即为人民币\n例：日元1,000 ≈ 48 元',
    nullable: true,
  })
  quickTip?: string;

  @ApiProperty({
    description: '快速对照表',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        local: { type: 'number', example: 1000 },
        home: { type: 'number', example: 48 },
      },
    },
    nullable: true,
  })
  quickTable?: Array<{ local: number; home: number }>;

  @ApiPropertyOptional({
    description: '支付实用建议',
    example: {
      tipping: '绝对不要给小费，会被视为无礼',
      atm_network: '7-11 ATM支持银联取现',
      wallet_apps: ['Suica (Apple Pay)', 'PayPay'],
      cash_preparation: '硬币使用极高，务必准备零钱袋',
    },
  })
  paymentAdvice?: {
    tipping?: string;
    atm_network?: string;
    wallet_apps?: string[];
    cash_preparation?: string;
  };
}

