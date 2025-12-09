// src/flight-prices/dto/update-flight-price.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateFlightPriceDto } from './create-flight-price.dto';

export class UpdateFlightPriceDto extends PartialType(CreateFlightPriceDto) {}

