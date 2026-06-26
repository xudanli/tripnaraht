/**
 * Attribution Module
 *
 * Provides decision attribution capabilities for travel events.
 * This module is part of the Decision Intelligence Layer.
 * Round 3: Added Shapley Value attribution for self-evolution.
 */

import { Module } from '@nestjs/common';
import { DecisionAttributionService } from './services/decision-attribution.service';
import { AttributionEnrichmentService } from './services/attribution-enrichment.service';
import { ShapleyAttributionService } from './shapley-attribution.service';

@Module({
  providers: [
    DecisionAttributionService,
    AttributionEnrichmentService,
    ShapleyAttributionService,
  ],
  exports: [
    DecisionAttributionService,
    AttributionEnrichmentService,
    ShapleyAttributionService,
  ],
})
export class AttributionModule {}
