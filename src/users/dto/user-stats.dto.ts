// src/users/dto/user-stats.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 用户统计信息响应 DTO（管理接口）
 */
export class UserStatsResponseDto {
  @ApiProperty({ description: '总用户数', example: 1000 })
  totalUsers!: number;

  @ApiProperty({ description: '已验证邮箱用户数', example: 800 })
  verifiedUsers!: number;

  @ApiProperty({ description: '未验证邮箱用户数', example: 200 })
  unverifiedUsers!: number;

  @ApiProperty({ description: 'Google登录用户数', example: 600 })
  googleUsers!: number;

  @ApiProperty({ description: '今日新注册用户数', example: 10 })
  todayNewUsers!: number;

  @ApiProperty({ description: '本周新注册用户数', example: 50 })
  weekNewUsers!: number;

  @ApiProperty({ description: '本月新注册用户数', example: 200 })
  monthNewUsers!: number;

  @ApiProperty({ description: '有偏好设置的用户数', example: 500 })
  usersWithProfile!: number;

  @ApiProperty({ description: '统计时间' })
  generatedAt!: Date;
}

/**
 * 用户详情响应 DTO（包含关联数据）
 */
export class UserDetailResponseDto {
  @ApiProperty({ description: '用户ID' })
  id!: string;

  @ApiPropertyOptional({ description: 'Google用户唯一ID' })
  googleSub?: string | null;

  @ApiPropertyOptional({ description: '邮箱' })
  email?: string | null;

  @ApiPropertyOptional({ description: '邮箱是否验证' })
  emailVerified?: boolean | null;

  @ApiPropertyOptional({ description: '显示名称' })
  displayName?: string | null;

  @ApiPropertyOptional({ description: '头像URL' })
  avatarUrl?: string | null;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: '用户偏好设置' })
  profile?: {
    preferences?: any;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;

  @ApiProperty({ description: '关联的行程数量', example: 5 })
  tripCount!: number;

  @ApiProperty({ description: '收藏的行程数量', example: 3 })
  collectionCount!: number;

  @ApiProperty({ description: '点赞的行程数量', example: 10 })
  likeCount!: number;
}
