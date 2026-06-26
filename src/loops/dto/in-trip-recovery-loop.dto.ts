import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartInTripRecoveryLoopDto {
  @ApiPropertyOptional({ description: '触发事件 ID（environment event 或 travel event）' })
  @IsOptional()
  @IsString()
  triggerEventId?: string;

  @ApiPropertyOptional({ description: '指定环境事件 ID，局部恢复' })
  @IsOptional()
  @IsString()
  environmentEventId?: string;
}

export class InTripPlanApplyItemDto {
  @ApiProperty()
  @IsString()
  environmentEventId!: string;

  @ApiProperty()
  @IsString()
  planId!: string;
}

export class ApplyInTripLoopPlansDto {
  @ApiProperty({ type: [InTripPlanApplyItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InTripPlanApplyItemDto)
  plans!: InTripPlanApplyItemDto[];
}

export class TriggerInTripRecoveryLoopDto extends StartInTripRecoveryLoopDto {
  @ApiPropertyOptional({
    enum: ['WEATHER_ALERT', 'ROAD_CLOSED', 'TRAFFIC_DELAY', 'LATE_DEPARTURE', 'ENVIRONMENT_DETECTED', 'MANUAL'],
  })
  @IsOptional()
  @IsString()
  triggerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalEventId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
