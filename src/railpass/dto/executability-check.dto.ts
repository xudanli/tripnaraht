// src/railpass/dto/executability-check.dto.ts

/**
 * 可执行性检查 DTO
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';

export class CheckExecutabilityDto {
  @ApiProperty({ description: 'Pass Profile', type: Object })
  passProfile!: RailPassProfile;

  @ApiProperty({ description: 'Rail Segments', type: [Object] })
  segments!: RailSegment[];

  @ApiPropertyOptional({ description: 'Reservation Tasks', type: [Object] })
  reservationTasks?: ReservationTask[];

  @ApiPropertyOptional({ description: 'Place ID -> Name 映射（可选，用于显示地点名称）', type: Object })
  placeNames?: Record<number, { name: string; countryCode: string }>;
}

export class RegeneratePlanDto {
  @ApiProperty({ description: 'Trip ID' })
  tripId!: string;

  @ApiProperty({ 
    enum: ['MORE_STABLE', 'MORE_ECONOMICAL', 'MORE_AFFORDABLE', 'CUSTOM'],
    description: '改方案策略：更稳/更省/更便宜' 
  })
  strategy!: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';

  @ApiPropertyOptional({ description: '自定义参数' })
  customParams?: {
    avoidMandatoryReservations?: boolean;
    minimizeTravelDays?: boolean;
    maxReservationFee?: number;
  };
}
