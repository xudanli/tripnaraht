// src/users/dto/current-user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, IsUrl } from 'class-validator';

/**
 * 当前用户信息响应 DTO
 */
export class CurrentUserResponseDto {
  @ApiProperty({ description: '用户ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'user@example.com' })
  email?: string | null;

  @ApiPropertyOptional({ description: '邮箱是否已验证', example: true })
  emailVerified?: boolean | null;

  @ApiPropertyOptional({ description: '显示名称', example: '张三' })
  displayName?: string | null;

  @ApiPropertyOptional({ description: '头像URL', example: 'https://example.com/avatar.jpg' })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ description: 'Google用户ID（如果通过Google登录）' })
  googleSub?: string | null;

  @ApiProperty({ description: '账户创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '账户更新时间' })
  updatedAt!: Date;
}

/**
 * 更新当前用户信息请求 DTO
 */
export class UpdateCurrentUserDto {
  @ApiPropertyOptional({
    description: '显示名称',
    example: '张三',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    description: '头像URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsUrl({}, { message: '头像URL格式无效' })
  avatarUrl?: string;
}

/**
 * 删除账户请求 DTO
 */
export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: '删除确认文本（需输入"确认删除"）',
    example: '确认删除',
  })
  @IsOptional()
  @IsString()
  confirmText?: string;
}

/**
 * 删除账户响应 DTO
 */
export class DeleteAccountResponseDto {
  @ApiProperty({ description: '是否成功删除', example: true })
  deleted!: boolean;

  @ApiProperty({ description: '删除的用户ID' })
  userId!: string;

  @ApiProperty({ description: '删除时间' })
  deletedAt!: Date;
}
