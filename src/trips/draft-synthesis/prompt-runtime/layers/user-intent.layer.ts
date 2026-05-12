import type { CreateTripDraftDto } from '../../../dto/trip-draft.dto';

/**
 * User Intent Layer —— 澄清结果与用户述求
 */
export function renderUserIntentLayer(dto: CreateTripDraftDto): string {
  if (!dto.userInput && !dto.cities?.length && !dto.mustHavePois?.length && !dto.dayAllocation?.length) {
    return '';
  }
  return `
## 用户偏好 / 澄清结果（需映射到候选，但不得臆造未给出的地面事实）
- 用户原始描述：${dto.userInput || '（无）'}
${dto.cities?.length ? `- 指定城市：${dto.cities.join('、')}` : ''}
${dto.mustHavePois?.length ? `- 必含景点（优先安排）：${dto.mustHavePois.join('、')}` : ''}
${dto.dayAllocation?.length ? `- 城市天数分配：${dto.dayAllocation.map((a) => `${a.city}${a.days}天`).join('，')}` : ''}
`;
}
