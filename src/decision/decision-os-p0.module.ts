import { Global, Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KPUModule } from '../kpu/kpu.module';
import { PhysicalValidatorService } from '../domain/ontology/validator/physical-validator.service';
import { DecisionOsSloService } from './slo/decision-os-slo.service';
import { ValidationGatewayService } from './validation-gateway/validation-gateway.service';
import { ValidationGatewayExtensionService } from './validation-gateway/validation-gateway-extension.service';
import { ContingencyOrchestratorService } from './contingency/contingency-orchestrator.service';
import { ContingencySilentHealHandler } from './contingency/handlers/contingency-silent-heal.handler';
import { ContingencySilentHealBootstrap } from './contingency/contingency-silent-heal.bootstrap';
import { DecisionDnaComplianceService } from '../agent/memory/governance/decision-dna-compliance.service';

/**
 * Decision OS P0 横切模块：Validation Gateway + Contingency Orchestrator + SLO。
 */
@Global()
@Module({
  imports: [PrismaModule, forwardRef(() => KPUModule)],
  providers: [
    DecisionOsSloService,
    ValidationGatewayService,
    ValidationGatewayExtensionService,
    PhysicalValidatorService,
    ContingencyOrchestratorService,
    ContingencySilentHealHandler,
    ContingencySilentHealBootstrap,
    DecisionDnaComplianceService,
  ],
  exports: [
    DecisionOsSloService,
    ValidationGatewayService,
    ValidationGatewayExtensionService,
    ContingencyOrchestratorService,
    DecisionDnaComplianceService,
  ],
})
export class DecisionOsP0Module {}
