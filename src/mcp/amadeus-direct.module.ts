import { Module } from '@nestjs/common';
import { AmadeusDirectService } from './amadeus-direct.service';

@Module({
  providers: [AmadeusDirectService],
  exports: [AmadeusDirectService],
})
export class AmadeusDirectModule {}
