import type { HarnessExecutionContext } from '../../runtime/execution-context.types';
import type { HarnessValidationResult } from '../../contracts/validation.types';

export interface HarnessDeterministicValidator {
  readonly name: string;
  validate(
    input: unknown,
    context: HarnessExecutionContext,
  ): HarnessValidationResult | Promise<HarnessValidationResult>;
}
