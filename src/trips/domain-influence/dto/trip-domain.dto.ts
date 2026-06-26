import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WISH_CATEGORIES } from '../../wishlist/types/trip-wish.types';

export class ClaimDomainDto {
  @ApiProperty({ enum: WISH_CATEGORIES })
  @IsString()
  @IsIn([...WISH_CATEGORIES])
  domain!: (typeof WISH_CATEGORIES)[number];

  @ApiPropertyOptional({ description: '自评专业度 0-100', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  selfScore?: number;

  @ApiPropertyOptional({ description: '认领说明' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: ['explicit', 'recommended'] })
  @IsOptional()
  @IsIn(['explicit', 'recommended'])
  claimSource?: 'explicit' | 'recommended';
}

export class EndorseDomainClaimDto {
  @ApiProperty({ enum: WISH_CATEGORIES })
  @IsString()
  @IsIn([...WISH_CATEGORIES])
  domain!: (typeof WISH_CATEGORIES)[number];

  @ApiProperty({ description: '被认可的认领者 userId' })
  @IsString()
  claimUserId!: string;
}

export class DomainWeightOverrideItemDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @Min(0)
  @Max(1)
  weight!: number;
}

export class SetDomainWeightsDto {
  @ApiProperty({ enum: WISH_CATEGORIES })
  @IsString()
  @IsIn([...WISH_CATEGORIES])
  domain!: (typeof WISH_CATEGORIES)[number];

  @ApiProperty({ type: [DomainWeightOverrideItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DomainWeightOverrideItemDto)
  weights!: DomainWeightOverrideItemDto[];

  @ApiPropertyOptional({ enum: ['negotiation', 'manual'] })
  @IsOptional()
  @IsIn(['negotiation', 'manual'])
  source?: 'negotiation' | 'manual';
}

export class ConfirmDomainRulesDto {
  @ApiPropertyOptional({ description: '确认备注' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkSetDomainWeightsDto {
  @ApiProperty({ type: [SetDomainWeightsDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetDomainWeightsDto)
  domains!: SetDomainWeightsDto[];
}
