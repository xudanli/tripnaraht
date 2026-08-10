import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ObservationFact } from '../observation.types';
import { validateRawVisualObservation } from './extraction-schema';
import {
  assertNoForbiddenDecisionLanguage,
  stripCommandLikeFacts,
} from './forbidden-output.guard';
import { HeuristicExtractionProvider } from './heuristic-extraction.provider';
import { mapRawVisualToObservationFacts } from './observation-ontology.mapper';
import {
  OBSERVATION_EXTRACTION_PROVIDER,
  type ExtractionOutcome,
  type ObservationExtractionProvider,
} from './provider.interface';
import type {
  ObservationModelInput,
  RawVisualObservation,
} from './raw-visual.types';

export interface ExtractionResultOk {
  ok: true;
  raw: RawVisualObservation;
  facts: ObservationFact[];
  providerId: string;
}

export type ExtractionFailReason = Extract<
  ExtractionOutcome,
  { ok: false }
>['reason'];

export interface ExtractionResultFail {
  ok: false;
  reason: ExtractionFailReason;
  errors: string[];
  providerId: string;
}

@Injectable()
export class ObservationExtractionService {
  private readonly provider: ObservationExtractionProvider;

  constructor(
    heuristic: HeuristicExtractionProvider,
    @Optional()
    @Inject(OBSERVATION_EXTRACTION_PROVIDER)
    overrideProvider?: ObservationExtractionProvider,
  ) {
    this.provider = overrideProvider ?? heuristic;
  }

  async extract(input: ObservationModelInput): Promise<
    ExtractionResultOk | ExtractionResultFail
  > {
    const providerId = this.provider.providerId;
    let candidate: unknown;
    try {
      candidate = await this.provider.extract(input);
    } catch (e) {
      return {
        ok: false,
        reason: 'PROVIDER_ERROR',
        errors: [e instanceof Error ? e.message : String(e)],
        providerId,
      };
    }

    const validated = validateRawVisualObservation(candidate);
    if (validated.ok === false) {
      return {
        ok: false,
        reason: 'SCHEMA_INVALID',
        errors: validated.errors,
        providerId,
      };
    }

    const raw = {
      ...validated.value,
      extractedFacts: stripCommandLikeFacts(validated.value.extractedFacts),
    };

    try {
      assertNoForbiddenDecisionLanguage([
        ...raw.recognizedText.map((t) => t.text),
        ...raw.uncertainties,
        ...raw.requiredAdditionalViews,
        ...raw.extractedFacts.map((f) =>
          typeof f.value === 'string' ? f.value : '',
        ),
      ]);
    } catch (e) {
      return {
        ok: false,
        reason: 'FORBIDDEN_LANGUAGE',
        errors: [e instanceof Error ? e.message : String(e)],
        providerId,
      };
    }

    const facts = mapRawVisualToObservationFacts(raw);
    return { ok: true, raw, facts, providerId };
  }
}
