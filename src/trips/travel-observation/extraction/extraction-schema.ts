import Ajv, { type ValidateFunction } from 'ajv';
import type { RawVisualObservation } from './raw-visual.types';

/** JSON Schema for RawVisualObservation — fail closed */
export const RAW_VISUAL_OBSERVATION_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'nara-look/RawVisualObservation',
  type: 'object',
  additionalProperties: false,
  required: [
    'sceneType',
    'detectedObjects',
    'recognizedText',
    'extractedFacts',
    'uncertainties',
    'requiredAdditionalViews',
  ],
  properties: {
    sceneType: {
      type: 'string',
      enum: [
        'VEHICLE',
        'ROAD_ENTRY',
        'ROAD_SIGN',
        'ACTIVITY_ENTRY',
        'PARKING_SIGN',
        'RENTAL_HANDOVER',
        'UNKNOWN',
      ],
    },
    detectedObjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'confidence'],
        properties: {
          type: { type: 'string', minLength: 1 },
          subtype: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          boundingBox: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'w', 'h'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
          },
        },
      },
    },
    recognizedText: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'confidence'],
        properties: {
          text: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          boundingBox: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'w', 'h'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
          },
        },
      },
    },
    extractedFacts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value', 'confidence'],
        properties: {
          key: { type: 'string', minLength: 1 },
          value: {},
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'string' },
    },
    requiredAdditionalViews: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(RAW_VISUAL_OBSERVATION_SCHEMA);

export type SchemaValidationResult =
  | { ok: true; value: RawVisualObservation }
  | { ok: false; errors: string[] };

export function validateRawVisualObservation(
  candidate: unknown,
): SchemaValidationResult {
  if (validateFn(candidate)) {
    return { ok: true, value: candidate as RawVisualObservation };
  }
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`,
  );
  return { ok: false, errors };
}
