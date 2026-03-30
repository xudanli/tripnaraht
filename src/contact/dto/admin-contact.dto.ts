// src/contact/dto/admin-contact.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';

export enum ContactMessageStatus {
  PENDING = 'pending',
  READ = 'read',
  REPLIED = 'replied',
  RESOLVED = 'resolved',
}

export class GetContactMessagesQueryDto {
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

  @ApiPropertyOptional({ description: '状态筛选', enum: ContactMessageStatus })
  @IsOptional()
  @IsEnum(ContactMessageStatus)
  status?: ContactMessageStatus;

  @ApiPropertyOptional({ description: '用户ID筛选' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '搜索关键词（消息内容）' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ContactMessageImageDto {
  @ApiProperty({ description: '图片ID' })
  id!: string;

  @ApiProperty({ description: '文件路径' })
  filePath!: string;

  @ApiProperty({ description: '原始文件名' })
  fileName!: string;

  @ApiProperty({ description: '文件大小（字节）' })
  fileSize!: string;

  @ApiProperty({ description: 'MIME类型' })
  mimeType!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: '文件访问URL' })
  fileUrl?: string;
}

export class ContactMessageResponseDto {
  @ApiProperty({ description: '消息ID' })
  id!: string;

  @ApiPropertyOptional({ description: '用户ID' })
  userId?: string;

  @ApiPropertyOptional({ description: '消息内容' })
  message?: string;

  @ApiProperty({ description: '状态', enum: ContactMessageStatus })
  status!: ContactMessageStatus;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;

  @ApiProperty({ description: '图片列表', type: [ContactMessageImageDto] })
  images!: ContactMessageImageDto[];
}

export class ContactMessageListResponseDto {
  @ApiProperty({ description: '消息列表', type: [ContactMessageResponseDto] })
  messages!: ContactMessageResponseDto[];

  @ApiProperty({ description: '总数' })
  total!: number;

  @ApiProperty({ description: '页码' })
  page!: number;

  @ApiProperty({ description: '每页数量' })
  limit!: number;

  @ApiProperty({ description: '总页数' })
  totalPages!: number;
}

export class UpdateContactMessageStatusDto {
  @ApiProperty({ description: '状态', enum: ContactMessageStatus })
  @IsEnum(ContactMessageStatus)
  status!: ContactMessageStatus;
}

export class ReplyContactMessageDto {
  @ApiProperty({ description: '回复内容' })
  @IsString()
  reply!: string;
}
