// src/users/dto/user-profile.dto.ts
import { IsString, IsOptional, IsObject, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TravelMode } from '../../trips/dto/trip-intent.dto';

/**
 * 用户偏好配置
 */
export class UserPreferencesDto {
  @ApiPropertyOptional({
    description: '喜欢的景点类型',
    example: ['ATTRACTION', 'NATURE', 'CULTURE'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  preferredAttractionTypes?: string[];

  @ApiPropertyOptional({
    description: '饮食禁忌',
    example: ['VEGETARIAN', 'NO_PORK', 'NO_SEAFOOD'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  dietaryRestrictions?: string[];

  @ApiPropertyOptional({
    description: '是否偏好小众景点',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  preferOffbeatAttractions?: boolean;

  @ApiPropertyOptional({
    description: '出行偏好',
    example: {
      pace: 'LEISURE', // LEISURE, MODERATE, FAST
      budget: 'MEDIUM', // LOW, MEDIUM, HIGH
      accommodation: 'COMFORTABLE', // BUDGET, COMFORTABLE, LUXURY
      travelMode: 'PUBLIC_TRANSIT', // DRIVING, PUBLIC_TRANSIT, MIXED
    },
  })
  @IsObject()
  @IsOptional()
  travelPreferences?: {
    pace?: string;
    budget?: string;
    accommodation?: string;
    /** 出行方式：DRIVING(自驾), PUBLIC_TRANSIT(公共交通), MIXED(混合) */
    travelMode?: TravelMode;
  };

  @ApiPropertyOptional({
    description: '其他偏好（JSON 格式）',
    example: { accessibility: true, petFriendly: false },
  })
  @IsObject()
  @IsOptional()
  other?: Record<string, any>;

  @ApiPropertyOptional({
    description: '国籍（ISO 3166-1 alpha-2）',
    example: 'CN',
  })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiPropertyOptional({
    description: '居住国（ISO 3166-1 alpha-2）',
    example: 'CN',
  })
  @IsString()
  @IsOptional()
  residencyCountry?: string;

  @ApiPropertyOptional({
    description: '旅行者标签',
    example: ['senior', 'family_with_children', 'solo'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  tags?: string[];
}

/**
 * 获取用户画像响应 DTO
 */
export class GetUserProfileResponseDto {
  @ApiProperty({ description: '用户ID', example: 'user-123' })
  userId!: string;

  @ApiPropertyOptional({
    description: '用户偏好',
    type: UserPreferencesDto,
  })
  preferences?: UserPreferencesDto;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

/**
 * 更新用户画像请求 DTO
 */
export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    description: '用户偏好',
    type: UserPreferencesDto,
  })
  @IsObject()
  @IsOptional()
  preferences?: UserPreferencesDto;
}
