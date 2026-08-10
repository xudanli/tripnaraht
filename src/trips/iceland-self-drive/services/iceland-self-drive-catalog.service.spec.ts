import { BadRequestException } from '@nestjs/common';
import { IcelandSelfDriveCatalogService } from './iceland-self-drive-catalog.service';
import { computeDaylightHint } from './iceland-self-drive-daylight-hint.util';
import { listLocationCatalog, listRegionCatalog } from '../dictionaries/iceland-self-drive-catalog';
import {
  assertVehicleClassCatalogComplete,
  listRentalCompanyCatalog,
  listVehicleClassCatalog,
} from '../dictionaries/iceland-self-drive-vehicle-catalog';

describe('iceland-self-drive P2 catalog + daylight', () => {
  it('lists all regions with zh/en, cover urls, and supportLevel', () => {
    const items = listRegionCatalog();
    expect(items).toHaveLength(9);
    expect(items.find((r) => r.id === 'south_coast')).toMatchObject({
      nameZh: '南岸',
      nameEn: 'South Coast',
      supportLevel: 'full',
    });
    expect(items.find((r) => r.id === 'snaefellsnes')?.supportLevel).toBe('full');
    expect(items.find((r) => r.id === 'north')?.supportLevel).toBe('full');
    expect(items.find((r) => r.id === 'westfjords')?.supportLevel).toBe('full');
    expect(items.find((r) => r.id === 'highlands')?.supportLevel).toBe('full');
    expect(items.find((r) => r.id === 'east_fjords')?.supportLevel).toBe(
      'partial',
    );
    expect(items.find((r) => r.id === 'ring_road')?.supportLevel).toBe('corridor');
    expect(items[0]?.coverImageUrl).toContain('/regions/');
  });

  it('lists start/end locations', () => {
    const items = listLocationCatalog();
    expect(items).toHaveLength(3);
    expect(items.find((l) => l.code === 'keflavik')?.pickupCode).toBe('KEF');
  });

  it('lists rental companies and vehicle classes', () => {
    expect(assertVehicleClassCatalogComplete()).toBe(true);
    expect(listRentalCompanyCatalog().find((c) => c.id === 'blue_car_rental')).toBeTruthy();
    expect(listVehicleClassCatalog().find((c) => c.code === 'suv_4wd')).toMatchObject({
      defaultIs4wd: true,
      defaultFuelType: 'gasoline',
    });
  });

  it('computeDaylightHint for February trip matches product shape', () => {
    const hint = computeDaylightHint('2027-02-10', '2027-02-18');
    expect(hint.dayCount).toBe(9);
    expect(hint.nightCount).toBe(8);
    expect(hint.seasonLabel).toContain('2月');
    expect(hint.daylightHoursMin).toBeGreaterThanOrEqual(4);
    expect(hint.daylightHoursMax).toBeGreaterThanOrEqual(hint.daylightHoursMin);
    expect(hint.daylightLabel).toContain('日照');
  });

  it('catalog service validates query dates', () => {
    const svc = new IcelandSelfDriveCatalogService();
    expect(() => svc.getDaylightHint('bad', '2027-02-18')).toThrow(
      BadRequestException,
    );
    expect(() => svc.getDaylightHint('2027-02-18', '2027-02-10')).toThrow(
      BadRequestException,
    );
    const ok = svc.getDaylightHint('2027-02-10', '2027-02-18');
    expect(ok.dayCount).toBe(9);
    expect(svc.listRegions().items).toHaveLength(9);
    expect(svc.listLocations().items).toHaveLength(3);
    expect(svc.listRentalCompanies().items.length).toBeGreaterThan(0);
    expect(svc.listVehicleClasses().items).toHaveLength(5);
  });
});
