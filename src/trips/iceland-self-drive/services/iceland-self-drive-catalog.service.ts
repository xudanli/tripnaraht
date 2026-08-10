import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  listLocationCatalog,
  listRegionCatalog,
} from '../dictionaries/iceland-self-drive-catalog';
import {
  listRentalCompanyCatalog,
  listVehicleClassCatalog,
} from '../dictionaries/iceland-self-drive-vehicle-catalog';
import { computeDaylightHint } from './iceland-self-drive-daylight-hint.util';

@Injectable()
export class IcelandSelfDriveCatalogService {
  listRegions() {
    return { items: listRegionCatalog() };
  }

  listLocations() {
    return { items: listLocationCatalog() };
  }

  listRentalCompanies() {
    return { items: listRentalCompanyCatalog() };
  }

  listVehicleClasses() {
    return { items: listVehicleClassCatalog() };
  }

  getDaylightHint(startDate: string, endDate: string) {
    this.assertYmd(startDate, 'startDate');
    this.assertYmd(endDate, 'endDate');
    const start = DateTime.fromISO(startDate, { zone: 'utc' });
    const end = DateTime.fromISO(endDate, { zone: 'utc' });
    if (!start.isValid || !end.isValid || end < start) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'endDate must be >= startDate (yyyy-MM-dd)',
      });
    }
    try {
      return computeDaylightHint(startDate, endDate);
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid date range',
      });
    }
  }

  private assertYmd(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${field} must be yyyy-MM-dd`,
      });
    }
  }
}
