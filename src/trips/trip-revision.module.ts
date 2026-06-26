import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TripRevisionBumpService } from './services/trip-revision-bump.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TripRevisionBumpService],
  exports: [TripRevisionBumpService],
})
export class TripRevisionModule {}
