import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import {
  TRAVEL_CONTEXT_INTENT_TYPES,
  type TravelContextIntentType,
} from '../travel-context-intent.types';

export class SubmitTravelContextIntentDto {
  @ApiProperty({ enum: TRAVEL_CONTEXT_INTENT_TYPES })
  @IsString()
  @IsNotEmpty()
  @IsIn([...TRAVEL_CONTEXT_INTENT_TYPES])
  type!: TravelContextIntentType;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiProperty({ description: 'Optimistic concurrency — must match current snapshot revision' })
  @IsInt()
  basedOnRevision!: number;

  @ApiPropertyOptional({ description: 'Optional idempotency key forwarded to domain handlers' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
