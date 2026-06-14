import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MatchSquareController } from './match-square.controller';
import { MatchSquareService } from './services/match-square.service';

@Module({
  imports: [PrismaModule],
  controllers: [MatchSquareController],
  providers: [MatchSquareService],
  exports: [MatchSquareService],
})
export class MatchSquareModule {}
