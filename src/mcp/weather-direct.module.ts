import { Module } from '@nestjs/common';
import { WeatherDirectService } from './weather-direct.service';
import { WeatherDirectController } from './weather-direct.controller';

@Module({
  providers: [WeatherDirectService],
  controllers: [WeatherDirectController],
  exports: [WeatherDirectService],
})
export class WeatherDirectModule {}
