/**
 * Ontology authority selected trips whitelist (restored).
 */

import whitelistJson from './ontology-authority-selected-trips.whitelist.json';

export const ONTOLOGY_SELECTED_TRIPS_SCHEMA_ID =
  'tripnara.ontology_authority_selected_trips@v1' as const;

export interface OntologyAuthoritySelectedTripsWhitelist {
  schemaId: typeof ONTOLOGY_SELECTED_TRIPS_SCHEMA_ID;
  destination: 'IS';
  tripIds: string[];
  scenarioSemantics: string[];
  notes?: string;
}

export function loadOntologyAuthoritySelectedTripsWhitelist(): OntologyAuthoritySelectedTripsWhitelist {
  const fromEnv = (
    process.env.ONTOLOGY_AUTHORITY_SELECTED_TRIPS ??
    process.env.ONTOLOGY_AUTHORITY_SELECTED_TRIP_IDS ??
    ''
  ).trim();
  const envIds = fromEnv
    ? fromEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const fileIds = Array.isArray(whitelistJson.tripIds) ? whitelistJson.tripIds : [];
  const tripIds = envIds.length > 0 ? [...new Set(envIds)] : [...new Set(fileIds)];
  return {
    schemaId: ONTOLOGY_SELECTED_TRIPS_SCHEMA_ID,
    destination: 'IS',
    tripIds,
    scenarioSemantics: whitelistJson.scenarioSemantics ?? [],
    notes: whitelistJson.notes,
  };
}

export function isOntologyAuthoritySelectedCanaryTrip(
  tripId: string | null | undefined,
): boolean {
  if (!tripId) return false;
  return loadOntologyAuthoritySelectedTripsWhitelist().tripIds.includes(tripId);
}

export function isIcelandOntologyDestination(
  destination: string | null | undefined,
): boolean {
  if (!destination) return false;
  const d = destination.trim().toUpperCase();
  return d === 'IS' || d === 'ICELAND' || d.startsWith('IS_') || d.includes('ICELAND');
}
