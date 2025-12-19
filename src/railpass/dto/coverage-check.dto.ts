// src/railpass/dto/coverage-check.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';

export class CoverageCheckRequestDto {
  @ApiProperty({
    description: 'Rail segment',
    type: Object,
  })
  @IsNotEmpty()
  @IsObject()
  segment!: any;

  @ApiProperty({
    description: 'Pass profile',
    type: Object,
  })
  @IsNotEmpty()
  @IsObject()
  passProfile!: any;
}

