import type { FadeOutDirective, SelfNullificationState } from './self-nullification-kernel.types';

export function computeFadeOut(state: SelfNullificationState): FadeOutDirective {
  if (state.nullificationPressure > 0.8) {
    return {
      reduceIR: true,
      reduceDAG: true,
      reduceVM: true,
    };
  }
  return {};
}
