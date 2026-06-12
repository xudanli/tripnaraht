import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingCartUiDto } from './route-and-run.dto';

export class BookingCartActionPayloadDto {
  @ApiPropertyOptional({ type: [String], description: 'update_selection 时必填' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selected_item_ids?: string[];

  @ApiPropertyOptional({ description: 'apply_saving 时：savings_opportunities 下标' })
  @IsOptional()
  @IsNumber()
  saving_index?: number;

  @ApiPropertyOptional({ description: 'confirm_ready 超预算时须为 true' })
  @IsOptional()
  @IsBoolean()
  acknowledge_over_budget?: boolean;
}

export class ApplyBookingCartActionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trip_id?: string;

  @ApiPropertyOptional({ description: '关联 route_and_run request_id（审计）' })
  @IsOptional()
  @IsString()
  request_id?: string;

  @ApiProperty({ type: BookingCartUiDto, description: '来自 result.payload.ui_display.booking_cart' })
  @ValidateNested()
  @Type(() => BookingCartUiDto)
  cart!: BookingCartUiDto;

  @ApiProperty({
    enum: ['update_selection', 'apply_saving', 'confirm_ready', 'submit_checkout'],
  })
  @IsString()
  @IsIn(['update_selection', 'apply_saving', 'confirm_ready', 'submit_checkout'])
  action!: 'update_selection' | 'apply_saving' | 'confirm_ready' | 'submit_checkout';

  @ApiPropertyOptional({ type: BookingCartActionPayloadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingCartActionPayloadDto)
  payload?: BookingCartActionPayloadDto;
}

export class BookingCartCheckoutLineDto {
  @ApiProperty()
  @IsString()
  item_id!: string;

  @ApiProperty()
  @IsString()
  kind!: string;

  @ApiProperty()
  @IsString()
  label_zh!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  href?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  api_action?: { method: 'GET' | 'POST'; path: string };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  price_label?: string;
}

export class BookingCartCheckoutResultDto {
  @ApiProperty({ enum: ['ready', 'submitted'] })
  @IsString()
  status!: 'ready' | 'submitted';

  @ApiProperty({ type: [BookingCartCheckoutLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingCartCheckoutLineDto)
  deep_links!: BookingCartCheckoutLineDto[];

  @ApiProperty()
  @IsString()
  disclaimer_zh!: string;
}

export class ApplyBookingCartActionResponseDto {
  @ApiProperty({ enum: ['OK', 'REJECTED'] })
  @IsString()
  status!: 'OK' | 'REJECTED';

  @ApiProperty({ type: BookingCartUiDto })
  booking_cart!: BookingCartUiDto;

  @ApiPropertyOptional({ type: BookingCartCheckoutResultDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingCartCheckoutResultDto)
  checkout?: BookingCartCheckoutResultDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejection_reason_zh?: string;
}
