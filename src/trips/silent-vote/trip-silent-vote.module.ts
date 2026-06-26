import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripSilentVoteController } from './trip-silent-vote.controller';
import { TripSilentVoteService } from './services/trip-silent-vote.service';
import { TripSilentVoteAccessService } from './services/trip-silent-vote-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [TripSilentVoteController],
  providers: [TripSilentVoteService, TripSilentVoteAccessService],
  exports: [TripSilentVoteService],
})
export class TripSilentVoteModule {}
