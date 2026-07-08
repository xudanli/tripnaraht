import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator';
import {
  ExplorationBudgetDto,
  ExplorationDateRangeDto,
  ExplorationInsuranceContextDto,
  ExplorationMobilityContextDto,
  ExplorationRentalContextDto,
  ExplorationTravelerDto,
} from './exploration.dto';

/** PATCH /scenarios/:id/conditions — 仅 DRAFT 且非 locked 字段可改 */
export class PatchExplorationConditionsDto {
  @ApiPropertyOptional({ example: ['IS'] })
  @IsOptional()
  @IsArray()
  destinationCodes?: string[];

  @ApiPropertyOptional({ type: ExplorationDateRangeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationDateRangeDto)
  dateRange?: ExplorationDateRangeDto;

  @ApiPropertyOptional({ type: [ExplorationTravelerDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ExplorationTravelerDto)
  travelers?: ExplorationTravelerDto[];

  @ApiPropertyOptional({ type: ExplorationBudgetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationBudgetDto)
  budget?: ExplorationBudgetDto;

  @ApiPropertyOptional({ type: ExplorationMobilityContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationMobilityContextDto)
  mobilityContext?: ExplorationMobilityContextDto;

  @ApiPropertyOptional({ type: ExplorationInsuranceContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationInsuranceContextDto)
  insuranceContext?: ExplorationInsuranceContextDto;

  @ApiPropertyOptional({ type: ExplorationRentalContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExplorationRentalContextDto)
  rentalContext?: ExplorationRentalContextDto;
}
