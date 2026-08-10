import {
  ICELAND_SELF_DRIVE_VEHICLE_CLASSES,
  type IcelandSelfDriveFuelType,
  type IcelandSelfDriveVehicleClass,
} from '../dto/iceland-self-drive-enums';

export interface IcelandSelfDriveRentalCompanyCatalogItem {
  id: string;
  nameZh: string;
  nameEn: string;
}

export interface IcelandSelfDriveVehicleClassCatalogItem {
  code: IcelandSelfDriveVehicleClass;
  labelZh: string;
  labelEn: string;
  defaultIs4wd: boolean | null;
  defaultFuelType: IcelandSelfDriveFuelType | null;
  defaultIsHighBody: boolean | null;
  defaultEstimatedRangeKm: number | null;
}

export const RENTAL_COMPANY_CATALOG: IcelandSelfDriveRentalCompanyCatalogItem[] = [
  {
    id: 'blue_car_rental',
    nameZh: 'Blue Car Rental',
    nameEn: 'Blue Car Rental',
  },
  {
    id: 'hertz',
    nameZh: 'Hertz 冰岛',
    nameEn: 'Hertz Iceland',
  },
  {
    id: 'avis',
    nameZh: 'Avis',
    nameEn: 'Avis',
  },
  {
    id: 'europcar',
    nameZh: 'Europcar',
    nameEn: 'Europcar',
  },
  {
    id: 'go_car_rental',
    nameZh: 'Go Car Rental',
    nameEn: 'Go Car Rental',
  },
  {
    id: 'lotus_car_rental',
    nameZh: 'Lotus Car Rental',
    nameEn: 'Lotus Car Rental',
  },
  {
    id: 'sad_cars',
    nameZh: 'SAD Cars',
    nameEn: 'SAD Cars',
  },
  {
    id: 'other',
    nameZh: '其他 / 自填',
    nameEn: 'Other',
  },
];

export const VEHICLE_CLASS_CATALOG: IcelandSelfDriveVehicleClassCatalogItem[] = [
  {
    code: 'sedan_2wd',
    labelZh: '两驱轿车',
    labelEn: '2WD Sedan',
    defaultIs4wd: false,
    defaultFuelType: 'gasoline',
    defaultIsHighBody: false,
    defaultEstimatedRangeKm: 550,
  },
  {
    code: 'crossover',
    labelZh: '跨界 / 软路 SUV',
    labelEn: 'Crossover',
    defaultIs4wd: false,
    defaultFuelType: 'gasoline',
    defaultIsHighBody: true,
    defaultEstimatedRangeKm: 500,
  },
  {
    code: 'suv_4wd',
    labelZh: 'Toyota RAV4 或同级',
    labelEn: 'Toyota RAV4 or similar',
    defaultIs4wd: true,
    defaultFuelType: 'gasoline',
    defaultIsHighBody: true,
    defaultEstimatedRangeKm: 500,
  },
  {
    code: 'camper',
    labelZh: '房车 / Campervan',
    labelEn: 'Campervan',
    defaultIs4wd: false,
    defaultFuelType: 'diesel',
    defaultIsHighBody: true,
    defaultEstimatedRangeKm: 450,
  },
  {
    code: 'unknown',
    labelZh: '尚未确定',
    labelEn: 'Unknown',
    defaultIs4wd: null,
    defaultFuelType: null,
    defaultIsHighBody: null,
    defaultEstimatedRangeKm: null,
  },
];

export function listRentalCompanyCatalog(): IcelandSelfDriveRentalCompanyCatalogItem[] {
  return [...RENTAL_COMPANY_CATALOG];
}

export function listVehicleClassCatalog(): IcelandSelfDriveVehicleClassCatalogItem[] {
  return [...VEHICLE_CLASS_CATALOG];
}

export function defaultLabelForVehicleClass(
  code: IcelandSelfDriveVehicleClass,
): string | null {
  const item = VEHICLE_CLASS_CATALOG.find((c) => c.code === code);
  return item?.labelZh ?? null;
}

export function findVehicleClassDefaults(
  code: IcelandSelfDriveVehicleClass,
): IcelandSelfDriveVehicleClassCatalogItem | undefined {
  return VEHICLE_CLASS_CATALOG.find((c) => c.code === code);
}

/** 校验 catalog 覆盖全部枚举（测试用） */
export function assertVehicleClassCatalogComplete(): boolean {
  return ICELAND_SELF_DRIVE_VEHICLE_CLASSES.every((code) =>
    VEHICLE_CLASS_CATALOG.some((c) => c.code === code),
  );
}
