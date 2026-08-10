/**
 * NEED_DESTINATION_COUNTRY 入口的纯结果构造（无副作用）。
 * 偏多轮澄清，而非「无法完成」硬失败文案。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { OrchestrateEntryDecision } from './request-router.types';
import type {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import { detectDestinationRegionHint } from '../utils/extract-country-code-from-message.util';

const COMMON_DESTINATION_HINTS = [
  '冰岛 / Iceland',
  '日本 / Japan',
  '中国 / China',
  '澳大利亚 / Australia',
  '新西兰 / New Zealand',
  '泰国 / Thailand',
];

function buildClarificationMessage(message: string, reason?: string): {
  clarificationMessage: string;
  solutions: string[];
  regionCode?: string;
} {
  const region = detectDestinationRegionHint(message);
  if (region?.regionCode === 'ALPS' || reason === 'new_trip_region_needs_country') {
    const countries = region?.countries?.join('、') ?? '法国、瑞士、意大利、奥地利等';
    return {
      regionCode: 'ALPS',
      clarificationMessage:
        '你提到的是阿尔卑斯跨国区域。请先选定一个主落地国家，我再继续生成可执行行程。\n\n' +
        `可选主国家（示例）：${countries}\n\n` +
        '也可以直接回复如「瑞士 7 日自驾」或「意大利多洛米蒂」。',
      solutions: [
        '回复主落地国家（如：瑞士、意大利、法国、奥地利）',
        '若已有行程，提供行程 ID，系统将自动读取国家代码',
      ],
    };
  }

  return {
    clarificationMessage:
      '还差一个关键信息：目的地国家或地区。补充后我就能继续规划行程。\n\n' +
      `常见目的地：${COMMON_DESTINATION_HINTS.join('；')}\n\n` +
      '也可以说「东京 5 日」或「去冰岛玩一周」。',
    solutions: [
      '在消息中写明国家或城市（如：日本、东京、Australia、悉尼）',
      '提供已保存的行程 ID，系统将自动获取国家代码',
    ],
  };
}

export function buildNeedDestinationCountryResult(input: {
  request: RouteAndRunRequestDto;
  entryDecision: Extract<OrchestrateEntryDecision, { mode: 'NEED_DESTINATION_COUNTRY' }>;
  startTime: number;
}): OrchestrationResult {
  const { request, entryDecision, startTime } = input;
  const { clarificationMessage, solutions, regionCode } = buildClarificationMessage(
    request.message ?? '',
    entryDecision.reason,
  );
  return {
    success: false,
    status: 'NEED_USER_INPUT',
    technicalSuccess: true,
    userTaskCompleted: false,
    result: {
      needsUserConfirmation: true,
      clarificationMessage,
      errorType: 'MISSING_REQUIRED_PARAM' as OrchestrationResult['result']['errorType'],
      missingParams: ['countryCode'],
      solutions,
      clarification_slots: [
        {
          slot: 'destination_country',
          prompt_zh: regionCode === 'ALPS' ? '请选择阿尔卑斯主落地国家' : '请补充目的地国家或地区',
          examples: COMMON_DESTINATION_HINTS,
          ...(regionCode ? { region_code: regionCode } : {}),
        },
      ],
      requestRouterDecision: entryDecision,
    },
    answerText: clarificationMessage,
    stepsExecuted: [],
    totalDuration: Date.now() - startTime,
    decisionLog: [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: `用户请求: ${request.message}`,
        outputs_summary: regionCode
          ? `需要澄清：跨国区域 ${regionCode} → 选定主国家`
          : '需要澄清：缺少目的地国家/地区',
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { request_router: entryDecision, region_code: regionCode },
      },
    ],
  };
}
