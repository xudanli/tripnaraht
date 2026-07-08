export function isDecisionAutomationChainEnabled(): boolean {
  const v = process.env.DECISION_AUTOMATION_CHAIN_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
