// src/railpass/dto/reservation-channels.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';

export class ReservationChannelsRequestDto {
  @ApiProperty({
    description: 'Rail segments',
    type: Array,
  })
  @IsNotEmpty()
  @IsArray()
  segments!: any[];
}

