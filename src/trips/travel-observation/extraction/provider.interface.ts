import type {
  ObservationModelInput,
  RawVisualObservation,
} from './raw-visual.types';

export const OBSERVATION_EXTRACTION_PROVIDER = Symbol(
  'OBSERVATION_EXTRACTION_PROVIDER',
);

export interface ObservationExtractionProvider {
  readonly providerId: string;
  extract(input: ObservationModelInput): Promise<unknown>;
}

export type ExtractionOutcome =
  | {
      ok: true;
      raw: RawVisualObservation;
      providerId: string;
    }
  | {
      ok: false;
      reason: 'SCHEMA_INVALID' | 'FORBIDDEN_LANGUAGE' | 'PROVIDER_ERROR';
      errors: string[];
      providerId: string;
    };
