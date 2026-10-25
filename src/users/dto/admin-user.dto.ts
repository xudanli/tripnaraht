// src/users/dto/admin-user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsEmail, IsBoolean } from 'class-validator';

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

/** iOS identity 摘要 — 对齐 GET /api/mobile/users/me/identity */
export class AdminUserIdentitySummaryDto {
  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  legalFullName!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'YYYY-MM-DD' })
  dateOfBirth!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO alpha-2' })
  nationality!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 3166-2' })
  residencyRegion!: string | null;

  @ApiPropertyOptional({ nullable: true })
  preferredLanguage!: string | null;
}

/** iOS travel-portrait 摘要 — 对齐 GET /api/mobile/users/me/travel-portrait */
export class AdminUserTravelPortraitSummaryDto {
  @ApiPropertyOptional({ nullable: true })
  travelPace!: string | null;

  @ApiPropertyOptional({ nullable: true })
  restFrequency!: string | null;

  @ApiPropertyOptional({ nullable: true })
  mobilityLimitation!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nightDrivingAcceptance!: string | null;

  @ApiPropertyOptional({ nullable: true })
  gravelAcceptance!: string | null;

  @ApiProperty()
  hasChildrenNeeds!: boolean;

  @ApiProperty()
  hasElderlyNeeds!: boolean;

  @ApiProperty()
  motionSickness!: boolean;
}

/** iOS driver-profile/summary — 对齐 GET /api/mobile/users/me/driver-profile/summary */
export class AdminUserDriverSummaryDto {
  @ApiProperty({ description: 'incomplete | valid | expiring_soon | expired' })
  qualificationStatus!: string;

  @ApiPropertyOptional({ nullable: true })
  licenseExpiresOn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  experienceYears!: number | null;

  @ApiPropertyOptional({ nullable: true })
  snowLabel!: string | null;

  @ApiPropertyOptional({ nullable: true })
  nightDrivingLabel!: string | null;

  @ApiProperty()
  completionRatio!: number;
}

export class UserResponseDto {
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

  @ApiPropertyOptional({
    description: 'iOS 个人资料摘要（来自 preferences.other.identity）',
    type: AdminUserIdentitySummaryDto,
    nullable: true,
  })
  identity?: AdminUserIdentitySummaryDto | null;

  @ApiPropertyOptional({
    description: 'iOS 旅行画像摘要（来自 preferences.other.travelPortrait）',
    type: AdminUserTravelPortraitSummaryDto,
    nullable: true,
  })
  travelPortrait?: AdminUserTravelPortraitSummaryDto | null;

  @ApiPropertyOptional({
    description: 'iOS 驾驶员状态卡摘要',
    type: AdminUserDriverSummaryDto,
    nullable: true,
  })
  driverSummary?: AdminUserDriverSummaryDto | null;

  @ApiPropertyOptional({ description: '是否已填个人资料 identity' })
  hasIdentity?: boolean;

  @ApiPropertyOptional({ description: '是否已填旅行画像' })
  hasTravelPortrait?: boolean;

  @ApiPropertyOptional({ description: '是否已填驾驶员资料' })
  hasDriverProfile?: boolean;

  @ApiPropertyOptional({ description: '关联行程数（协作者）' })
  tripCount?: number;

  @ApiPropertyOptional({ description: '证件库文档数（未删除）' })
  documentCount?: number;

  @ApiPropertyOptional({ description: '紧急联系人数' })
  emergencyContactCount?: number;
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
