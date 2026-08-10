import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IcelandSelfDriveDrivingSettingsService } from './iceland-self-drive-driving-settings.service';
import { buildInitialDrivingSettings } from './iceland-self-drive-completion.util';

function baseIsdMeta() {
  return {
    productLine: 'iceland_self_drive' as const,
    idempotencyKey: 'k1',
    contextVersion: 'cv_1',
    wizard: {
      destinationCode: 'IS' as const,
      productLine: 'iceland_self_drive' as const,
      dateRange: { startDate: '2027-02-10', endDate: '2027-02-18' },
      arrivalAt: null,
      departureAt: null,
      travelerCount: 4,
      startLocationCode: 'keflavik' as const,
      endLocationCode: 'keflavik' as const,
      endSameAsStart: true,
      vehicleAcquisition: 'rent' as const,
      regionIds: ['south_coast' as const, 'ring_road' as const],
      bookings: [],
      skipBookings: true,
      fillBookingsLater: false,
    },
    drivingSettings: buildInitialDrivingSettings('rent'),
    routeSkeleton: {
      strategyId: 'coverage-ring-compressed',
      regionSummary: '南岸 + 环岛',
      days: [],
    },
    hardAnchors: [],
    warnings: [],
    createdAt: '2027-01-01T00:00:00.000Z',
    generationStatus: 'READY' as const,
  };
}

function mockPrisma(tripRow: unknown, update = jest.fn().mockResolvedValue({})) {
  return {
    trip: {
      findUnique: jest.fn().mockResolvedValue(tripRow),
      update,
    },
    tripCollaborator: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u1', displayName: 'Danny', email: 'd@x.com', avatarUrl: null },
        { id: 'u2', displayName: 'Amy', email: 'a@x.com', avatarUrl: null },
      ]),
    },
    userProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

