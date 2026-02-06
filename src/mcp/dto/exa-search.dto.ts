import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';

export class ExaWebSearchDto {
  @ApiProperty({
    description: '搜索查询',
    example: 'latest AI developments',
  })
  @IsString()
  query: string;

  @ApiPropertyOptional({
    description: '返回结果数量',
    example: 10,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  numResults?: number;

  @ApiPropertyOptional({
    description: '是否使用自动提示优化查询',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  useAutoprompt?: boolean;

  @ApiPropertyOptional({
    description: '内容类别',
    example: 'article',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: '开始发布日期（ISO 8601）',
    example: '2024-01-01',
  })
  @IsString()
  @IsOptional()
  startPublishedDate?: string;

  @ApiPropertyOptional({
    description: '结束发布日期（ISO 8601）',
    example: '2024-12-31',
  })
  @IsString()
  @IsOptional()
  endPublishedDate?: string;
}

export class ExaCodeContextDto {
  @ApiProperty({
    description: '代码查询',
    example: 'React hooks useState example',
  })
  @IsString()
  query: string;

  @ApiPropertyOptional({
    description: '返回结果数量',
    example: 5,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  numResults?: number;

  @ApiPropertyOptional({
    description: '编程语言列表',
    example: ['javascript', 'typescript'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}

export class ExaCompanyResearchDto {
  @ApiProperty({
    description: '公司名称',
    example: 'OpenAI',
  })
  @IsString()
  companyName: string;

  @ApiPropertyOptional({
    description: '返回结果数量',
    example: 10,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  numResults?: number;
}

export class ExaCrawlUrlDto {
  @ApiProperty({
    description: '要爬取的 URL',
    example: 'https://example.com/article',
  })
  @IsString()
  url: string;

  @ApiPropertyOptional({
    description: '是否返回文本内容',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  text?: boolean;

  @ApiPropertyOptional({
    description: '是否返回 HTML 内容',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  html?: boolean;

  @ApiPropertyOptional({
    description: '是否返回 Markdown 内容',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  markdown?: boolean;
}

export class ExaDeepResearcherStartDto {
  @ApiProperty({
    description: '研究查询',
    example: 'What are the latest developments in quantum computing?',
  })
  @IsString()
  query: string;

  @ApiPropertyOptional({
    description: '报告类型',
    example: 'research_report',
  })
  @IsString()
  @IsOptional()
  reportType?: string;

  @ApiPropertyOptional({
    description: '结果数量',
    example: 20,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  numResults?: number;
}

export class ExaDeepResearcherCheckDto {
  @ApiProperty({
    description: '任务 ID',
    example: 'task-123',
  })
  @IsString()
  taskId: string;
}
