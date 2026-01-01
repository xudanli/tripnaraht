// src/trips/dto/delete-trip.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 删除行程确认 DTO
 */
export class DeleteTripDto {
  @ApiProperty({
    description: '确认文字（用于防止误删）。必须输入行程的目的地国家代码（如：JP、IS）来确认删除',
    example: 'JP',
  })
  @IsString()
  @IsNotEmpty({ message: '确认文字不能为空' })
  confirmText!: string;
}
