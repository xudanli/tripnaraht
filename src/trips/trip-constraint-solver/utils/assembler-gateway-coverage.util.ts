/**
 * Gateway domain coverage flags for assembler legacy rule suppression (Phase 6 slice-7).
 */

export type AssemblerGatewayDomainCoverage = {
  poiAccess: boolean;
  schedule: boolean;
  guardian: boolean;
};

export function isAssemblerGatewayDomainCoverageActive(
  coverage?: AssemblerGatewayDomainCoverage,
): boolean {
  if (!coverage) return false;
  return coverage.poiAccess || coverage.schedule || coverage.guardian;
}
