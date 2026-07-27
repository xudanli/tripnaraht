import { WEATHER_DETERIORATION_SEMANTIC } from './weather-deterioration.types';

export function isOntologyP1WeatherDeteriorationKillSwitchEngaged(): boolean {
  const v = process.env.ONTOLOGY_P1_WEATHER_DETERIORATION_KILL_SWITCH?.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  const scoped = process.env.ONTOLOGY_AUTHORITY_SEMANTIC_KILL_SWITCH?.trim() ?? '';
  return scoped
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .includes(WEATHER_DETERIORATION_SEMANTIC);
}

export function assertWeatherDeteriorationSemanticEnabled(): void {
  if (isOntologyP1WeatherDeteriorationKillSwitchEngaged()) {
    throw new Error(
      'ONT-P1 WEATHER_DETERIORATION kill switch engaged (ONTOLOGY_P1_WEATHER_DETERIORATION_KILL_SWITCH)',
    );
  }
}
