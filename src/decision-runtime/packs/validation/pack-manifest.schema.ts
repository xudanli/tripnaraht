/**
 * RFC-002 — Zod schema for DestinationPackManifest (Pack Certification step 1).
 */

import { z } from 'zod';

const packLayer = z.enum(['GLOBAL', 'COUNTRY', 'REGION', 'ACTIVITY', 'OPERATOR']);
const packStatus = z.enum(['DRAFT', 'SHADOW', 'ACTIVE', 'DEPRECATED']);

export const destinationPackManifestSchema = z.object({
  packId: z.string().min(1),
  version: z.string().min(1),
  layer: packLayer,
  status: packStatus,
  scope: z.object({
    countries: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    activityTypes: z.array(z.string()).optional(),
    operatorIds: z.array(z.string()).optional(),
  }),
  supportedSemanticKeys: z.array(z.string()).min(1),
  evidenceProviders: z
    .array(
      z.object({
        domain: z.string(),
        primary: z.string(),
        fallback: z.string().optional(),
      }),
    )
    .optional(),
  ruleBundles: z
    .array(z.object({ path: z.string(), version: z.string().optional() }))
    .optional(),
  environmentModifiers: z
    .array(z.object({ path: z.string(), version: z.string().optional() }))
    .optional(),
  ontologyMappings: z
    .array(z.object({ path: z.string(), version: z.string().optional() }))
    .optional(),
  repairTemplateBundles: z
    .array(z.object({ path: z.string(), version: z.string().optional() }))
    .optional(),
  dependencies: z
    .array(
      z.object({
        packId: z.string(),
        version: z.string().optional(),
        optional: z.boolean().optional(),
      }),
    )
    .optional(),
  fallbackPackId: z.string().optional(),
  validFrom: z.string(),
  validUntil: z.string().optional(),
  owner: z.string().optional(),
});

export type ParsedDestinationPackManifest = z.infer<typeof destinationPackManifestSchema>;
