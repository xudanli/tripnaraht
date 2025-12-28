// src/places/services/iceland-poi-features.service.ts
/**
 * 冰岛 POI Features 服务
 * 
 * 为决策层（Abu/Dr.Dre/Neptune）提供结构化的 Geo/POI Features
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface IcelandPickupPoint {
  placeId: number;
  name: string;
  nameEN?: string;
  lat: number;
  lng: number;
  canonicalType: string;
  tags: Record<string, any>;
}

export interface IcelandAttraction {
  placeId: number;
  name: string;
  nameEN?: string;
  lat: number;
  lng: number;
  canonicalType: string;
  tags: Record<string, any>;
}

export interface IcelandGeoFeatures {
  transport: {
    airports: IcelandAttraction[];
    ferryTerminals: IcelandPickupPoint[];
    parking: IcelandAttraction[];
    hasAirport: boolean;
    hasFerryTerminal: boolean;
    totalTransportPoints: number;
  };
  attractions: {
    waterfalls: IcelandAttraction[];
    hotSprings: IcelandAttraction[];
    geysers: IcelandAttraction[];
    glaciers: IcelandAttraction[];
    volcanoes: IcelandAttraction[];
    beaches: IcelandAttraction[];
    viewpoints: IcelandAttraction[];
    totalAttractions: number;
  };
  safety: {
    hospitals: IcelandAttraction[];
    clinics: IcelandAttraction[];
    pharmacies: IcelandAttraction[];
    police: IcelandAttraction[];
    fireStations: IcelandAttraction[];
    hasHospital: boolean;
    hasClinic: boolean;
    hasPharmacy: boolean;
    totalSafetyPoints: number;
  };
  supply: {
    fuelStations: IcelandAttraction[];
    supermarkets: IcelandAttraction[];
    convenienceStores: IcelandAttraction[];
    toilets: IcelandAttraction[];
    hasFuel: boolean;
    hasSupermarket: boolean;
    hasConvenience: boolean;
    totalSupplyPoints: number;
  };
  services: {
    informationCenters: IcelandAttraction[];
    tourOperators: IcelandAttraction[];
    carRentals: IcelandAttraction[];
    camping: IcelandAttraction[];
    spaPools: IcelandAttraction[];
    totalServicePoints: number;
  };
}

@Injectable()
export class IcelandPoiFeaturesService {
  private readonly logger = new Logger(IcelandPoiFeaturesService.name);

  /**
   * 获取冰岛 Geo/POI Features
   * 
   * 用于决策层（Abu/Dr.Dre/Neptune）的输入
   */
  async getIcelandFeatures(region: string = 'IS_REYKJAVIK'): Promise<IcelandGeoFeatures> {
    this.logger.log(`获取 ${region} 的 POI Features...`);

    // 1. 获取交通节点
    const transportPoints = await this.getTransportPoints(region);
    
    // 2. 获取自然景点
    const attractions = await this.getAttractions(region);
    
    // 3. 获取安全保障点
    const safetyPoints = await this.getSafetyPoints(region);
    
    // 4. 获取补给点
    const supplyPoints = await this.getSupplyPoints(region);
    
    // 5. 获取服务点
    const servicePoints = await this.getServicePoints(region);

    return {
      transport: {
        airports: transportPoints.airports,
        ferryTerminals: transportPoints.ferryTerminals,
        parking: transportPoints.parking,
        hasAirport: transportPoints.airports.length > 0,
        hasFerryTerminal: transportPoints.ferryTerminals.length > 0,
        totalTransportPoints: transportPoints.total,
      },
      attractions: {
        waterfalls: attractions.waterfalls,
        hotSprings: attractions.hotSprings,
        geysers: attractions.geysers,
        glaciers: attractions.glaciers,
        volcanoes: attractions.volcanoes,
        beaches: attractions.beaches,
        viewpoints: attractions.viewpoints,
        totalAttractions: attractions.total,
      },
      safety: {
        hospitals: safetyPoints.hospitals,
        clinics: safetyPoints.clinics,
        pharmacies: safetyPoints.pharmacies,
        police: safetyPoints.police,
        fireStations: safetyPoints.fireStations,
        hasHospital: safetyPoints.hospitals.length > 0,
        hasClinic: safetyPoints.clinics.length > 0,
        hasPharmacy: safetyPoints.pharmacies.length > 0,
        totalSafetyPoints: safetyPoints.total,
      },
      supply: {
        fuelStations: supplyPoints.fuelStations,
        supermarkets: supplyPoints.supermarkets,
        convenienceStores: supplyPoints.convenienceStores,
        toilets: supplyPoints.toilets,
        hasFuel: supplyPoints.fuelStations.length > 0,
        hasSupermarket: supplyPoints.supermarkets.length > 0,
        hasConvenience: supplyPoints.convenienceStores.length > 0,
        totalSupplyPoints: supplyPoints.total,
      },
      services: {
        informationCenters: servicePoints.informationCenters,
        tourOperators: servicePoints.tourOperators,
        carRentals: servicePoints.carRentals,
        camping: servicePoints.camping,
        spaPools: servicePoints.spaPools,
        totalServicePoints: servicePoints.total,
      },
    };
  }

  /**
   * 获取交通节点
   */
  private async getTransportPoints(region: string): Promise<{
    airports: IcelandAttraction[];
    ferryTerminals: IcelandPickupPoint[];
    parking: IcelandAttraction[];
    total: number;
  }> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN ('AIRPORT', 'PORT_FERRY_TERMINAL', 'PORT_PIER', 'PARKING')
    `;

    const airports: IcelandAttraction[] = [];
    const ferryTerminals: IcelandPickupPoint[] = [];
    const parking: IcelandAttraction[] = [];

    places.forEach(p => {
      const canonicalType = p.metadata?.canonicalType || 'OTHER';
      const item = {
        placeId: p.id,
        name: p.nameCN,
        nameEN: p.nameEN || undefined,
        lat: p.lat,
        lng: p.lng,
        canonicalType,
        tags: p.metadata?.rawTags || {},
      };

      if (canonicalType === 'AIRPORT') {
        airports.push(item);
      } else if (canonicalType === 'PORT_FERRY_TERMINAL' || canonicalType === 'PORT_PIER') {
        ferryTerminals.push(item);
      } else if (canonicalType === 'PARKING') {
        parking.push(item);
      }
    });

    return {
      airports,
      ferryTerminals,
      parking,
      total: places.length,
    };
  }

  /**
   * 获取自然景点
   */
  private async getAttractions(region: string): Promise<{
    waterfalls: IcelandAttraction[];
    hotSprings: IcelandAttraction[];
    geysers: IcelandAttraction[];
    glaciers: IcelandAttraction[];
    volcanoes: IcelandAttraction[];
    beaches: IcelandAttraction[];
    viewpoints: IcelandAttraction[];
    total: number;
  }> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN (
          'ATTRACTION_NATURE_WATERFALL',
          'ATTRACTION_NATURE_HOT_SPRING',
          'ATTRACTION_NATURE_GEYSER',
          'ATTRACTION_NATURE_GLACIER',
          'ATTRACTION_NATURE_VOLCANO',
          'ATTRACTION_NATURE_BEACH',
          'VIEWPOINT'
        )
    `;

    const waterfalls: IcelandAttraction[] = [];
    const hotSprings: IcelandAttraction[] = [];
    const geysers: IcelandAttraction[] = [];
    const glaciers: IcelandAttraction[] = [];
    const volcanoes: IcelandAttraction[] = [];
    const beaches: IcelandAttraction[] = [];
    const viewpoints: IcelandAttraction[] = [];

    places.forEach(p => {
      const canonicalType = p.metadata?.canonicalType || 'OTHER';
      const item = {
        placeId: p.id,
        name: p.nameCN,
        nameEN: p.nameEN || undefined,
        lat: p.lat,
        lng: p.lng,
        canonicalType,
        tags: p.metadata?.rawTags || {},
      };

      switch (canonicalType) {
        case 'ATTRACTION_NATURE_WATERFALL':
          waterfalls.push(item);
          break;
        case 'ATTRACTION_NATURE_HOT_SPRING':
          hotSprings.push(item);
          break;
        case 'ATTRACTION_NATURE_GEYSER':
          geysers.push(item);
          break;
        case 'ATTRACTION_NATURE_GLACIER':
          glaciers.push(item);
          break;
        case 'ATTRACTION_NATURE_VOLCANO':
          volcanoes.push(item);
          break;
        case 'ATTRACTION_NATURE_BEACH':
          beaches.push(item);
          break;
        case 'VIEWPOINT':
          viewpoints.push(item);
          break;
      }
    });

    return {
      waterfalls,
      hotSprings,
      geysers,
      glaciers,
      volcanoes,
      beaches,
      viewpoints,
      total: places.length,
    };
  }

  /**
   * 获取安全保障点
   */
  private async getSafetyPoints(region: string): Promise<{
    hospitals: IcelandAttraction[];
    clinics: IcelandAttraction[];
    pharmacies: IcelandAttraction[];
    police: IcelandAttraction[];
    fireStations: IcelandAttraction[];
    total: number;
  }> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN ('HOSPITAL', 'CLINIC', 'PHARMACY', 'POLICE', 'FIRE_STATION')
    `;

    const hospitals: IcelandAttraction[] = [];
    const clinics: IcelandAttraction[] = [];
    const pharmacies: IcelandAttraction[] = [];
    const police: IcelandAttraction[] = [];
    const fireStations: IcelandAttraction[] = [];

    places.forEach(p => {
      const canonicalType = p.metadata?.canonicalType || 'OTHER';
      const item = {
        placeId: p.id,
        name: p.nameCN,
        nameEN: p.nameEN || undefined,
        lat: p.lat,
        lng: p.lng,
        canonicalType,
        tags: p.metadata?.rawTags || {},
      };

      switch (canonicalType) {
        case 'HOSPITAL':
          hospitals.push(item);
          break;
        case 'CLINIC':
          clinics.push(item);
          break;
        case 'PHARMACY':
          pharmacies.push(item);
          break;
        case 'POLICE':
          police.push(item);
          break;
        case 'FIRE_STATION':
          fireStations.push(item);
          break;
      }
    });

    return {
      hospitals,
      clinics,
      pharmacies,
      police,
      fireStations,
      total: places.length,
    };
  }

  /**
   * 获取补给点
   */
  private async getSupplyPoints(region: string): Promise<{
    fuelStations: IcelandAttraction[];
    supermarkets: IcelandAttraction[];
    convenienceStores: IcelandAttraction[];
    toilets: IcelandAttraction[];
    total: number;
  }> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN ('FUEL_STATION', 'SUPERMARKET', 'CONVENIENCE_STORE', 'TOILETS')
    `;

    const fuelStations: IcelandAttraction[] = [];
    const supermarkets: IcelandAttraction[] = [];
    const convenienceStores: IcelandAttraction[] = [];
    const toilets: IcelandAttraction[] = [];

    places.forEach(p => {
      const canonicalType = p.metadata?.canonicalType || 'OTHER';
      const item = {
        placeId: p.id,
        name: p.nameCN,
        nameEN: p.nameEN || undefined,
        lat: p.lat,
        lng: p.lng,
        canonicalType,
        tags: p.metadata?.rawTags || {},
      };

      switch (canonicalType) {
        case 'FUEL_STATION':
          fuelStations.push(item);
          break;
        case 'SUPERMARKET':
          supermarkets.push(item);
          break;
        case 'CONVENIENCE_STORE':
          convenienceStores.push(item);
          break;
        case 'TOILETS':
          toilets.push(item);
          break;
      }
    });

    return {
      fuelStations,
      supermarkets,
      convenienceStores,
      toilets,
      total: places.length,
    };
  }

  /**
   * 获取服务点
   */
  private async getServicePoints(region: string): Promise<{
    informationCenters: IcelandAttraction[];
    tourOperators: IcelandAttraction[];
    carRentals: IcelandAttraction[];
    camping: IcelandAttraction[];
    spaPools: IcelandAttraction[];
    total: number;
  }> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'regionKey' = ${region}
        AND metadata->>'canonicalType' IN (
          'INFORMATION_CENTER',
          'TOUR_OPERATOR',
          'CAR_RENTAL',
          'CAMPING',
          'SPA_POOL'
        )
    `;

    const informationCenters: IcelandAttraction[] = [];
    const tourOperators: IcelandAttraction[] = [];
    const carRentals: IcelandAttraction[] = [];
    const camping: IcelandAttraction[] = [];
    const spaPools: IcelandAttraction[] = [];

    places.forEach(p => {
      const canonicalType = p.metadata?.canonicalType || 'OTHER';
      const item = {
        placeId: p.id,
        name: p.nameCN,
        nameEN: p.nameEN || undefined,
        lat: p.lat,
        lng: p.lng,
        canonicalType,
        tags: p.metadata?.rawTags || {},
      };

      switch (canonicalType) {
        case 'INFORMATION_CENTER':
          informationCenters.push(item);
          break;
        case 'TOUR_OPERATOR':
          tourOperators.push(item);
          break;
        case 'CAR_RENTAL':
          carRentals.push(item);
          break;
        case 'CAMPING':
          camping.push(item);
          break;
        case 'SPA_POOL':
          spaPools.push(item);
          break;
      }
    });

    return {
      informationCenters,
      tourOperators,
      carRentals,
      camping,
      spaPools,
      total: places.length,
    };
  }
}

