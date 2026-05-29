import { z } from 'zod';

const timeWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const seasonSchema = z.object({
  name: z.string(),
  months: z.array(z.number().int().min(1).max(12)),
  avgDaylightHours: z.number().optional(),
  outdoorRoutingWindow: timeWindowSchema.optional(),
  recommendedCarType: z
    .enum([
      'ANY',
      '2WD',
      '4WD_SUV',
      '4WD_SUV_STUDDED_TIRES',
      '2WD_WITH_SNOW_CHAINS_OR_4WD',
    ])
    .optional(),
});

export const countryProfileV2TimeBoundariesSchema = z.object({
  daylightFluctuation: z.boolean().optional(),
  seasons: z.array(seasonSchema).optional(),
  environmentalTriggers: z
    .object({
      weatherAlertSource: z.string().url().optional(),
      roadStatusSource: z.string().url().optional(),
      autoRerouteTriggers: z.array(z.string()).optional(),
    })
    .optional(),
});

export const countryProfileV2DrivingRulesSchema = z.object({
  minAge: z.number().int().optional(),
  drivingSide: z.enum(['LEFT', 'RIGHT']).optional(),
  requiresInternationalLicense: z.boolean().optional(),
  requires4x4ForFRoad: z.boolean().optional(),
  gravelRoadPresent: z.boolean().optional(),
  acceptedLicenseTypes: z.array(z.string()).optional(),
  speedLimits: z
    .object({
      urban: z.number().optional(),
      gravelRoad: z.number().optional(),
      asphaltHighway: z.number().optional(),
      algorithmEtaPenaltyCoefficients: z
        .object({
          gravelRoad: z.number().positive().optional(),
          fRoad: z.number().positive().optional(),
          mountainPassRoad: z.number().positive().optional(),
          winterBlackIceRoad: z.number().positive().optional(),
        })
        .optional(),
  leftHandDrivingEtaBuffer: z.number().min(0).max(1).optional(),
    })
    .optional(),
  specialRules: z.array(z.string()).optional(),
  infrastructure: z
    .object({
      selfServiceGasStation: z.boolean().optional(),
      gasBrandRequiredApp: z.array(z.string()).optional(),
      tollRoads: z.array(z.string()).optional(),
    })
    .optional(),
});

export const countryProfileV2EntryRequirementSchema = z.object({
  cost: z.number().optional(),
  link: z.string().optional(),
  status: z.string().optional(),
  statusLabel: z.string().optional(),
  statusLabelCN: z.string().optional(),
  statusCN: z.string().optional(),
  requirementSummary: z.string().optional(),
  requirementSummaryCN: z.string().optional(),
  requirement: z.string().optional(),
  requirementCN: z.string().optional(),
  allowedStay: z.string().optional(),
  allowedStayCN: z.string().optional(),
  schengenZone: z.boolean().optional(),
  visaApplicationLeadTimeDays: z.number().int().positive().optional(),
  nzetaAvailableForPassports: z.array(z.string()).optional(),
});

export const countryProfileV2EntryRequirementsSchema = z.object({
  officialLink: z.string().url().optional(),
  byNationality: z
    .record(z.string().regex(/^[A-Za-z]{2}$/), countryProfileV2EntryRequirementSchema)
    .transform((rec) => {
      const out: Record<string, z.infer<typeof countryProfileV2EntryRequirementSchema>> = {};
      for (const [k, v] of Object.entries(rec)) {
        out[k.toUpperCase()] = v;
      }
      return out;
    }),
});

export const countryProfileV2SeedSchema = z.object({
  schemaVersion: z.literal(2),
  isoCode: z.string().length(2),
  nameCN: z.string(),
  nameEN: z.string().optional(),
  currencyCode: z.string().optional(),
  currencyName: z.string().optional(),
  exchangeRateToCNY: z.number().optional(),
  exchangeRateToUSD: z.number().optional(),
  paymentType: z
    .enum(['CASH_HEAVY', 'BALANCED', 'DIGITAL_ONLY', 'HYBRID_DIGITAL_PREFER'])
    .optional(),
  paymentInfo: z.record(z.string(), z.unknown()).optional(),
  powerInfo: z.record(z.string(), z.unknown()).optional(),
  emergency: z.record(z.string(), z.unknown()).optional(),
  entryRequirements: countryProfileV2EntryRequirementsSchema.optional(),
  /** @deprecated — merged into entryRequirements.byNationality.CN on ingest */
  visaForCN: countryProfileV2EntryRequirementSchema.optional(),
  complianceInfo: z.record(z.string(), z.unknown()).optional(),
  timeBoundaries: countryProfileV2TimeBoundariesSchema.optional(),
  travelCulture: z.record(z.string(), z.unknown()).optional(),
});

export type CountryProfileV2Seed = z.infer<typeof countryProfileV2SeedSchema>;

/** Admin PATCH — all fields optional except schemaVersion stays 2 when present */
export const countryProfileV2SeedPartialSchema = countryProfileV2SeedSchema
  .partial()
  .extend({
    schemaVersion: z.literal(2).optional(),
    isoCode: z.string().length(2).optional(),
  });

export type CountryProfileV2SeedPartial = z.infer<typeof countryProfileV2SeedPartialSchema>;
