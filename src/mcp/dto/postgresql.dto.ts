/**
 * PostgreSQL DTOs
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class QueryDto {
  @ApiProperty({
    description: 'SQL 查询语句（SELECT）',
    example: 'SELECT * FROM users WHERE id = $1',
  })
  @IsString()
  query!: string;

  @ApiProperty({
    description: '查询参数（可选）',
    example: [1],
    required: false,
  })
  @IsOptional()
  @IsArray()
  params?: any[];
}

export class ExecuteDto {
  @ApiProperty({
    description: 'SQL 执行语句（INSERT, UPDATE, DELETE）',
    example: 'INSERT INTO users (name, email) VALUES ($1, $2)',
  })
  @IsString()
  query!: string;

  @ApiProperty({
    description: '执行参数（可选）',
    example: ['John Doe', 'john@example.com'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  params?: any[];
}
