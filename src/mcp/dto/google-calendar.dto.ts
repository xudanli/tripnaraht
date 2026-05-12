/**
 * Google Calendar DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DateTimeDto {
  @ApiPropertyOptional({ description: '日期时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  dateTime?: string;

  @ApiPropertyOptional({ description: '日期（YYYY-MM-DD）' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: '时区' })
  @IsOptional()
  @IsString()
  timeZone?: string;
}

export class CreateEventDto {
  @ApiPropertyOptional({ description: '日历 ID（默认: primary）' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiProperty({ description: '事件标题' })
  @IsString()
  summary!: string;

  @ApiProperty({ description: '开始时间', type: DateTimeDto })
  @ValidateNested()
  @Type(() => DateTimeDto)
  start!: DateTimeDto;

  @ApiProperty({ description: '结束时间', type: DateTimeDto })
  @ValidateNested()
  @Type(() => DateTimeDto)
  end!: DateTimeDto;

  @ApiPropertyOptional({ description: '事件描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '事件位置' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: '参与者邮箱列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];
}

export class UpdateEventDto {
  @ApiProperty({ description: '日历 ID' })
  @IsString()
  calendarId!: string;

  @ApiProperty({ description: '事件 ID' })
  @IsString()
  eventId!: string;

  @ApiPropertyOptional({ description: '事件标题' })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional({ description: '开始时间', type: DateTimeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateTimeDto)
  start?: DateTimeDto;

  @ApiPropertyOptional({ description: '结束时间', type: DateTimeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateTimeDto)
  end?: DateTimeDto;

  @ApiPropertyOptional({ description: '事件描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '事件位置' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class DeleteEventDto {
  @ApiProperty({ description: '日历 ID' })
  @IsString()
  calendarId!: string;

  @ApiProperty({ description: '事件 ID' })
  @IsString()
  eventId!: string;
}

export class ListEventsDto {
  @ApiPropertyOptional({ description: '日历 ID（默认: primary）' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  timeMin?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  timeMax?: string;

  @ApiPropertyOptional({ description: '最大结果数' })
  @IsOptional()
  @IsNumber()
  maxResults?: number;
}

export class FindEventDto {
  @ApiPropertyOptional({ description: '日历 ID（默认: primary）' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiPropertyOptional({ description: '搜索查询' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: '开始时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  timeMin?: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 8601）' })
  @IsOptional()
  @IsString()
  timeMax?: string;
}

export class FindFreeSlotsDto {
  @ApiPropertyOptional({ description: '日历 ID（默认: primary）' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiProperty({ description: '开始时间（ISO 8601）' })
  @IsString()
  timeMin!: string;

  @ApiProperty({ description: '结束时间（ISO 8601）' })
  @IsString()
  timeMax!: string;

  @ApiPropertyOptional({ description: '持续时间（分钟）' })
  @IsOptional()
  @IsNumber()
  durationMinutes?: number;
}

export class QuickAddDto {
  @ApiPropertyOptional({ description: '日历 ID（默认: primary）' })
  @IsOptional()
  @IsString()
  calendarId?: string;

  @ApiProperty({ description: '自然语言描述' })
  @IsString()
  text!: string;
}
