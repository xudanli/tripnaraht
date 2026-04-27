export type L3PersuasionMode = 'INTERCEPTOR_MODE' | 'ACTUARY_MODE';

export interface ParsedL3Proof {
  cid: string;
  entity?: string; // "TYPE:ID"
  cmp?: string;
  actual?: number;
  limit?: number;
  unit?: string;
  slack?: number;
  evidence?: { source?: string; refIds?: string[] };
}

export function parseL3ProofPrefix(message: string): ParsedL3Proof | undefined {
  const s = String(message ?? '');
  if (!s.startsWith('[L3-PROOF|')) return undefined;
  const end = s.indexOf(']');
  if (end <= 0) return undefined;
  const inside = s.slice(1, end);
  const parts = inside.split('|').map((x) => x.trim());
  if (parts.length < 4) return undefined;
  if (parts[0] !== 'L3-PROOF') return undefined;

  const cid = parts[1];
  const entity = parts[2];

  let cmp: string | undefined;
  let actual: number | undefined;
  let limit: number | undefined;
  let unit: string | undefined;
  let slack: number | undefined;
  let evidence: ParsedL3Proof['evidence'] | undefined;

  for (let i = 3; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('cmp:')) cmp = p.slice('cmp:'.length);
    if (p.startsWith('actual:')) {
      const n = Number(p.slice('actual:'.length));
      if (Number.isFinite(n)) actual = n;
    }
    if (p.startsWith('limit:')) {
      const n = Number(p.slice('limit:'.length));
      if (Number.isFinite(n)) limit = n;
    }
    if (p.startsWith('unit:')) unit = p.slice('unit:'.length) || undefined;
    if (p.startsWith('slack:')) {
      const n = Number(p.slice('slack:'.length));
      if (Number.isFinite(n)) slack = n;
    }
    if (p.startsWith('evidence:')) {
      const rest = p.slice('evidence:'.length);
      const segs = rest.split(':');
      const source = segs[0] || undefined;
      const ids = segs.length >= 2 ? segs.slice(1).join(':') : '';
      const refIds = ids ? ids.split(',').map((x) => x.trim()).filter(Boolean) : [];
      evidence = { source, ...(refIds.length ? { refIds } : {}) };
    }
  }

  if (!cid) return undefined;
  return {
    cid,
    ...(entity ? { entity } : {}),
    ...(cmp ? { cmp } : {}),
    ...(Number.isFinite(actual) ? { actual } : {}),
    ...(Number.isFinite(limit) ? { limit } : {}),
    ...(unit ? { unit } : {}),
    ...(Number.isFinite(slack) ? { slack } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

export function selectPersuasionMode(cid: string | undefined): L3PersuasionMode {
  const id = String(cid ?? '');
  if (id.startsWith('entity.') || id === 'time_space.min_transfer_buffer') return 'INTERCEPTOR_MODE';
  return 'ACTUARY_MODE';
}

export function buildL3PersuasionLine(params: {
  proof: ParsedL3Proof;
  mode: L3PersuasionMode;
  /** optional historical simulation proxy (from audit); absent in most online paths */
  wallHit?: { latency_ms?: number; event_span?: number; wall_trigger?: string; is_gold_sample?: boolean };
}): { channel: 'warnings' | 'tips'; line: string } | undefined {
  const { proof, mode, wallHit } = params;
  if (!proof?.cid) return undefined;
  const slack = typeof proof.slack === 'number' ? proof.slack : undefined;
  if (!Number.isFinite(slack)) return undefined;

  const abs = Math.round(Math.abs(slack as number));
  const unit = proof.unit ?? 'unknown';
  const ev = proof.evidence?.refIds?.length ? `（证据: ${proof.evidence.refIds.join(',')}）` : '';

  if (mode === 'INTERCEPTOR_MODE') {
    const header = '[L3-拦截]';
    const core =
      slack! < 0
        ? `硬冲突：${proof.cid} 存在物理缺口 ${abs}${unit}，当前方案不可行${ev}`
        : `已满足硬约束：${proof.cid} 余量 ${abs}${unit}${ev}`;
    const detail =
      Number.isFinite(proof.actual) && Number.isFinite(proof.limit)
        ? `（actual=${proof.actual} limit=${proof.limit} cmp=${proof.cmp ?? ''}）`
        : '';
    const history =
      wallHit?.wall_trigger && wallHit?.event_span !== undefined
        ? `｜历史/模拟：常在 ${wallHit.event_span} 个事件后触发 ${wallHit.wall_trigger}`
        : '';
    const line = `${header} ${core}${detail}${history}`.slice(0, 500);
    return { channel: 'warnings', line };
  }

  // ACTUARY_MODE
  const header = '[L3-精算]';
  const core =
    slack! < 0
      ? `风险超支：${proof.cid} 超标 ${abs}${unit}（建议提前修复以避免连锁回溯）${ev}`
      : `风险余量：${proof.cid} 余量 ${abs}${unit}${ev}`;
  const history =
    wallHit?.is_gold_sample && (wallHit.latency_ms || wallHit.event_span)
      ? `｜Gold 样本：类似风险常在 ${wallHit.latency_ms ? `${Math.round(wallHit.latency_ms / 60000)}min` : ''}${
          wallHit.event_span ? `/${wallHit.event_span} events` : ''
        } 后爆发`
      : '';
  const line = `${header} ${core}${history}`.slice(0, 500);
  return { channel: 'tips', line };
}

