import type { LinguaFragment } from './ontology-dissolution.types';

/**
 * Linguistic pointers decay — labels and semantics lose reference with each step.
 */
export function languageStep(state: LinguaFragment[]): LinguaFragment[] {
  return state.map(x => ({
    ...x,
    label: undefined,
    semantics: undefined,
  }));
}
