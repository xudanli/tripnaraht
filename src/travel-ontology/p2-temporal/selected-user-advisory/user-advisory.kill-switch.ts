/**
 * ONT-P2-03A — user display kill switch (Prediction / Reconciliation / Internal Advisory continue)
 */

export function isOntologyP2UserAdvisoryKillSwitchEngaged(): boolean {
  const v = process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
