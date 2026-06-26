import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OdysseyIntakeController } from './odyssey-intake.controller';
import { OdysseyIntakeService } from './odyssey-intake.service';

@Module({
  imports: [PrismaModule],
  controllers: [OdysseyIntakeController],
  providers: [OdysseyIntakeService],
  exports: [OdysseyIntakeService],
})
export class OdysseyIntakeModule {}
