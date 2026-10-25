import { Module } from '@nestjs/common';
import { QWeatherService } from './qweather.service';
import { QWeatherController } from './qweather.controller';

@Module({
  providers: [QWeatherService],
  controllers: [QWeatherController],
  exports: [QWeatherService],
})
export class QWeatherModule {}
