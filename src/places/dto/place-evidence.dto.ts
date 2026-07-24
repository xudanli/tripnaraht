export interface PlaceEvidenceBusinessHoursExceptionDto {
  date: string;
  open?: string;
  close?: string;
  closed?: boolean;
  note?: string;
}

export interface PlaceEvidenceBusinessHoursDto {
  open?: string;
  close?: string;
  timezone: string;
  exceptions?: PlaceEvidenceBusinessHoursExceptionDto[];
}

export interface PlaceEvidenceRoadClosureDto {
  hasClosure: boolean;
  closures?: Array<{
    date: string;
    reason: string;
    affectedRoutes?: string[];
    alternativeRoutes?: string[];
  }>;
}

export interface PlaceEvidenceWeatherWindowDto {
  date: string;
  condition: string;
  description: string;
  temperature: {
    min?: number;
    max?: number;
    unit: 'celsius' | 'fahrenheit';
  };
  precipitation?: {
    probability?: number;
    amount?: number;
  };
  wind?: {
    speed?: number;
    direction?: string;
  };
  suitableForOutdoor?: boolean;
}

export interface PlaceEvidenceOtherInfoDto {
  crowdLevel?: 'low' | 'medium' | 'high';
  specialEvents?: Array<{
    date: string;
    name: string;
    impact?: string;
  }>;
}

export interface PlaceEvidencePayloadDto {
  businessHours?: PlaceEvidenceBusinessHoursDto;
  roadClosure?: PlaceEvidenceRoadClosureDto;
  weatherWindow?: PlaceEvidenceWeatherWindowDto;
  otherInfo?: PlaceEvidenceOtherInfoDto;
}

export interface PlaceEvidenceResponseDto {
  placeId: number;
  placeName: string;
  evidence: PlaceEvidencePayloadDto;
}

export interface GetPlaceEvidenceQueryDto {
  date?: string;
  includeWeather?: boolean;
  includeTraffic?: boolean;
}
