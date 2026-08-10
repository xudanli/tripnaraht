import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ApplyIcelandProposalDto {
  @ApiPropertyOptional({ description: 'Must match shell contextVersion when set' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contextVersion?: number;

  @ApiPropertyOptional({ description: 'Must match shell contextHash when set' })
  @IsOptional()
  @IsString()
  contextHash?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
