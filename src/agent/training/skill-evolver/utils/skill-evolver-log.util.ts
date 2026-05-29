import { Logger } from '@nestjs/common';

let configured = false;

export function isSkillEvolverVerbose(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  const v = process.env.SKILL_EVOLVER_VERBOSE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** CLI / 脚本启动时调用：非 verbose 时压制 Nest debug/log */
export function configureSkillEvolverLogging(verbose?: boolean): void {
  if (configured) return;
  configured = true;
  const on = isSkillEvolverVerbose(verbose);
  if (on) {
    Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']);
  } else {
    Logger.overrideLogger(['error', 'warn']);
  }
}
