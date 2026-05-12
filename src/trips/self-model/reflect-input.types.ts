/**
 * Minimal execution snapshots the reflector consumes — map from Neptune / VM runs.
 */

export interface ReflectableExecutionResult {
  /** Optional lineage id (multiverse / batch index). */
  label?: string;
  vmOk: boolean;
  vmFailures: string[];
  pathCost: number;
  /** Neptune-style trigger codes from repair layer — used for bias detection. */
  neptuneTriggerCodes?: string[];
}
