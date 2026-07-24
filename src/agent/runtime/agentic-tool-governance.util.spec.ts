import {
  buildToolGovernanceHoldEnvelope,
  DEFAULT_DESTRUCTIVE_TOOL_POLICIES,
  DEFAULT_HITL_TOOL_POLICIES,
  generateGovernanceAuditId,
  isGovernanceAskPreApproved,
  matchesDestructiveMcpToolName,
  mergeAgenticToolPolicies,
  mergeApprovedToolInvocations,
  normalizeApprovedToolInvocations,
  normalizeToolPoliciesFromConstraints,
  parseAgenticGovernanceHitlFlag,
  policyForMcpTool,
  resolveToolGovernancePolicy,
} from './agentic-tool-governance.util';

describe('parseAgenticGovernanceHitlFlag', () => {
  it('parses truthy', () => {
    expect(parseAgenticGovernanceHitlFlag('true')).toBe(true);
    expect(parseAgenticGovernanceHitlFlag('0')).toBe(false);
  });
});

describe('mergeAgenticToolPolicies', () => {
  it('merges defaults when HITL feature on', () => {
    const m = mergeAgenticToolPolicies(true, undefined);
    expect(m['exa.deepSearch']?.mode).toBe('ask');
  });

  it('always merges destructive baseline even when HITL off', () => {
    const m = mergeAgenticToolPolicies(false, undefined);
    expect(m['delete_event']?.mode).toBe('ask');
    expect(m['google-calendar.deleteCalendar']?.mode).toBe('deny');
    expect(m['exa.deepSearch']).toBeUndefined();
  });

  it('memory overrides default mode', () => {
    const m = mergeAgenticToolPolicies(true, {
      'exa.deepSearch': { mode: 'deny', reason: 'demo' },
    });
    expect(m['exa.deepSearch']?.mode).toBe('deny');
    expect(m['exa.deepSearch']?.reason).toBe('demo');
  });

  it('without HITL flag memory still applies on top of destructive baseline', () => {
    const m = mergeAgenticToolPolicies(false, {
      'weather.getCurrentWeather': { mode: 'ask' },
    });
    expect(m['exa.deepSearch']).toBeUndefined();
    expect(m['weather.getCurrentWeather']?.mode).toBe('ask');
    expect(m['delete_event']?.mode).toBe('ask');
  });
});

describe('normalizeToolPoliciesFromConstraints', () => {
  it('drops invalid entries', () => {
    expect(
      normalizeToolPoliciesFromConstraints({
        good: { mode: 'ask' },
        bad: { mode: 'maybe' },
      })?.bad,
    ).toBeUndefined();
  });
});

describe('policyForMcpTool', () => {
  it('defaults to auto', () => {
    expect(policyForMcpTool('weather.getCurrentWeather', {}).mode).toBe('auto');
  });
});

describe('resolveToolGovernancePolicy', () => {
  it('prefers explicit policy over pattern fallback', () => {
    const p = resolveToolGovernancePolicy('mail.delete_inbox', {
      'mail.delete_inbox': { mode: 'auto' },
    });
    expect(p.mode).toBe('auto');
  });

  it('applies destructive pattern when not in policy table', () => {
    expect(resolveToolGovernancePolicy('mail.send_email', {}).mode).toBe('ask');
    expect(resolveToolGovernancePolicy('google-calendar.deleteEvent', {}).mode).toBe('ask');
    expect(resolveToolGovernancePolicy('weather.getCurrentWeather', {}).mode).toBe('auto');
  });
});

describe('matchesDestructiveMcpToolName', () => {
  it('matches common destructive verbs', () => {
    expect(matchesDestructiveMcpToolName('foo.remove_bar')?.mode).toBe('ask');
    expect(matchesDestructiveMcpToolName('weather.getCurrentWeather')).toBeUndefined();
  });
});

describe('buildToolGovernanceHoldEnvelope', () => {
  it('ask mode exposes AWAITING_APPROVAL', () => {
    const e = buildToolGovernanceHoldEnvelope('exa.deepSearch', 'ask', 'cost');
    expect(e.success).toBe(false);
    expect(e.error).toBe('NEED_USER_APPROVAL');
    expect((e.data as { _system_status: string })._system_status).toBe('AWAITING_APPROVAL');
    expect((e.data as { governance_audit_id?: string }).governance_audit_id).toMatch(/^gov_/);
  });

  it('ask mode includes tool_call_id when provided', () => {
    const audit = generateGovernanceAuditId();
    const e = buildToolGovernanceHoldEnvelope('exa.deepSearch', 'ask', 'cost', 'call_123', audit);
    expect((e.data as { tool_call_id?: string }).tool_call_id).toBe('call_123');
    expect((e.data as { governance_audit_id?: string }).governance_audit_id).toBe(audit);
  });

  it('deny mode includes governance_audit_id', () => {
    const e = buildToolGovernanceHoldEnvelope('google-calendar.deleteCalendar', 'deny', 'blocked');
    expect((e.data as { governance_audit_id?: string }).governance_audit_id).toMatch(/^gov_/);
  });
});

describe('normalizeApprovedToolInvocations / merge / isGovernanceAskPreApproved', () => {
  it('normalizes string ids and objects', () => {
    const n = normalizeApprovedToolInvocations([
      '  a  ',
      { tool_call_id: 'b', mcp_tool_name: 'exa.deepSearch' },
      { bad: 1 },
    ]);
    expect(n).toEqual([
      { toolCallId: 'a' },
      { toolCallId: 'b', mcpToolName: 'exa.deepSearch' },
    ]);
  });

  it('merge lets later source override same id', () => {
    const m = mergeApprovedToolInvocations(
      [{ tool_call_id: 'x', mcp_tool_name: 'a.b' }],
      [{ tool_call_id: 'x', mcp_tool_name: 'c.d' }],
    );
    expect(m).toEqual([{ toolCallId: 'x', mcpToolName: 'c.d' }]);
  });

  it('isGovernanceAskPreApproved respects optional mcp binding', () => {
    const approved = [{ toolCallId: 't1' }, { toolCallId: 't2', mcpToolName: 'exa.deepSearch' }];
    expect(isGovernanceAskPreApproved(approved, 't1', 'anything.ok')).toBe(true);
    expect(isGovernanceAskPreApproved(approved, 't2', 'exa.deepSearch')).toBe(true);
    expect(isGovernanceAskPreApproved(approved, 't2', 'other.tool')).toBe(false);
    expect(isGovernanceAskPreApproved(approved, undefined, 'exa.deepSearch')).toBe(false);
  });
});

describe('DEFAULT_HITL_TOOL_POLICIES', () => {
  it('keys are audited MCP names', () => {
    expect(Object.keys(DEFAULT_HITL_TOOL_POLICIES).every((k) => k.includes('.'))).toBe(true);
  });
});

describe('DEFAULT_DESTRUCTIVE_TOOL_POLICIES', () => {
  it('delete_calendar is deny', () => {
    expect(DEFAULT_DESTRUCTIVE_TOOL_POLICIES['delete_calendar']?.mode).toBe('deny');
  });
});
