import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleMapsDirectController } from './google-maps-direct.controller';
import { GoogleMapsDirectService } from './google-maps-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [GoogleMapsDirectController],
  providers: [GoogleMapsDirectService],
  exports: [GoogleMapsDirectService],
})
export class GoogleMapsDirectModule {}
