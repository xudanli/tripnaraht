import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class ExtractMetadataDto {
  @ApiProperty({
    description: '文件的公开 URL',
    example: 'https://example.com/document.pdf',
  })
  @IsString()
  url!: string;
}

export class ExtractFileContentDto {
  @ApiProperty({
    description: '文件的公开 URL',
    example: 'https://example.com/document.pdf',
  })
  @IsString()
  url!: string;

  @ApiProperty({
    description: '页码（用于 PDF、PPTX）',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiProperty({
    description: '返回结果数量限制',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiProperty({
    description: '搜索关键词（用于电子表格）',
    example: '关键词',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: '工作表名称（用于 Excel）',
    example: 'Sheet1',
    required: false,
  })
  @IsOptional()
  @IsString()
  sheet?: string;

  @ApiProperty({
    description: '搜索是否区分大小写',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  caseSensitive?: boolean;
}
