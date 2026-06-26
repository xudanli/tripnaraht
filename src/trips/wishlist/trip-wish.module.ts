import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VoiceModule } from '../../voice/voice.module';
import { TripWishController } from './trip-wish.controller';
import { TripWishService } from './services/trip-wish.service';
import { TripWishAccessService } from './services/trip-wish-access.service';
import { TripWishStructuringService } from './services/trip-wish-structuring.service';
import { TripWishSuggestionService } from './services/trip-wish-suggestion.service';
import { TripWishVoiceService } from './services/trip-wish-voice.service';

@Module({
  imports: [PrismaModule, VoiceModule],
  controllers: [TripWishController],
  providers: [
    TripWishService,
    TripWishAccessService,
    TripWishStructuringService,
    TripWishSuggestionService,
    TripWishVoiceService,
  ],
  exports: [TripWishService, TripWishVoiceService],
})
export class TripWishModule {}
