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
 * 用户详情响应 DTO（包含关联数据 + iOS 个人中心字段）
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

  @ApiPropertyOptional({ description: '平台角色 USER | OPERATOR | ADMIN' })
  platformRole?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: '用户偏好设置（原始 UserProfile）' })
  profile?: {
    preferences?: any;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;

  @ApiPropertyOptional({
    description: 'iOS identity 完整块（preferences.other.identity）',
  })
  identity?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'iOS travel-portrait（已与默认值 merge）',
  })
  travelPortrait?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'iOS driver-profile（已与默认值 merge，无评分）',
  })
  driverProfile?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'iOS driver-profile/summary 状态卡',
  })
  driverSummary?: {
    qualificationStatus: string;
    licenseExpiresOn: string | null;
    experienceYears: number | null;
    snowLabel: string | null;
    nightDrivingLabel: string | null;
    completionRatio: number;
  } | null;

  @ApiPropertyOptional({ description: '紧急联系人列表' })
  emergencyContacts?: unknown[];

  @ApiPropertyOptional({
    description: '证件库元数据（不含 signedUrl / 完整号码）',
  })
  documents?: Array<{
    id: string;
    type: string;
    status: string;
    expiresOn: Date | null;
    numberLast4: string | null;
    fileName: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

  @ApiProperty({ description: '关联的行程数量', example: 5 })
  tripCount!: number;

  @ApiProperty({ description: '收藏的行程数量', example: 3 })
  collectionCount!: number;

  @ApiProperty({ description: '点赞的行程数量', example: 10 })
  likeCount!: number;

  @ApiPropertyOptional({ description: '证件数量' })
  documentCount?: number;

  @ApiPropertyOptional({ description: '紧急联系人数量' })
  emergencyContactCount?: number;
}
