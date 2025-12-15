// src/trips/dto/trip-collaborator.dto.ts
import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum CollaboratorRole {
  VIEWER = 'VIEWER',
  EDITOR = 'EDITOR',
  OWNER = 'OWNER',
}

export class AddCollaboratorDto {
  @ApiProperty({ description: '用户ID', example: 'user-123' })
  @IsString()
  userId!: string;

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

  @ApiProperty({ description: '角色', enum: CollaboratorRole })
  role!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;
}
