import type { PremiumTrekkingScriptId } from './premium-trekking.config';

export interface TrekkingSurvivalQuizItem {
  id: string;
  scriptIds: PremiumTrekkingScriptId[];
  prompt: string;
  options: Array<{ id: string; label: string; correct: boolean }>;
}

/** Layer 0 — 户外生存博弈题池（申请 Level 4+ 时随机抽 2 道） */
export const TREKKING_SURVIVAL_QUIZ_POOL: TrekkingSurvivalQuizItem[] = [
  {
    id: 'laugavegur_hypothermia_shelter',
    scriptIds: ['iceland_laugavegur_heavy_trek'],
    prompt: '兰格维格遭遇突发失温风险时，优先寻找的 Plan B 避难特征是什么？',
    options: [
      { id: 'a', label: '开放火山岩台地，便于卫星通信', correct: false },
      { id: 'b', label: '有天然或人工防风遮蔽的低洼营地，可快速搭四季帐', correct: true },
      { id: 'c', label: '融水河流汇口，便于取水', correct: false },
    ],
  },
  {
    id: 'river_ford_gear_order',
    scriptIds: ['iceland_laugavegur_heavy_trek', 'chuanxi_heavy_trek'],
    prompt: '重装涉水时，更安全的装备解绑顺序是？',
    options: [
      { id: 'a', label: '先解背包腰带与胸带，再换涉水鞋，保留登山杖辅助', correct: true },
      { id: 'b', label: '保持背包全绑，直接趟水以维持重心', correct: false },
      { id: 'c', label: '先摘登山杖，再不解任何背包扣涉水', correct: false },
    ],
  },
  {
    id: 'chuanxi_altitude_safety',
    scriptIds: ['chuanxi_heavy_trek'],
    prompt: '川西高海拔重装遇暴风雪，最优先的集体决策是？',
    options: [
      { id: 'a', label: '按原计划推进以节省时间', correct: false },
      { id: 'b', label: '启动 Plan B 下撤/就地扎营，优先保体温与通信', correct: true },
      { id: 'c', label: '分散行动各自找路', correct: false },
    ],
  },
  {
    id: 'lnt_core',
    scriptIds: ['iceland_laugavegur_heavy_trek', 'chuanxi_heavy_trek', 'light_trek_dyl_retreat'],
    prompt: 'LNT 无痕山林原则中，营地选址首要避免？',
    options: [
      { id: 'a', label: '已有营地痕迹的复用点', correct: false },
      { id: 'b', label: '水源上游 60m 内与脆弱植被区', correct: true },
      { id: 'c', label: '背风石阵旁', correct: false },
    ],
  },
];

export function pickSurvivalQuizForScript(
  scriptId: PremiumTrekkingScriptId,
  count = 2,
): TrekkingSurvivalQuizItem[] {
  const pool = TREKKING_SURVIVAL_QUIZ_POOL.filter((q) => q.scriptIds.includes(scriptId));
  const shuffled = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function gradeSurvivalQuizAnswers(
  items: TrekkingSurvivalQuizItem[],
  answers: Record<string, string>,
): { passed: boolean; wrongIds: string[] } {
  const wrongIds: string[] = [];
  for (const item of items) {
    const chosen = answers[item.id]?.trim();
    const correct = item.options.find((o) => o.correct)?.id;
    if (!chosen || chosen !== correct) wrongIds.push(item.id);
  }
  return { passed: wrongIds.length === 0, wrongIds };
}
