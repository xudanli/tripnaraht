import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StripeDirectModule } from '../mcp/stripe-direct.module';
import { ResearchEventsController } from './research-events.controller';
import { ResearchPaymentController } from './research-payment.controller';
import { ResearchSessionService } from './research-session.service';
import { ResearchCommitmentService } from './research-commitment.service';
import { ResearchPaymentService } from './research-payment.service';

@Module({
  imports: [PrismaModule, AuthModule, StripeDirectModule],
  controllers: [ResearchEventsController, ResearchPaymentController],
  providers: [ResearchSessionService, ResearchCommitmentService, ResearchPaymentService],
  exports: [ResearchSessionService, ResearchCommitmentService, ResearchPaymentService],
})
export class ResearchModule {}
