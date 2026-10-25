import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripPdfController } from './trip-pdf.controller';
import { TripPdfService } from './trip-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [TripPdfController],
  providers: [TripPdfService],
  exports: [TripPdfService],
})
export class TripPdfModule {}
