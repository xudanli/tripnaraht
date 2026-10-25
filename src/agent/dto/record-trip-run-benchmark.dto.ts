import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordTripRunBenchmarkDto {
  @ApiProperty({ description: 'Golden / eval case id，如 ICE-023 / CASE-Q01' })
  @IsString()
  @MaxLength(128)
  taskId!: string;

  @ApiPropertyOptional({ description: '是否通过' })
  @IsOptional()
  @IsBoolean()
  pass?: boolean;

  @ApiPropertyOptional({ description: '分数 0-100 或 0-1' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional({ description: '失败维度列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  failedDimension?: string[];
}
