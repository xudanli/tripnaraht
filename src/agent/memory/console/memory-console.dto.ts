import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import type { PacePreference, RiskTolerance, RouteType, TravelPhilosophy } from '../interfaces/user-travel-profile.interface';

export class PatchUserTravelProfileL1Dto {
  @ApiPropertyOptional({ enum: ['SLOW', 'MODERATE', 'FAST'] })
  @IsOptional()
  @IsEnum(['SLOW', 'MODERATE', 'FAST'])
  pacePreference?: PacePreference;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  riskTolerance?: RiskTolerance;

  @ApiPropertyOptional({ enum: ['SCENIC', 'ADVENTURE', 'RELAXED'] })
  @IsOptional()
  @IsEnum(['SCENIC', 'ADVENTURE', 'RELAXED'])
  travelPhilosophy?: TravelPhilosophy;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  preferredRouteTypes?: RouteType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  client_acknowledged?: boolean;
}
