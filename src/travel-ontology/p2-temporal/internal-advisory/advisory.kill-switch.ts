/**
 * ONT-P2-02B — display-layer kill switch (does not stop Prediction / Reconciliation)
 */

export function isOntologyP2InternalAdvisoryKillSwitchEngaged(): boolean {
  const v = process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
