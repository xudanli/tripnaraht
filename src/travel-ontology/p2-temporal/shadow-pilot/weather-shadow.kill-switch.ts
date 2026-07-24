/**
 * ONT-P2-01 — independent Kill Switch for Weather Shadow Pilot
 */

import { WEATHER_SHADOW_PILOT_SEMANTIC } from './weather-shadow-pilot.types';

export function isOntologyP2WeatherShadowKillSwitchEngaged(): boolean {
  const v = process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH?.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  const scoped = process.env.ONTOLOGY_AUTHORITY_SEMANTIC_KILL_SWITCH?.trim() ?? '';
  return scoped
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .includes('P2_WEATHER_SHADOW') ||
    scoped
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .includes(`P2_${WEATHER_SHADOW_PILOT_SEMANTIC}`);
}

export function assertWeatherShadowPilotEnabled(): void {
  if (isOntologyP2WeatherShadowKillSwitchEngaged()) {
    throw new Error(
      'ONT-P2 WEATHER SHADOW kill switch engaged (ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH)',
    );
  }
}
