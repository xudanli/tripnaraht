// src/trips/dto/trip-share.dto.ts
import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SharePermission {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
}

export class CreateTripShareDto {
  @ApiPropertyOptional({
    description: '分享权限',
    enum: SharePermission,
    default: SharePermission.VIEW,
  })
  @IsEnum(SharePermission)
  @IsOptional()
  permission?: SharePermission;

  @ApiPropertyOptional({
    description: '过期时间（ISO 格式）',
    example: '2024-12-31T23:59:59.000Z',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class TripShareResponseDto {
  @ApiProperty({ description: '分享ID' })
  id!: string;

  @ApiProperty({ description: '行程ID' })
  tripId!: string;

  @ApiProperty({ description: '分享令牌' })
  shareToken!: string;

  @ApiProperty({ description: '权限', enum: SharePermission })
  permission!: string;

  @ApiPropertyOptional({ description: '过期时间' })
  expiresAt?: Date;

  @ApiProperty({ description: '分享链接' })
  shareUrl!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;
}
