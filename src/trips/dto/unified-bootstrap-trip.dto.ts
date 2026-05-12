import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TravelerDto } from './create-trip.dto';

/**
 * 统一 Bootstrap API：`POST /trips/bootstrap` — 创建 Trip 并同步跑一轮 Draft Runtime（落 itinerary）。
 * 与 NL 流相比：无会话澄清；参数需自备。
 */
export class UnifiedBootstrapTripDto {
  @ApiPropertyOptional({ description: '自然语言意图摘要（写入 Trip/上下文，可选）' })
  @IsOptional()
  @IsString()
  userInput?: string;

  @ApiProperty({ description: 'ISO 目的地国家码', example: 'JP' })
  @IsString()
  destination!: string;

  @ApiProperty({ description: '开始日期 YYYY-MM-DD' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: '结束日期 YYYY-MM-DD' })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ description: '总预算', example: 20000 })
  @IsNumber()
  totalBudget!: number;

  @ApiPropertyOptional({ description: '货币 ISO', example: 'CNY' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: [TravelerDto], description: '缺省为单人成人' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerDto)
  travelers?: TravelerDto[];

  @ApiPropertyOptional({ enum: ['LLM', 'ALGO', 'HYBRID'], description: '草案运行时模式' })
  @IsOptional()
  @IsIn(['LLM', 'ALGO', 'HYBRID'])
  draftRuntimeMode?: 'LLM' | 'ALGO' | 'HYBRID';
}
