import {
  applyVehiclePatch,
  deriveVehicleLifecycleStatus,
  normalizeVehicleSettings,
} from './iceland-self-drive-vehicle.util';
import { recognizeVehicleDocumentDraft } from './iceland-self-drive-vehicle-document.util';
import { previewVehicleImpact } from './iceland-self-drive-driving-settings.util';
import { buildInitialDrivingSettings } from './iceland-self-drive-completion.util';

describe('iceland-self-drive vehicle util', () => {
  it('normalizes legacy vehicle payload and derives lifecycle', () => {
    const normalized = normalizeVehicleSettings(
      {
        acquisition: 'rent',
        vehicleClass: null,
        is4wd: null,
        rentalRestrictions: [],
      },
      'rent',
    );
    expect(normalized.lifecycleStatus).toBe('not_rented');
    expect(normalized.source).toBe('manual');
    expect(normalized.rentalCompanyId).toBeNull();
    expect(normalized.recognitionSummary).toBeNull();
  });

  it('derives booked_unconfirmed from rental company', () => {
    expect(
      deriveVehicleLifecycleStatus({
        vehicleClass: null,
        rentalCompanyId: 'blue_car_rental',
        pickupAt: null,
        source: 'manual',
      }),
    ).toBe('booked_unconfirmed');
  });

  it('applyVehiclePatch auto-fills label and lifecycle on class confirm', () => {
    const current = buildInitialDrivingSettings('rent').vehicle;
    const next = applyVehiclePatch(current, {
      vehicleClass: 'suv_4wd',
      is4wd: true,
    });
    expect(next.lifecycleStatus).toBe('model_confirmed');
    expect(next.vehicleClassLabel).toContain('RAV4');
  });

  it('recognizeVehicleDocumentDraft returns mergeable draft', () => {
    const res = recognizeVehicleDocumentDraft({
      buffer: Buffer.from('x'),
      originalname: 'contract.pdf',
    });
    expect(res.status).toBe('ready');
    expect(res.vehicleDraft.source).toBe('contract_ocr');
    expect(res.warnings).toContain('wading_insurance_unconfirmed');
  });

  it('previewVehicleImpact surfaces blocked capabilities', () => {
    const vehicle = applyVehiclePatch(buildInitialDrivingSettings('rent').vehicle, {
      vehicleClass: 'suv_4wd',
      is4wd: true,
      rentalRestrictions: ['no_f_road', 'no_wading'],
    });
    const preview = previewVehicleImpact({
      regionIds: ['highlands', 'ring_road'],
      vehicle,
    });
    expect(preview.blockedCapabilities).toEqual(
      expect.arrayContaining(['f_road', 'wading']),
    );
    expect(preview.impactSummary.length).toBeGreaterThan(0);
  });
});
