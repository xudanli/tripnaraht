import { Injectable } from '@nestjs/common';
import { CountriesService } from '../../countries/countries.service';
import {
  ALL_CURATED_RESIDENCY_REGIONS,
  IDENTITY_PREFERRED_LANGUAGES,
  listResidencyRegions,
  type IdentityCodeLabel,
} from '../dictionaries/identity-geo.dictionary';

export interface IdentityNationalityOption {
  code: string;
  nameZh: string;
  nameEn: string;
}

export interface IdentityOptionsResponseDto {
  nationalities: IdentityNationalityOption[];
  /** Default curated list (CN + frequent traveler regions). Filter via residency-regions. */
  residencyRegions: IdentityCodeLabel[];
  preferredLanguages: IdentityCodeLabel[];
}

export interface ResidencyRegionsResponseDto {
  countryCode: string | null;
  items: IdentityCodeLabel[];
}

/** Frequent passport countries pinned to the top of the nationality picker. */
const NATIONALITY_PIN_ORDER = [
  'CN',
  'HK',
  'MO',
  'TW',
  'US',
  'CA',
  'GB',
  'AU',
  'NZ',
  'JP',
  'KR',
  'SG',
  'MY',
  'IS',
  'DE',
  'FR',
];

@Injectable()
export class MobileIdentityOptionsService {
  constructor(private readonly countries: CountriesService) {}

  async getOptions(): Promise<IdentityOptionsResponseDto> {
    const nationalities = await this.listNationalities();
    return {
      nationalities,
      residencyRegions: ALL_CURATED_RESIDENCY_REGIONS,
      preferredLanguages: IDENTITY_PREFERRED_LANGUAGES,
    };
  }

  async listNationalities(q?: string): Promise<IdentityNationalityOption[]> {
    const result = await this.countries.findAll({
      q: q?.trim() || undefined,
      limit: 300,
      offset: 0,
    });
    const rows = (result.countries ?? []).map((c: {
      isoCode?: string;
      nameCN?: string;
      nameEN?: string | null;
    }) => ({
      code: String(c.isoCode ?? '').toUpperCase(),
      nameZh: c.nameCN || String(c.isoCode ?? ''),
      nameEn: c.nameEN || c.nameCN || String(c.isoCode ?? ''),
    })).filter((c) => /^[A-Z]{2}$/.test(c.code));

    return sortNationalities(rows);
  }

  listResidencyRegions(countryCode?: string): ResidencyRegionsResponseDto {
    const cc = countryCode?.trim().toUpperCase() || null;
    return {
      countryCode: cc,
      items: listResidencyRegions(cc),
    };
  }
}

function sortNationalities(
  rows: IdentityNationalityOption[],
): IdentityNationalityOption[] {
  const pinRank = new Map(NATIONALITY_PIN_ORDER.map((c, i) => [c, i]));
  return [...rows].sort((a, b) => {
    const pa = pinRank.has(a.code) ? pinRank.get(a.code)! : 1000;
    const pb = pinRank.has(b.code) ? pinRank.get(b.code)! : 1000;
    if (pa !== pb) return pa - pb;
    return a.nameZh.localeCompare(b.nameZh, 'zh');
  });
}
