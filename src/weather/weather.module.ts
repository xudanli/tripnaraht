// src/weather/weather.module.ts

import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { DataContractsModule } from '../data-contracts/data-contracts.module';

@Module({
  imports: [DataContractsModule],
  controllers: [WeatherController],
})
export class WeatherModule {}
