// src/railpass/dto/pass-profile-wizard.dto.ts

/**
 * PassProfile 向导 DTO
 * 
 * 支持最短 3 问的简化流程
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PassProfileWizardDto {
  // Q1（必问，影响最大）
  @ApiProperty({ description: '居住国（ISO 3166-1 alpha-2），用于判断 Eurail/Interrail' })
  residencyCountry!: string;

  // Q2（必问）
  @ApiProperty({ enum: ['GLOBAL', 'ONE_COUNTRY'], description: 'Pass 类型：Global（多国）还是 One Country（单国）' })
  passType!: 'GLOBAL' | 'ONE_COUNTRY';

  @ApiPropertyOptional({ description: '如果 passType 为 ONE_COUNTRY，指定是哪一个国家（ISO 3166-1 alpha-2）' })
  oneCountryCode?: string;

  // Q3（必问）
  @ApiProperty({ enum: ['FLEXI', 'CONTINUOUS'], description: '有效期类型：Flexi（例如 1 个月内任选 7 天）还是 Continuous（例如连续 15 天）' })
  validityType!: 'FLEXI' | 'CONTINUOUS';

  @ApiPropertyOptional({ description: '如果是 FLEXI，指定 Travel Days 总数（例如 7 天、10 天）' })
  travelDaysTotal?: number;

  // Q4（可选）
  @ApiPropertyOptional({ enum: ['MOBILE', 'PAPER'], description: '载体类型：mobile（手机）还是 paper（纸票）。如果不提供，系统会按未知处理' })
  mobileOrPaper?: 'MOBILE' | 'PAPER';

  @ApiPropertyOptional({ enum: ['FIRST', 'SECOND'], description: 'Pass 等级：First 还是 Second。如果不提供，默认 Second' })
  class?: 'FIRST' | 'SECOND';

  @ApiPropertyOptional({ description: 'Pass 有效期开始日期（如果不提供，会从行程开始日期推断）' })
  validityStartDate?: string;

  @ApiPropertyOptional({ description: 'Pass 有效期结束日期（如果不提供，会从行程结束日期推断）' })
  validityEndDate?: string;

  @ApiProperty({ description: 'Trip ID，用于关联到行程' })
  tripId!: string;
}
