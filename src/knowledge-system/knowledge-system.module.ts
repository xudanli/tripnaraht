import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TravelMemoryModule } from '../travel-memory/travel-memory.module';
import { KnowledgeEntitiesAdminController } from './admin/knowledge-entities-admin.controller';
import { KnowledgeWorldStateAdminController } from './admin/knowledge-world-state-admin.controller';
import { KnowledgeRelationsAdminController } from './admin/knowledge-relations-admin.controller';
import { KnowledgeTravelerContextAdminController } from './admin/knowledge-traveler-context-admin.controller';
import { KnowledgeDecisionCasesAdminController } from './admin/knowledge-decision-cases-admin.controller';
import { KnowledgeSemanticAdminController } from './admin/knowledge-semantic-admin.controller';
import { KnowledgeGraphAdminController } from './admin/knowledge-graph-admin.controller';
import { KnowledgeOntologyAdminController } from './admin/knowledge-ontology-admin.controller';
import { EntityIdentityRegistryService } from './identity/entity-identity-registry.service';
import { KnowledgeEntityCreateFormService } from './identity/knowledge-entity-create-form.service';
import { KnowledgeIdentitySyncService } from './identity/knowledge-identity-sync.service';
import { KnowledgeWorldStateService } from './world-state/knowledge-world-state.service';
import { KnowledgeRelationRegistryService } from './relations/knowledge-relation-registry.service';
import { KnowledgeTravelerContextService } from './traveler-context/knowledge-traveler-context.service';
import { KnowledgeDecisionCaseService } from './decision-knowledge/knowledge-decision-case.service';
import { KnowledgeSemanticService } from './semantic/knowledge-semantic.service';
import { KnowledgeGraphService } from './graph/knowledge-graph.service';
import { KnowledgeOntologyService } from './ontology/knowledge-ontology.service';

/**
 * Knowledge System — Phase 1–6 + Graph + Ontology Admin views.
 */
@Module({
  imports: [AuthModule, PrismaModule, TravelMemoryModule],
  controllers: [
    KnowledgeEntitiesAdminController,
    KnowledgeWorldStateAdminController,
    KnowledgeRelationsAdminController,
    KnowledgeTravelerContextAdminController,
    KnowledgeDecisionCasesAdminController,
    KnowledgeSemanticAdminController,
    KnowledgeGraphAdminController,
    KnowledgeOntologyAdminController,
  ],
  providers: [
    EntityIdentityRegistryService,
    KnowledgeEntityCreateFormService,
    KnowledgeIdentitySyncService,
    KnowledgeWorldStateService,
    KnowledgeRelationRegistryService,
    KnowledgeTravelerContextService,
    KnowledgeDecisionCaseService,
    KnowledgeSemanticService,
    KnowledgeGraphService,
    KnowledgeOntologyService,
    AdminStrictAuthGuard,
  ],
  exports: [
    EntityIdentityRegistryService,
    KnowledgeIdentitySyncService,
    KnowledgeWorldStateService,
    KnowledgeRelationRegistryService,
    KnowledgeTravelerContextService,
    KnowledgeDecisionCaseService,
    KnowledgeSemanticService,
    KnowledgeGraphService,
    KnowledgeOntologyService,
  ],
})
export class KnowledgeSystemModule {}
