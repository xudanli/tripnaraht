import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum RouteDirectionSharePermission {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
}

export class CreateRouteDirectionShareDto {
  @ApiPropertyOptional({
    enum: RouteDirectionSharePermission,
    default: RouteDirectionSharePermission.VIEW,
  })
  @IsEnum(RouteDirectionSharePermission)
  @IsOptional()
  permission?: RouteDirectionSharePermission;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
