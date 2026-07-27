import { Module } from '@nestjs/common';
import { WorldFactsModule } from '../world-facts/world-facts.module';
import { TripOntologyFactsLoaderService } from './services/trip-ontology-facts-loader.service';
import { TripOntologyFactsIngestService } from './services/trip-ontology-facts-ingest.service';
import { OntologyCanonicalApplyService } from './services/ontology-canonical-apply.service';

@Module({
  imports: [WorldFactsModule],
  providers: [
    TripOntologyFactsLoaderService,
    TripOntologyFactsIngestService,
    OntologyCanonicalApplyService,
  ],
  exports: [
    TripOntologyFactsLoaderService,
    TripOntologyFactsIngestService,
    OntologyCanonicalApplyService,
  ],
})
export class TravelOntologyModule {}
