import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROUTE_DIRECTION_ADMIN_METADATA_SOURCE } from '../contracts/admin-metadata.v1';

export class WeatherForecastPointDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  start?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  end?: string;

  @ApiPropertyOptional({ description: 'm/s' })
  @IsOptional()
  @IsNumber()
  wind_mps?: number;

  @ApiPropertyOptional({ description: 'km/h' })
  @IsOptional()
  @IsNumber()
  windSpeedKph?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visibility_m?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visibilityMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  precipitation_mm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  precipitationMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  snow_depth_cm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  snowDepthCm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temperatureC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  confidenceScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;
}

export class EnvironmentWeatherOverrideDto {
  @ApiPropertyOptional({ type: [WeatherForecastPointDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeatherForecastPointDto)
  forecastSeries?: WeatherForecastPointDto[];

  @ApiPropertyOptional({ description: 'Snapshot wind m/s' })
  @IsOptional()
  @IsNumber()
  wind_mps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visibility_m?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  precipitation_mm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  snow_depth_cm?: number;
}

export class EnvironmentSolarOverrideDto {
  @ApiPropertyOptional({ description: 'Minutes before sunset safety buffer' })
  @IsOptional()
  @IsNumber()
  twilightBufferMin?: number;

  @ApiPropertyOptional({
    description: 'date → ISO sunset',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  sunsetByDate?: Record<string, string>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  sunriseByDate?: Record<string, string>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  civilDuskByDate?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Merged daylight map (admin or derived)',
    type: 'object',
    additionalProperties: { type: 'object' },
  })
  @IsOptional()
  @IsObject()
  daylightByDate?: Record<string, Record<string, string>>;
}

/**
 * Validated EnvironmentOverridesV1 — stored at metadata.environment_overrides_v1
 */
export class EnvironmentOverridesV1Dto {
  @ApiPropertyOptional({ type: EnvironmentWeatherOverrideDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnvironmentWeatherOverrideDto)
  weather?: EnvironmentWeatherOverrideDto;

  @ApiPropertyOptional({ type: EnvironmentSolarOverrideDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnvironmentSolarOverrideDto)
  solar?: EnvironmentSolarOverrideDto;

  @ApiPropertyOptional({ default: ROUTE_DIRECTION_ADMIN_METADATA_SOURCE })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'ISO observed-at' })
  @IsOptional()
  @IsString()
  at?: string;

  @ApiPropertyOptional({ description: 'ISO expiry' })
  @IsOptional()
  @IsString()
  expires_at?: string;
}

export class PatchEnvironmentOverridesDto {
  @ApiProperty({ type: EnvironmentOverridesV1Dto })
  @IsObject()
  @ValidateNested()
  @Type(() => EnvironmentOverridesV1Dto)
  overrides!: EnvironmentOverridesV1Dto;

  @ApiPropertyOptional({
    enum: ['replace', 'merge'],
    default: 'merge',
    description: 'replace: overwrite key; merge: deep-merge weather/solar bags',
  })
  @IsOptional()
  @IsIn(['replace', 'merge'])
  mode?: 'replace' | 'merge';
}

export class PreviewEnvironmentRiskDto {
  @ApiPropertyOptional({ type: EnvironmentWeatherOverrideDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnvironmentWeatherOverrideDto)
  weather?: EnvironmentWeatherOverrideDto;

  @ApiPropertyOptional({ type: EnvironmentSolarOverrideDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnvironmentSolarOverrideDto)
  solar?: EnvironmentSolarOverrideDto;

  @ApiPropertyOptional({
    description: 'Event time ISO used to pick forecast slice + daylight risk',
  })
  @IsOptional()
  @IsString()
  eventTimeISO?: string;
}
