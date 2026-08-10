/**
 * RealityOS P0-B — Rental handover EvidencePackage (data save; PDF = P0.5).
 * AI may flag suspected damage; never assigns liability / never auto-emails lessor.
 */

export type RentalHandoverType = 'PICKUP' | 'RETURN';

export type RentalCaptureView =
  | 'FRONT_LEFT'
  | 'FRONT_RIGHT'
  | 'REAR_LEFT'
  | 'REAR_RIGHT'
  | 'LEFT'
  | 'RIGHT'
  | 'FRONT'
  | 'REAR'
  | 'ROOF_OR_WINDSHIELD'
  | 'TIRES'
  | 'DASHBOARD'
  | 'FUEL_OR_CHARGE';

export const RENTAL_P0_REQUIRED_VIEWS: RentalCaptureView[] = [
  'FRONT_LEFT',
  'FRONT_RIGHT',
  'REAR_LEFT',
  'REAR_RIGHT',
  'LEFT',
  'RIGHT',
  'FRONT',
  'REAR',
  'DASHBOARD',
];

export type EvidencePackageExportStatus =
  | 'NOT_REQUESTED'
  | 'GENERATING'
  | 'READY'
  | 'FAILED';

export interface RentalEvidencePackage {
  packageId: string;
  tripId: string;
  observationId: string;
  type: 'RENTAL_PICKUP' | 'RENTAL_RETURN';
  handoverType: RentalHandoverType;
  observationIds: string[];
  mediaRefs: string[];
  mediaHashes: string[];
  bookingId?: string;
  /** Masked plate for display e.g. IS-***-12 */
  plateMasked?: string;
  vehicleModel?: string;
  mileage?: number | string;
  fuelOrChargeLevel?: string;
  suspectedDamageAreas: string[];
  userConfirmedDamage: string[];
  requiredViews: RentalCaptureView[];
  capturedViews: RentalCaptureView[];
  missingViews: RentalCaptureView[];
  complete: boolean;
  /** Never true for liability — AI flags only */
  liabilityAssigned: false;
  autoSentToLessor: false;
  generatedAt: string;
  exportStatus: EvidencePackageExportStatus;
  writesPlanVersion: false;
}

export interface RentalHandoverHints {
  handoverType?: RentalHandoverType;
  bookingId?: string;
  plateMasked?: string;
  capturedViews?: RentalCaptureView[];
  requiredViews?: RentalCaptureView[];
  userConfirmedDamage?: string[];
}
