// src/users/dto/admin-user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsEmail, IsBoolean, IsDateString } from 'class-validator';

export class GetUsersQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '搜索关键词（邮箱、显示名称）' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: '邮箱验证状态' })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;
}

export class UserResponseDto {
  @ApiProperty({ description: '用户ID' })
  id!: string;

  @ApiPropertyOptional({ description: 'Google用户唯一ID' })
  googleSub?: string;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string;

  @ApiPropertyOptional({ description: '邮箱是否验证' })
  emailVerified?: boolean;

  @ApiPropertyOptional({ description: '显示名称' })
  displayName?: string;

  @ApiPropertyOptional({ description: '头像URL' })
  avatarUrl?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export class UserListResponseDto {
  @ApiProperty({ description: '用户列表', type: [UserResponseDto] })
  users!: UserResponseDto[];

  @ApiProperty({ description: '总数' })
  total!: number;

  @ApiProperty({ description: '页码' })
  page!: number;

  @ApiProperty({ description: '每页数量' })
  limit!: number;

  @ApiProperty({ description: '总页数' })
  totalPages!: number;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '显示名称' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: '邮箱验证状态' })
  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @ApiPropertyOptional({ description: '头像URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