describe('IcelandSelfDriveDrivingSettingsService', () => {
  it('GET returns aggregated settings with fuel/insurance items and real candidates', async () => {
    const prisma = mockPrisma({
      id: 'trip-1',
      metadata: { icelandSelfDrive: baseIsdMeta() },
      TripCollaborator: [{ userId: 'u1' }],
    });
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    const res = await svc.get('u1', 'trip-1');
    expect(res.tripId).toBe('trip-1');
    expect(res.items).toHaveLength(6);
    expect(res.items.map((i) => i.code)).toEqual(
      expect.arrayContaining(['fuel', 'insurance', 'drivers']),
    );
    const drivers = res.items.find((i) => i.code === 'drivers')?.payload as {
      candidates: Array<{ memberId: string; displayName: string }>;
    };
    expect(drivers.candidates).toHaveLength(2);
    expect(drivers.candidates[0]?.displayName).toBe('Danny');
    expect(res.routeHint?.code).toBe('GRAVEL_EXPOSURE');
    expect(res.contextVersion).toBe('cv_1');
  });

  it('PATCH merges fields including fuel/insurance and bumps contextVersion', async () => {
    const meta = baseIsdMeta();
    const update = jest.fn().mockResolvedValue({});
    const prisma = mockPrisma(
      {
        id: 'trip-1',
        metadata: { icelandSelfDrive: meta, tripVersion: 1 },
        TripCollaborator: [{ userId: 'u1' }],
      },
      update,
    );
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    const res = await svc.patch('u1', 'trip-1', {
      vehicle: {
        vehicleClass: 'suv_4wd',
        is4wd: true,
        rentalCompanyId: 'blue_car_rental',
        rentalCompanyName: 'Blue Car Rental',
        fuelType: 'gasoline',
        isHighBody: true,
        estimatedRangeKm: 500,
        rentalRestrictions: ['no_f_road', 'no_wading'],
        source: 'manual',
      },
      drivers: {
        dailyDrivingLimitHours: 5,
        experienceLevel: 'intermediate',
        candidates: [
          {
            memberId: 'u1',
            isSelected: true,
            role: 'main',
            snowExperience: 'familiar',
            gravelExperience: 'average',
            nightAcceptance: 'avoid',
          },
          {
            memberId: 'u2',
            isSelected: true,
            role: 'additional',
            snowExperience: 'limited',
            gravelExperience: 'limited',
            nightAcceptance: 'reject',
          },
        ],
      },
      routePreference: {
        pacePreference: 'safe',
        fRoadPreference: 'avoid',
        waterCrossingPreference: 'avoid',
        dailyDrivingLimitHours: 5,
      },
      fuel: {
        fuelType: 'gasoline',
        refuelStrategy: 'early',
        useDynamicSafetyMargin: true,
      },
      insurance: {
        userAcknowledgedCodes: ['wading'],
        syncRentalRestrictions: true,
      },
    });

    expect(res.contextVersion).toBe('cv_2');
    expect(res.items.find((i) => i.code === 'vehicle')?.status).toBe('completed');
    expect(res.items.find((i) => i.code === 'fuel')?.status).toBe('completed');
    expect(res.items.find((i) => i.code === 'insurance')?.payload).toMatchObject({
      fordAlwaysExcluded: true,
    });
    const saved = update.mock.calls[0][0].data.metadata.icelandSelfDrive;
    expect(saved.drivingSettings.vehicle.vehicleClass).toBe('suv_4wd');
    expect(saved.drivingSettings.drivers.driverCount).toBe(2);
    expect(saved.drivingSettings.fuel.configured).toBe(true);
    expect(saved.drivingSettings.insurance.userAcknowledgedCodes).toContain('wading');
    expect(saved.drivingSettings.vehicle.rentalRestrictions).toContain('no_wading');
  });

  it('rejects unknown memberId in candidates', async () => {
    const prisma = mockPrisma({
      id: 'trip-1',
      metadata: { icelandSelfDrive: baseIsdMeta() },
      TripCollaborator: [{ userId: 'u1' }],
    });
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    await expect(
      svc.patch('u1', 'trip-1', {
        drivers: {
          candidates: [{ memberId: 'ghost', isSelected: true, role: 'main' }],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previewImpact merges draft vehicle without persisting', async () => {
    const prisma = mockPrisma({
      id: 'trip-1',
      metadata: { icelandSelfDrive: baseIsdMeta() },
      TripCollaborator: [{ userId: 'u1' }],
    });
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    const res = await svc.previewImpact('u1', 'trip-1', {
      vehicle: {
        vehicleClass: 'sedan_2wd',
        is4wd: false,
        rentalRestrictions: ['no_f_road', 'no_wading'],
      },
      routePreference: { fRoadPreference: 'avoid' },
    });
    expect(res.blockedCapabilities).toEqual(
      expect.arrayContaining(['f_road', 'wading']),
    );
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it('reevaluate returns queued proposal shape', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = mockPrisma(
      {
        id: 'trip-1',
        metadata: { icelandSelfDrive: baseIsdMeta() },
        TripCollaborator: [{ userId: 'u1' }],
      },
      update,
    );
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    const res = await svc.reevaluate('u1', 'trip-1', {
      reason: 'insurance_constraints',
      source: 'insurance_settings',
    });
    expect(res.status).toBe('queued');
    expect(res.contextVersion).toBe('cv_2');
    expect(res.previewBullets.length).toBeGreaterThan(0);
  });

  it('upload + get vehicle document stores OCR draft', async () => {
    const meta = baseIsdMeta();
    const update = jest.fn().mockResolvedValue({});
    const prisma = mockPrisma(
      {
        id: 'trip-1',
        metadata: { icelandSelfDrive: meta },
        TripCollaborator: [{ userId: 'u1' }],
      },
      update,
    );
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    const uploaded = await svc.uploadVehicleDocument('u1', 'trip-1', {
      buffer: Buffer.from('fake-pdf'),
      originalname: 'order.png',
      mimetype: 'image/png',
      sourceHint: 'order_ocr',
    });
    expect(uploaded.status).toBe('ready');
    expect(uploaded.vehicleDraft.rentalCompanyId).toBe('blue_car_rental');

    const saved = update.mock.calls[0][0].data.metadata.icelandSelfDrive;
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      metadata: { icelandSelfDrive: saved },
      TripCollaborator: [{ userId: 'u1' }],
    });
    const got = await svc.getVehicleDocument('u1', 'trip-1', uploaded.docId);
    expect(got.docId).toBe(uploaded.docId);
  });

  it('rejects non-collaborator', async () => {
    const prisma = mockPrisma({
      id: 'trip-1',
      metadata: { icelandSelfDrive: baseIsdMeta() },
      TripCollaborator: [],
    });
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    await expect(svc.get('u2', 'trip-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects non iceland_self_drive trip', async () => {
    const prisma = mockPrisma({
      id: 'trip-1',
      metadata: { source: 'exploration' },
      TripCollaborator: [{ userId: 'u1' }],
    });
    const svc = new IcelandSelfDriveDrivingSettingsService(prisma as never);
    await expect(svc.get('u1', 'trip-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
