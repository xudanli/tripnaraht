import { randomUUID } from 'crypto';
import type {
  IcelandSelfDriveVehicleDocumentRecord,
  IcelandSelfDriveVehicleSettings,
} from '../types/iceland-self-drive.types';
import { findVehicleClassDefaults } from '../dictionaries/iceland-self-drive-vehicle-catalog';

export interface VehicleDocumentUploadInput {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  sourceHint?: 'order_ocr' | 'contract_ocr';
}

/**
 * MVP：不接真实 OCR，按文件名/体积启发式产出可合并草稿，供客户端确认后 PATCH。
 */
export function recognizeVehicleDocumentDraft(
  input: VehicleDocumentUploadInput,
): Pick<
  IcelandSelfDriveVehicleDocumentRecord,
  'vehicleDraft' | 'warnings' | 'status' | 'errorMessage'
> {
  if (!input.buffer || input.buffer.length === 0) {
    return {
      status: 'failed',
      vehicleDraft: {},
      warnings: [],
      errorMessage: 'Empty upload',
    };
  }

  const name = (input.originalname ?? '').toLowerCase();
  const source =
    input.sourceHint ??
    (name.includes('contract') || name.includes('合同')
      ? 'contract_ocr'
      : 'order_ocr');

  const warnings: string[] = ['wading_insurance_unconfirmed'];
  const fields: string[] = ['rentalCompany', 'vehicleClass', 'is4wd'];

  const suvDefaults = findVehicleClassDefaults('suv_4wd')!;
  const vehicleDraft: Partial<IcelandSelfDriveVehicleSettings> = {
    lifecycleStatus: 'booked_unconfirmed',
    acquisition: 'rent',
    rentalCompanyId: 'blue_car_rental',
    rentalCompanyName: 'Blue Car Rental',
    vehicleClass: 'suv_4wd',
    vehicleClassLabel: suvDefaults.labelZh,
    is4wd: true,
    fuelType: suvDefaults.defaultFuelType,
    isHighBody: suvDefaults.defaultIsHighBody,
    estimatedRangeKm: suvDefaults.defaultEstimatedRangeKm,
    rentalRestrictions: ['no_f_road', 'no_wading'],
    source,
    recognitionSummary: { fields, warnings },
  };

  if (name.includes('sedan') || name.includes('轿车')) {
    const sedan = findVehicleClassDefaults('sedan_2wd')!;
    vehicleDraft.vehicleClass = 'sedan_2wd';
    vehicleDraft.vehicleClassLabel = sedan.labelZh;
    vehicleDraft.is4wd = false;
    vehicleDraft.isHighBody = false;
    vehicleDraft.fuelType = sedan.defaultFuelType;
    vehicleDraft.estimatedRangeKm = sedan.defaultEstimatedRangeKm;
  }

  return {
    status: 'ready',
    vehicleDraft,
    warnings,
    errorMessage: undefined,
  };
}

export function createVehicleDocumentRecord(
  input: VehicleDocumentUploadInput,
): IcelandSelfDriveVehicleDocumentRecord {
  const now = new Date().toISOString();
  const recognized = recognizeVehicleDocumentDraft(input);
  return {
    docId: randomUUID(),
    status: recognized.status,
    createdAt: now,
    updatedAt: now,
    contentType: input.mimetype ?? null,
    fileName: input.originalname ?? null,
    vehicleDraft: recognized.vehicleDraft,
    warnings: recognized.warnings,
    errorMessage: recognized.errorMessage,
  };
}
