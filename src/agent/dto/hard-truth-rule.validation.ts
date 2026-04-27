import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { HARD_TRUTH_KEY } from '../constants/hard-truth-rule.constants';
import { HardTruthGateFroadBlock2wdParamsDto } from './hard-truth-gate-froad-block-2wd-params.dto';

export function validateHardTruthRuleParams(ruleKey: string, params: unknown): Record<string, any> {
  const k = String(ruleKey ?? '').trim();
  if (k === HARD_TRUTH_KEY.GATE_FROAD_BLOCK_2WD) {
    const inst = plainToInstance(HardTruthGateFroadBlock2wdParamsDto, params ?? {}, { enableImplicitConversion: true });
    const errs = validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
    if (errs.length) {
      const msg = errs.flatMap((e) => (e.constraints ? Object.values(e.constraints) : [])).join('; ');
      throw new Error(msg || 'Invalid params for hard_truth.gate.froad.block_2wd');
    }
    return inst as any;
  }
  throw new Error(`Unknown hard-truth rule_key: ${k}`);
}
