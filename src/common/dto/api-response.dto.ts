// src/common/dto/api-response.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 错误信息 DTO（用于 Swagger 文档）
 */
export class ApiErrorDto {
  @ApiProperty({
    enum: [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'PROVIDER_ERROR',
      'BUSINESS_ERROR',
      'INTERNAL_ERROR',
      'UNSUPPORTED_ACTION',
    ],
    example: 'VALIDATION_ERROR',
  })
  code: string;

  @ApiProperty({ example: 'poiId is required' })
  message: string;

  @ApiPropertyOptional({ type: Object, example: { field: 'poiId' } })
  details?: Record<string, any>;
}

/**
 * 成功响应 DTO（用于 Swagger 文档）
 */
export class ApiSuccessResponseDto<T> {
  @ApiProperty({ enum: [true], example: true })
  success: true;

  @ApiProperty()
  data: T;
}

/**
 * 错误响应 DTO（用于 Swagger 文档）
 */
export class ApiErrorResponseDto {
  @ApiProperty({ enum: [false], example: false })
  success: false;

  @ApiProperty({ type: ApiErrorDto })
  error: ApiErrorDto;
}
