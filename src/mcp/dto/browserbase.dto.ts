import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ViewportDto {
  @ApiPropertyOptional({ description: '视口宽度', example: 1920 })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ description: '视口高度', example: 1080 })
  @IsOptional()
  @IsNumber()
  height?: number;
}

export class CreateSessionDto {
  @ApiPropertyOptional({ description: '初始 URL', example: 'https://example.com' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'User Agent', example: 'Mozilla/5.0...' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: '视口设置', type: ViewportDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ViewportDto)
  viewport?: ViewportDto;
}

export class NavigateDto {
  @ApiProperty({ description: '会话 ID', example: 'session-123' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: '目标 URL', example: 'https://example.com' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ 
    description: '等待条件', 
    enum: ['load', 'domcontentloaded', 'networkidle'],
    example: 'load'
  })
  @IsOptional()
  @IsString()
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export class ScreenshotDto {
  @ApiProperty({ description: '会话 ID', example: 'session-123' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ description: '是否全页截图', example: false })
  @IsOptional()
  @IsBoolean()
  fullPage?: boolean;

  @ApiPropertyOptional({ description: '图片质量 (0-100)', example: 90 })
  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class ClickDto {
  @ApiProperty({ description: '会话 ID', example: 'session-123' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'CSS 选择器', example: 'button#submit' })
  @IsString()
  selector: string;

  @ApiPropertyOptional({ description: '是否等待导航', example: false })
  @IsOptional()
  @IsBoolean()
  waitForNavigation?: boolean;
}

export class EvaluateDto {
  @ApiProperty({ description: '会话 ID', example: 'session-123' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'JavaScript 代码', example: 'document.title' })
  @IsString()
  script: string;
}
