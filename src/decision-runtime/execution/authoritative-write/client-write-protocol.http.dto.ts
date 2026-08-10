/**
 * Nest HTTP DTOs for UWC-1e — must stay aligned with UWC_1E_OPENAPI_FREEZE.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
} from 'class-validator';
import {
  UWC_1E_FIRST_BATCH_SLICES,
  UWC_1E_PRODUCT_SURFACES,
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
  type Uwc1eFirstBatchSlice,
  type Uwc1eProductSurface,
} from './client-write-protocol.types';

export class Uwc1ePreviewBodyDto {
  @ApiProperty({ enum: [UWC_1E_SCHEMA_ID], default: UWC_1E_SCHEMA_ID })
  @IsIn([UWC_1E_SCHEMA_ID])
  schemaId: typeof UWC_1E_SCHEMA_ID = UWC_1E_SCHEMA_ID;

  @ApiProperty({ enum: [UWC_1E_PROTOCOL_VERSION], default: UWC_1E_PROTOCOL_VERSION })
  @IsIn([UWC_1E_PROTOCOL_VERSION])
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION = UWC_1E_PROTOCOL_VERSION;

  @ApiProperty({ enum: ['PREVIEW'], default: 'PREVIEW' })
  @Equals('PREVIEW')
  stage: 'PREVIEW' = 'PREVIEW';

  @ApiProperty({ enum: [...UWC_1E_PRODUCT_SURFACES] })
  @IsIn([...UWC_1E_PRODUCT_SURFACES])
  productSurface!: Uwc1eProductSurface;

  @ApiProperty({ enum: [...UWC_1E_FIRST_BATCH_SLICES] })
  @IsIn([...UWC_1E_FIRST_BATCH_SLICES])
  slice!: Uwc1eFirstBatchSlice;

  @ApiProperty()
  @IsString()
  tripId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Corridor-local intended mutation; never executed at Preview',
  })
  @IsObject()
  intendedMutation!: Record<string, unknown>;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'ExpectedWriteVersion OCC object (Apply-time)',
  })
  @IsObject()
  expectedWriteVersion!: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  observedHints?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class Uwc1eConfirmBodyDto {
  @ApiProperty({ enum: [UWC_1E_SCHEMA_ID], default: UWC_1E_SCHEMA_ID })
  @IsIn([UWC_1E_SCHEMA_ID])
  schemaId: typeof UWC_1E_SCHEMA_ID = UWC_1E_SCHEMA_ID;

  @ApiProperty({ enum: [UWC_1E_PROTOCOL_VERSION], default: UWC_1E_PROTOCOL_VERSION })
  @IsIn([UWC_1E_PROTOCOL_VERSION])
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION = UWC_1E_PROTOCOL_VERSION;

  @ApiProperty({ enum: ['CONFIRM'], default: 'CONFIRM' })
  @Equals('CONFIRM')
  stage: 'CONFIRM' = 'CONFIRM';

  @ApiProperty()
  @IsString()
  draftId!: string;

  @ApiProperty({
    enum: [true],
    description: 'Must be true — implied consent rejected',
  })
  @IsBoolean()
  @Equals(true)
  explicitConfirm!: true;

  @ApiProperty({ enum: [...UWC_1E_PRODUCT_SURFACES] })
  @IsIn([...UWC_1E_PRODUCT_SURFACES])
  productSurface!: Uwc1eProductSurface;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class Uwc1eApplyBodyDto {
  @ApiProperty({ enum: [UWC_1E_SCHEMA_ID], default: UWC_1E_SCHEMA_ID })
  @IsIn([UWC_1E_SCHEMA_ID])
  schemaId: typeof UWC_1E_SCHEMA_ID = UWC_1E_SCHEMA_ID;

  @ApiProperty({ enum: [UWC_1E_PROTOCOL_VERSION], default: UWC_1E_PROTOCOL_VERSION })
  @IsIn([UWC_1E_PROTOCOL_VERSION])
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION = UWC_1E_PROTOCOL_VERSION;

  @ApiProperty({ enum: ['APPLY'], default: 'APPLY' })
  @Equals('APPLY')
  stage: 'APPLY' = 'APPLY';

  @ApiProperty()
  @IsString()
  draftId!: string;

  @ApiProperty()
  @IsString()
  confirmationId!: string;

  @ApiProperty()
  @IsString()
  idempotencyKey!: string;

  @ApiProperty({ enum: [...UWC_1E_PRODUCT_SURFACES] })
  @IsIn([...UWC_1E_PRODUCT_SURFACES])
  productSurface!: Uwc1eProductSurface;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
}
