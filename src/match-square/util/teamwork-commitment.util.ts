import type { CaptainPersonaSnapshot, RecruitmentPlanningStyle } from '../types/match-square.types';
import { resolveTeamworkStyleDefinition } from '../config/planning-styles.config';

export interface TeamworkCommitmentPrompt {
  required: true;
  dimension: 'teamwork_style';
  teamworkStyle: RecruitmentPlanningStyle;
  message: string;
}

const FULL_MANAGED_COMMITMENT =
  '本队为「全托管」契约：队长全权负责行程与后勤。加入即表示你承诺行中不指手画脚、不对路线和酒店发表负面挑刺。是否确认？';

const CO_PLANNING_COMMITMENT =
  '本队为「一起策划」契约：行前需分担筹备，行中民主决策。加入即表示你承诺不在群里说「随便」、到了现场却挑刺甩锅。是否确认？';

const CASUAL_PLAY_COMMITMENT =
  '本队为「一起随便玩」契约：无固定日程，支持即兴与自由脱队。加入即表示你接受无硬性计划、不因临时变卦而指责队友。是否确认？';

/** PRD 3.4.4 — 申请前组队契约承诺弹窗 */
export function detectTeamworkCommitmentPrompt(
  teamworkStyle: RecruitmentPlanningStyle | null | undefined,
): TeamworkCommitmentPrompt | null {
  if (!teamworkStyle) return null;

  const def = resolveTeamworkStyleDefinition(teamworkStyle);
  if (!def) return null;

  const messages: Record<RecruitmentPlanningStyle, string> = {
    full_managed: FULL_MANAGED_COMMITMENT,
    co_planning: CO_PLANNING_COMMITMENT,
    casual_play: CASUAL_PLAY_COMMITMENT,
  };

  return {
    required: true,
    dimension: 'teamwork_style',
    teamworkStyle,
    message: messages[teamworkStyle],
  };
}
