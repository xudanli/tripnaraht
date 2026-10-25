/**
 * Admin「新建 Identity」— 可选类型列表（含联动能力标记）。
 * 表单字段/POI options 由前端自建；本服务不再提供 create-form。
 */

import { Injectable } from '@nestjs/common';
import {
  ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH,
  ONTOLOGY_KIND_DISPLAY_NAME_ZH,
} from '../../travel-ontology/catalog/ontology-i18n.zh-CN';
import { ONTOLOGY_TYPES } from '../ontology/ontology-catalog';

/** 类型 → 联动选择器配置 */
type CascadeConfig = {
  showCountry: boolean;
  showPoiPicker: boolean;
  showExistingEntities: boolean;
  /** 还可关联选择的其它 Identity 类型 */
  linkableTypes: string[];
};

const TYPE_CASCADE: Record<string, CascadeConfig> = {
  Country: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'WeatherRegion'],
  },
  Place: {
    showCountry: true,
    showPoiPicker: true,
    showExistingEntities: true,
    linkableTypes: ['WeatherRegion', 'ActivityCapability', 'NaturalHazard'],
  },
  TravelerIdentity: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Driver', 'EntryEligibility'],
  },
  EntryRule: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['EntryEligibility', 'TravelerIdentity'],
  },
  EntryEligibility: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['EntryRule', 'TravelerIdentity'],
  },
  Driver: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['TravelerIdentity', 'RentalVehicle'],
  },
  RouteSegment: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Road', 'Place', 'WeatherRegion'],
  },
  Road: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['RouteSegment', 'Place'],
  },
  RentalVehicle: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['RentalContract', 'InsurancePolicy', 'Driver'],
  },
  RentalContract: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['RentalVehicle', 'InsurancePolicy', 'Driver'],
  },
  InsurancePolicy: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['RentalVehicle', 'RentalContract'],
  },
  Flight: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'TravelerIdentity'],
  },
  WeatherRegion: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'RouteSegment', 'NaturalHazard'],
  },
  NaturalHazard: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'WeatherRegion', 'RouteSegment'],
  },
  ActivityCapability: {
    showCountry: true,
    showPoiPicker: true,
    showExistingEntities: true,
    linkableTypes: ['Place'],
  },
  DaylightWindow: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'WeatherRegion'],
  },
  RouteWeatherExposure: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['RouteSegment', 'WeatherRegion', 'Road'],
  },
  TripWorldStateSummary: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'TravelerIdentity', 'RentalVehicle'],
  },
  TravelWorldFact: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['Place', 'RouteSegment', 'Road', 'RentalVehicle', 'WeatherRegion'],
  },
  ConstraintAssessment: {
    showCountry: true,
    showPoiPicker: false,
    showExistingEntities: true,
    linkableTypes: ['TravelerIdentity', 'Place', 'RouteSegment', 'RentalVehicle'],
  },
};

function resolveCascade(typeId: string, domain?: string): CascadeConfig {
  if (TYPE_CASCADE[typeId]) return TYPE_CASCADE[typeId]!;
  const domainDefaults: Partial<Record<string, CascadeConfig>> = {
    PLACE: {
      showCountry: true,
      showPoiPicker: true,
      showExistingEntities: true,
      linkableTypes: ['Place', 'WeatherRegion'],
    },
    MOBILITY: {
      showCountry: true,
      showPoiPicker: false,
      showExistingEntities: true,
      linkableTypes: ['Road', 'RouteSegment', 'RentalVehicle', 'Place'],
    },
    ENVIRONMENT: {
      showCountry: true,
      showPoiPicker: false,
      showExistingEntities: true,
      linkableTypes: ['WeatherRegion', 'NaturalHazard', 'Place', 'RouteSegment'],
    },
    TRAVELER: {
      showCountry: true,
      showPoiPicker: false,
      showExistingEntities: true,
      linkableTypes: ['TravelerIdentity', 'Driver'],
    },
    ACTIVITY: {
      showCountry: true,
      showPoiPicker: true,
      showExistingEntities: true,
      linkableTypes: ['Place', 'ActivityCapability'],
    },
    TIME: {
      showCountry: true,
      showPoiPicker: false,
      showExistingEntities: true,
      linkableTypes: ['Place', 'DaylightWindow'],
    },
    TRIP: {
      showCountry: true,
      showPoiPicker: false,
      showExistingEntities: true,
      linkableTypes: ['Place', 'TravelerIdentity', 'RentalVehicle'],
    },
  };
  return (
    domainDefaults[domain ?? ''] ?? {
      showCountry: true,
      showPoiPicker: false,
      showExistingEntities: true,
      linkableTypes: ['Place'],
    }
  );
}

@Injectable()
export class KnowledgeEntityCreateFormService {
  /** 可选类型列表（新建实体第一步）— 覆盖目录全部类型，均带联动能力 */
  listCreatableTypes() {
    const preferredOrder = [
      'Place',
      'RouteSegment',
      'Road',
      'WeatherRegion',
      'RentalVehicle',
      'RentalContract',
      'Flight',
      'InsurancePolicy',
      'ActivityCapability',
      'NaturalHazard',
      'Driver',
      'TravelerIdentity',
      'EntryRule',
      'EntryEligibility',
      'DaylightWindow',
      'RouteWeatherExposure',
      'TripWorldStateSummary',
      'TravelWorldFact',
      'ConstraintAssessment',
    ];
    const order = new Map(preferredOrder.map((id, i) => [id, i]));
    const items = [...ONTOLOGY_TYPES]
      .sort((a, b) => {
        const ai = order.get(a.typeId) ?? 1000;
        const bi = order.get(b.typeId) ?? 1000;
        if (ai !== bi) return ai - bi;
        return a.displayName.localeCompare(b.displayName, 'zh');
      })
      .map((t) => {
        const cascade = resolveCascade(t.typeId, t.domain);
        const linkableLabels = (cascade.linkableTypes ?? []).map((lt) => {
          const td = ONTOLOGY_TYPES.find((x) => x.typeId === lt);
          return { typeId: lt, displayName: td?.displayName ?? lt };
        });
        return {
          typeId: t.typeId,
          name: t.displayName,
          nameEn: t.nameEn,
          displayName: t.displayName,
          kind: t.kind,
          kindDisplayName: ONTOLOGY_KIND_DISPLAY_NAME_ZH[t.kind] ?? t.kind,
          domain: t.domain,
          domainDisplayName: ONTOLOGY_DOMAIN_DISPLAY_NAME_ZH[t.domain] ?? t.domain,
          description: t.description,
          cascade: {
            country: cascade.showCountry,
            poi: cascade.showPoiPicker,
            existingEntities: cascade.showExistingEntities,
            linkableTypes: cascade.linkableTypes ?? [],
            linkableTypeLabels: linkableLabels,
          },
        };
      });
    return { items, total: items.length };
  }
}
