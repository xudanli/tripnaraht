import { Injectable } from '@nestjs/common';
import {
  buildConfigHash,
  buildRunFingerprint,
  type BuildRunFingerprintInput,
  type FingerprintCompleteness,
  type RunFingerprint,
  resolveGitSha,
  resolveMappingVersionFromEnv,
  sha256Hex,
  stableStringify,
  validateRunFingerprintCompleteness,
} from './eval-fingerprint.util';
import { computePathFingerprint } from './path-fingerprint.util';

@Injectable()
export class EvalFingerprintService {
  stableStringify = stableStringify;
  sha256Hex = sha256Hex;
  buildConfigHash = buildConfigHash;
  buildRunFingerprint(input: BuildRunFingerprintInput): RunFingerprint {
    return buildRunFingerprint(input);
  }
  validateRunFingerprintCompleteness(opts: {
    reportKind: import('./eval-fingerprint.util').CgusReplayReportKind;
    caseCount: number;
    fp: RunFingerprint | null | undefined;
  }): FingerprintCompleteness {
    return validateRunFingerprintCompleteness(opts);
  }
  resolveGitSha = resolveGitSha;
  resolveMappingVersionFromEnv = resolveMappingVersionFromEnv;
  computePathFingerprint(payload: unknown, allowedDiffPaths?: string[]): string {
    return computePathFingerprint(payload, allowedDiffPaths);
  }
}
