/**
 * Bridge: keep fuel module API; delegate to shared runbook executor.
 */

export {
  assessAndExecuteFuelRunbook,
  executeIcelandFuelInsufficientRunbook,
} from '../runbooks/fuel-runbook.bridge';
