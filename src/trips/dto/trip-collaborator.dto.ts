// src/trips/dto/trip-collaborator.dto.ts
import { IsEnum, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum CollaboratorRole {
  VIEWER = 'VIEWER',
  EDITOR = 'EDITOR',
  OWNER = 'OWNER',
}

export class AddCollaboratorDto {
  @ApiProperty({ description: '用户邮箱', example: 'user@example.com' })
  @IsEmail({}, { message: '无效的邮箱地址' })
  email!: string;

  @ApiProperty({
    description: '角色',
    enum: CollaboratorRole,
    example: CollaboratorRole.EDITOR,
  })
  @IsEnum(CollaboratorRole)
  role!: CollaboratorRole;
}

export class CollaboratorResponseDto {
  @ApiProperty({ description: '协作者ID' })
  id!: string;

  @ApiProperty({ description: '行程ID' })
  tripId!: string;

  @ApiProperty({ description: '用户ID' })
  userId!: string;

  @ApiProperty({ description: '用户邮箱', required: false, nullable: true })
  email?: string | null;

  @ApiProperty({ description: '用户显示名称', required: false, nullable: true })
  displayName?: string | null;

  @ApiProperty({ description: '角色', enum: CollaboratorRole })
  role!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;
}
