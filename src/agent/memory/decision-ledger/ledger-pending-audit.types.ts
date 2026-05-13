import type { LedgerAnchorsV1 } from './decision-ledger.types';
import type { WorldTopicSlice } from './world-topic-slice.types';

/** MCP / Audit 写入、Assembler 下轮消费的待合并世界锚（仅 world 相关，避免整账本覆盖）。 */
export interface LedgerPendingAuditPayloadV1 {
  revision: 'v1';
  worldSlices: WorldTopicSlice[];
  anchors: Pick<LedgerAnchorsV1, 'world' | 'worldLayered'>;
}
