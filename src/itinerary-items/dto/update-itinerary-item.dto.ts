import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateItineraryItemDto } from './create-itinerary-item.dto';

/**
 * 级联调整模式
 */
export enum CascadeMode {
  /** 自动调整后续行程项（当前默认行为） */
  AUTO = 'auto',
  /** 只调整当前项，不影响后续 */
  NONE = 'none',
}

/**
 * 更新行程项 DTO
 */
export class UpdateItineraryItemDto extends PartialType(CreateItineraryItemDto) {
  @ApiPropertyOptional({
    description: '级联调整模式。auto: 自动调整后续行程项（默认）；none: 只调整当前项，不影响后续',
    enum: CascadeMode,
    example: CascadeMode.AUTO,
    default: CascadeMode.AUTO,
  })
  @IsEnum(CascadeMode, { message: 'cascadeMode 必须是 "auto" 或 "none"' })
  @IsOptional()
  cascadeMode?: CascadeMode;
}
