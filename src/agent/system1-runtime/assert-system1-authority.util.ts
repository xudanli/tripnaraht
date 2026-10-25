/**
 * P0 Authority Gate：System1 只允许 READ / EXPLAIN / ASSESS / RECOMMEND。
 * WRITE 一律升级 Draft，禁止直接改行程。
 */

import type {
  System1Authority,
  System1AuthorityDecision,
  System1TaskFrame,
} from './system1-runtime.types';

const ALLOWED: readonly System1Authority[] = ['READ', 'EXPLAIN', 'ASSESS', 'RECOMMEND'];

function mapActionToAuthority(action: System1TaskFrame['requestedAction']): System1Authority | 'NONE' {
  if (action === 'WRITE') return 'NONE';
  return action;
}

function inferChangeKind(
  message: string,
): NonNullable<System1AuthorityDecision['changeProposal']>['kind'] {
  const m = String(message ?? '');
  if (/删除|移除|删掉|去掉/.test(m)) return 'DELETE_ITEM';
  if (/移动|改到|挪到/.test(m)) return 'MOVE_ITEM';
  if (/预订|订单|改订/.test(m)) return 'CHANGE_BOOKING';
  if (/路线|改道/.test(m)) return 'APPLY_ROUTE';
  return 'ADD_ITEM';
}

export function evaluateSystem1Authority(
  frame: System1TaskFrame,
  message?: string,
): System1AuthorityDecision {
  const mapped = mapActionToAuthority(frame.requestedAction);
  if (mapped === 'NONE' || frame.questionType === 'WRITE_MUTATION') {
    return {
      allowed: false,
      authority: 'NONE',
      reason: 'SYSTEM1_WRITE_FORBIDDEN',
      escalateTo: 'SYSTEM2_ASSISTED',
      changeProposal: {
        kind: inferChangeKind(message ?? frame.target?.name ?? ''),
        targetName: frame.target?.name,
        applied: false,
      },
    };
  }
  if (!ALLOWED.includes(mapped)) {
    return {
      allowed: false,
      authority: 'NONE',
      reason: 'SYSTEM1_AUTHORITY_UNKNOWN',
      escalateTo: 'SYSTEM2_ASSISTED',
    };
  }
  if (frame.riskLevel === 'HIGH' && mapped === 'RECOMMEND' && frame.lifecycle === 'TRAVELING') {
    /** 高风险建议仍允许评估，但不允许隐式升格为 WRITE */
    return {
      allowed: true,
      authority: 'ASSESS',
      reason: 'HIGH_RISK_ASSESS_ONLY',
      escalateTo: null,
    };
  }
  return {
    allowed: true,
    authority: mapped,
    reason: 'SYSTEM1_AUTHORITY_OK',
    escalateTo: null,
  };
}

export function buildSystem1WriteEscalationAnswerZh(input: {
  frame: System1TaskFrame;
  decision: System1AuthorityDecision;
}): string {
  const target = input.frame.target?.name ?? input.decision.changeProposal?.targetName;
  const kind = input.decision.changeProposal?.kind ?? 'ADD_ITEM';
  const verb =
    kind === 'DELETE_ITEM'
      ? '删除'
      : kind === 'MOVE_ITEM'
        ? '移动'
        : kind === 'CHANGE_BOOKING'
          ? '改预订'
          : kind === 'APPLY_ROUTE'
            ? '改路线'
            : '添加';
  const named = target ? `「${target}」` : '该项';
  return (
    `我可以帮你${verb}${named}，但 System1 不能直接改行程。` +
    `请确认后由行程助手生成草案并应用（不会静默写入）。`
  );
}
