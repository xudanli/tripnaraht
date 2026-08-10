/**
 * Read-only catalog for Iceland self-drive wizard (regions / locations / vehicles / bookable places).
 */

import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  ICELAND_SELF_DRIVE_BOOKING_KINDS,
  type IcelandSelfDriveBookingKind,
} from './dto/iceland-self-drive-enums';
import { IcelandSelfDriveCatalogService } from './services/iceland-self-drive-catalog.service';
import { IcelandSelfDriveBookablePlacesService } from './services/iceland-self-drive-bookable-places.service';

@ApiTags('Iceland Self-Drive Catalog')
@Public()
@Controller('iceland-self-drive')
export class IcelandSelfDriveCatalogController {
  constructor(
    private readonly catalog: IcelandSelfDriveCatalogService,
    private readonly bookablePlaces: IcelandSelfDriveBookablePlacesService,
  ) {}

  @Get('regions')
  @ApiOperation({ summary: 'List wizard regions' })
  listRegions() {
    return this.catalog.listRegions();
  }

  @Get('locations')
  @ApiOperation({ summary: 'List start/end location codes' })
  listLocations() {
    return this.catalog.listLocations();
  }

  /** iOS 契约路径：/api/iceland-self-drive/catalog/vehicle-classes */
  @Get('catalog/vehicle-classes')
  @ApiOperation({ summary: 'List vehicle classes' })
  listVehicleClasses() {
    return this.catalog.listVehicleClasses();
  }

  /** iOS 契约路径：/api/iceland-self-drive/catalog/rental-companies */
  @Get('catalog/rental-companies')
  @ApiOperation({ summary: 'List rental companies' })
  listRentalCompanies() {
    return this.catalog.listRentalCompanies();
  }

  /** @deprecated 兼容旧路径（无 catalog 前缀） */
  @Get('vehicle-classes')
  listVehicleClassesLegacy() {
    return this.catalog.listVehicleClasses();
  }

  /** @deprecated 兼容旧路径（无 catalog 前缀） */
  @Get('rental-companies')
  listRentalCompaniesLegacy() {
    return this.catalog.listRentalCompanies();
  }

  @Get('daylight-hint')
  @ApiOperation({ summary: 'Daylight hint for date range' })
  daylightHint(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.catalog.getDaylightHint(startDate, endDate);
  }

  @Get('bookable-places')
  @ApiOperation({
    summary: 'Search Iceland lodging / activity places (trip-less catalog)',
  })
  @ApiQuery({
    name: 'kind',
    required: true,
    enum: ICELAND_SELF_DRIVE_BOOKING_KINDS,
  })
  @ApiQuery({
    name: 'regionIds',
    required: false,
    description: 'Comma-separated region ids, e.g. south_coast,snaefellsnes',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false })
  searchBookablePlaces(
    @Query('kind') kind: string,
    @Query('regionIds') regionIdsRaw?: string,
    @Query('q') q?: string,
    @Query('limit') limitRaw?: string,
  ) {
    if (
      !(ICELAND_SELF_DRIVE_BOOKING_KINDS as readonly string[]).includes(kind)
    ) {
      throw new BadRequestException({
        code: 'INVALID_BOOKING_KIND',
        message: `kind must be one of: ${ICELAND_SELF_DRIVE_BOOKING_KINDS.join(', ')}`,
      });
    }

    const regionIds = (regionIdsRaw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const limit =
      limitRaw != null && limitRaw !== ''
        ? Number.parseInt(limitRaw, 10)
        : undefined;

    return this.bookablePlaces.search({
      kind: kind as IcelandSelfDriveBookingKind,
      q,
      regionIds: regionIds.length ? regionIds : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }
}
