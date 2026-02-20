import { Module } from '@nestjs/common';
import { AmadeusController } from './amadeus.controller';
import { AmadeusService } from './amadeus.service';
import { AmadeusDirectModule } from './amadeus-direct.module';

@Module({
  imports: [AmadeusDirectModule],
  controllers: [AmadeusController],
  providers: [AmadeusService],
  exports: [AmadeusService],
})
export class AmadeusModule {}
