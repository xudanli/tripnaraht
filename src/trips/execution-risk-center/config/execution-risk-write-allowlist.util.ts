export interface ExecutionRiskWriteAllowlist {
  tripIds: Set<string>;
  userIds: Set<string>;
  riskCodes: Set<string>;
}

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function readExecutionRiskWriteAllowlist(): ExecutionRiskWriteAllowlist {
  return {
    tripIds: parseAllowlist(process.env.EXECUTION_RISK_WRITE_ALLOWLIST_TRIPS),
    userIds: parseAllowlist(process.env.EXECUTION_RISK_WRITE_ALLOWLIST_USERS),
    riskCodes: parseAllowlist(process.env.EXECUTION_RISK_WRITE_ALLOWLIST_CODES),
  };
}

export function isExecutionRiskWriteAllowlisted(input: {
  tripId: string;
  userId: string;
  riskCode?: string;
}): boolean {
  const allowlist = readExecutionRiskWriteAllowlist();
  const hasAny =
    allowlist.tripIds.size > 0 ||
    allowlist.userIds.size > 0 ||
    allowlist.riskCodes.size > 0;
  if (!hasAny) return true;

  const tripOk = allowlist.tripIds.size === 0 || allowlist.tripIds.has(input.tripId);
  const userOk = allowlist.userIds.size === 0 || allowlist.userIds.has(input.userId);
  const codeOk =
    allowlist.riskCodes.size === 0 ||
    (input.riskCode ? allowlist.riskCodes.has(input.riskCode) : false);

  return tripOk && userOk && codeOk;
}
