// src/railpass/dto/railpass.dto.ts

/**
 * RailPass DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RailPassProfile,
  RailSegment,
  ReservationTask,
} from '../interfaces/railpass.interface';

export class CheckEligibilityDto {
  @ApiProperty({ description: '用户居住国（ISO 3166-1 alpha-2）' })
  residencyCountry!: string;

  @ApiProperty({ description: '旅行国家集合', type: [String] })
  travelCountries!: string[];

  @ApiPropertyOptional({ description: '是否跨居住国' })
  isCrossResidencyCountry?: boolean;

  @ApiProperty({ description: '出行日期' })
  departureDate!: string;
}

export class RecommendPassDto {
  @ApiProperty({ description: '用户居住国' })
  residencyCountry!: string;

  @ApiProperty({ description: '旅行国家集合', type: [String] })
  travelCountries!: string[];

  @ApiProperty({ description: '预期 rail 段数' })
  estimatedRailSegments!: number;

  @ApiProperty({ description: '跨国数量' })
  crossCountryCount!: number;

  @ApiProperty({ description: '是否每天都坐火车' })
  isDailyTravel!: boolean;

  @ApiProperty({ enum: ['city_hopping', 'stay_extended'], description: '停留模式' })
  stayMode!: 'city_hopping' | 'stay_extended';

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'], description: '预算敏感度' })
  budgetSensitivity!: 'LOW' | 'MEDIUM' | 'HIGH';

  @ApiProperty({ description: '旅行天数' })
  tripDurationDays!: number;

  @ApiProperty({ description: '旅行日期范围' })
  tripDateRange!: {
    start: string;
    end: string;
  };

  @ApiProperty({ enum: ['EURAIL', 'INTERRAIL'], description: 'Pass Family' })
  passFamily!: 'EURAIL' | 'INTERRAIL';

  @ApiPropertyOptional({ description: '用户偏好' })
  preferences?: {
    preferFlexibility?: boolean;
    preferMobile?: boolean;
    preferFirstClass?: boolean;
  };

  @ApiPropertyOptional({ description: '样本 segments（用于模拟）', type: [Object] })
  sampleSegments?: RailSegment[];
}

export class CheckReservationDto {
  @ApiProperty({ description: 'Rail Segment', type: Object })
  segment!: RailSegment;
}

export class PlanReservationsDto {
  @ApiProperty({ description: 'Rail Segments', type: [Object] })
  segments!: RailSegment[];

  @ApiPropertyOptional({ description: '用户偏好' })
  userPreferences?: {
    maxReservationFee?: number;
    preferNoReservation?: boolean;
  };
}

export class SimulateTravelDaysDto {
  @ApiProperty({ description: 'Rail Segments', type: [Object] })
  segments!: RailSegment[];

  @ApiProperty({ description: 'Pass Profile', type: Object })
  passProfile!: RailPassProfile;
}

export class ValidateComplianceDto {
  @ApiProperty({ description: 'Pass Profile', type: Object })
  passProfile!: RailPassProfile;

  @ApiProperty({ description: 'Rail Segments', type: [Object] })
  segments!: RailSegment[];

  @ApiPropertyOptional({ description: 'Reservation Tasks', type: [Object] })
  reservationTasks?: ReservationTask[];
}

export class UpdateTripRailPassProfileDto {
  @ApiProperty({ description: 'Trip ID' })
  tripId!: string;

  @ApiProperty({ description: 'Rail Pass Profile', type: Object })
  railPassProfile!: RailPassProfile;
}

export class UpdateReservationTaskDto {
  @ApiProperty({ description: 'Task ID' })
  taskId!: string;

  @ApiProperty({ enum: ['NEEDED', 'PLANNED', 'BOOKED', 'FAILED', 'FALLBACK_APPLIED'], description: '状态' })
  status!: 'NEEDED' | 'PLANNED' | 'BOOKED' | 'FAILED' | 'FALLBACK_APPLIED';

  @ApiPropertyOptional({ description: '订座引用号' })
  bookingRef?: string;

  @ApiPropertyOptional({ description: '实际费用（EUR）' })
  cost?: number;

  @ApiPropertyOptional({ description: '失败原因' })
  failReason?: string;

  @ApiPropertyOptional({ description: '备用方案 ID' })
  fallbackPlanId?: string;
}
