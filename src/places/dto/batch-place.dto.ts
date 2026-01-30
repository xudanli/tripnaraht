// src/places/dto/batch-place.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

export class BatchPlaceRequestDto {
  @ApiProperty({ 
    description: 'POI ID数组', 
    example: [381040, 381086, 381037],
    type: [Number]
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids!: number[];
}

export class BatchPlaceResponseDto {
  @ApiProperty({ description: 'POI列表', type: Array })
  places!: any[];
}
