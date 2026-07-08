import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { AuthorizationPolicyGatewayService } from './authorization-policy.gateway.service';

@Module({
  imports: [PrismaModule, GuardianDecisionCoreModule],
  providers: [AuthorizationPolicyGatewayService],
  exports: [AuthorizationPolicyGatewayService],
})
export class AuthorizationPolicyModule {}
