/**
 * Iceland memory-shell trip id helper.
 * SSOT implementation lives under agent utils so route_and_run does not dangle
 * on an optional country-pack path (C018 / BASELINE_INCOMPLETE remediation).
 */
export { isMemoryShellTripId } from '../../../agent/utils/memory-shell-trip-id.util';
