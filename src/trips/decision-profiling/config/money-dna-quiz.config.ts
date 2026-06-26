import type { QuizQuestion } from '../types/decision-profiling.types';

export const MONEY_DNA_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'md_q1',
    section: 'money_dna',
    prompt: '你理想中的一天旅行预算（不含住宿和大交通）大约是：',
    options: [
      { id: 'a', label: '1000元以内，体验为主', scores: { experienceTendency: 0.7, frugality: 0.6, budgetMax: 1000 } },
      { id: 'b', label: '2000元左右，舒适重要', scores: { qualityTendency: 0.7, budgetMax: 2000 } },
      { id: 'c', label: '不设上限，难得出来', scores: { experienceTendency: 0.5, qualityTendency: 0.5, socialScarcityTendency: 0.8, budgetMax: 99999 } },
      { id: 'd', label: '看具体项目，值得就多花', scores: { experienceTendency: 0.6, timeValueTendency: 0.5, budgetMax: 3000 } },
    ],
  },
  {
    id: 'md_q2',
    section: 'money_dna',
    prompt: '住宿选择上，你更看重：',
    options: [
      { id: 'a', label: '设计感与品牌口碑', scores: { qualityTendency: 0.85 } },
      { id: 'b', label: '位置便利，节省时间', scores: { timeValueTendency: 0.8, qualityTendency: 0.3 } },
      { id: 'c', label: '独特体验（木屋、冰屋等）', scores: { experienceTendency: 0.85, qualityTendency: 0.2 } },
      { id: 'd', label: '干净实惠即可', scores: { frugality: 0.8, experienceTendency: 0.2 } },
    ],
  },
  {
    id: 'md_q3',
    section: 'money_dna',
    prompt: '面对限时特价体验（如直升机观光5折），你会：',
    options: [
      { id: 'a', label: '立刻预订，怕错过', scores: { socialScarcityTendency: 0.85, experienceTendency: 0.5 } },
      { id: 'b', label: '先查是否真划算', scores: { timeValueTendency: 0.4, experienceTendency: 0.3 } },
      { id: 'c', label: '问同伴是否一起', scores: { socialScarcityTendency: 0.4, experienceTendency: 0.4 } },
      { id: 'd', label: '通常跳过，不在计划内', scores: { frugality: 0.7, timeValueTendency: 0.2 } },
    ],
  },
  {
    id: 'md_q4',
    section: 'money_dna',
    prompt: '餐饮消费上，你更倾向：',
    options: [
      { id: 'a', label: '打卡名店，值得排队', scores: { experienceTendency: 0.7, qualityTendency: 0.5, socialScarcityTendency: 0.4 } },
      { id: 'b', label: '舒适环境与服务', scores: { qualityTendency: 0.8 } },
      { id: 'c', label: '本地小馆，authentic 优先', scores: { experienceTendency: 0.75, frugality: 0.3 } },
      { id: 'd', label: '方便省事，不纠结', scores: { timeValueTendency: 0.75, frugality: 0.4 } },
    ],
  },
  {
    id: 'md_q5',
    section: 'money_dna',
    prompt: '行中消费节奏，你更像：',
    options: [
      { id: 'a', label: '提前规划每笔大额支出', scores: { plannedPace: 1, frugality: 0.3 } },
      { id: 'b', label: '看到喜欢就买', scores: { spontaneousPace: 1, experienceTendency: 0.4 } },
      { id: 'c', label: '大项提前订，小项即兴', scores: { plannedPace: 0.5, spontaneousPace: 0.5, flexiblePace: 1 } },
      { id: 'd', label: '跟团队节奏走', scores: { plannedPace: 0.3, spontaneousPace: 0.3 } },
    ],
  },
];
