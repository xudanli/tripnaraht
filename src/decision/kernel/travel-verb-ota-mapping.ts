/**
 * L1 Decision Runtime 动词 ↔ OTA / IATA NDC 工业标准映射（发现/互操作层，非执行层）。
 *
 * TripNARA lifecycle: pending → committed → rolledBack（Saga 补偿语义）
 */

export type TravelRuntimeLifecycle = 'pending' | 'committed' | 'rolledBack';

export type TravelOntologyVerb =
  | 'BOOK'
  | 'CANCEL'
  | 'ADJUST'
  | 'NOTIFY'
  | 'OPTIMIZE'
  | 'MODIFY'
  | 'SELECT'
  | 'PAY';

export interface OtaNdcVerbMapping {
  tripnaraVerb: TravelOntologyVerb;
  lifecycle: TravelRuntimeLifecycle;
  /** OpenTravel Alliance 近似动作 */
  otaAction?: string;
  /** IATA NDC Order 状态近似 */
  ndcOrderState?: string;
  /** 是否对应 Saga 补偿/回滚路径 */
  sagaCompensation: boolean;
}

const MAPPINGS: readonly OtaNdcVerbMapping[] = [
  { tripnaraVerb: 'BOOK', lifecycle: 'pending', otaAction: 'OTA_HotelResRQ', ndcOrderState: 'ON_HOLD', sagaCompensation: false },
  { tripnaraVerb: 'BOOK', lifecycle: 'committed', otaAction: 'OTA_HotelResRS', ndcOrderState: 'CONFIRMED', sagaCompensation: false },
  { tripnaraVerb: 'BOOK', lifecycle: 'rolledBack', otaAction: 'OTA_CancelRQ', ndcOrderState: 'CANCELLED', sagaCompensation: true },
  { tripnaraVerb: 'CANCEL', lifecycle: 'pending', otaAction: 'OTA_CancelRQ', ndcOrderState: 'CANCEL_PENDING', sagaCompensation: false },
  { tripnaraVerb: 'CANCEL', lifecycle: 'committed', otaAction: 'OTA_CancelRS', ndcOrderState: 'CANCELLED', sagaCompensation: false },
  { tripnaraVerb: 'CANCEL', lifecycle: 'rolledBack', otaAction: 'OTA_ReinstateRQ', ndcOrderState: 'REINSTATED', sagaCompensation: true },
  { tripnaraVerb: 'PAY', lifecycle: 'pending', otaAction: 'OTA_AuthorizeRQ', ndcOrderState: 'PAYMENT_PENDING', sagaCompensation: false },
  { tripnaraVerb: 'PAY', lifecycle: 'committed', otaAction: 'OTA_AuthorizeRS', ndcOrderState: 'TICKETED', sagaCompensation: false },
  { tripnaraVerb: 'PAY', lifecycle: 'rolledBack', otaAction: 'OTA_RefundRQ', ndcOrderState: 'REFUNDED', sagaCompensation: true },
  { tripnaraVerb: 'ADJUST', lifecycle: 'pending', otaAction: 'OTA_ModifyRQ', ndcOrderState: 'CHANGE_PENDING', sagaCompensation: false },
  { tripnaraVerb: 'ADJUST', lifecycle: 'committed', otaAction: 'OTA_ModifyRS', ndcOrderState: 'CHANGED', sagaCompensation: false },
  { tripnaraVerb: 'ADJUST', lifecycle: 'rolledBack', otaAction: 'OTA_RevertRQ', ndcOrderState: 'REVERTED', sagaCompensation: true },
  { tripnaraVerb: 'MODIFY', lifecycle: 'pending', otaAction: 'OTA_ModifyRQ', ndcOrderState: 'CHANGE_PENDING', sagaCompensation: false },
  { tripnaraVerb: 'MODIFY', lifecycle: 'committed', otaAction: 'OTA_ModifyRS', ndcOrderState: 'CHANGED', sagaCompensation: false },
  { tripnaraVerb: 'MODIFY', lifecycle: 'rolledBack', otaAction: 'OTA_RevertRQ', ndcOrderState: 'REVERTED', sagaCompensation: true },
  { tripnaraVerb: 'SELECT', lifecycle: 'pending', ndcOrderState: 'SELECTED', sagaCompensation: false },
  { tripnaraVerb: 'SELECT', lifecycle: 'committed', ndcOrderState: 'CONFIRMED', sagaCompensation: false },
  { tripnaraVerb: 'SELECT', lifecycle: 'rolledBack', ndcOrderState: 'DESELECTED', sagaCompensation: true },
  { tripnaraVerb: 'NOTIFY', lifecycle: 'pending', sagaCompensation: false },
  { tripnaraVerb: 'NOTIFY', lifecycle: 'committed', sagaCompensation: false },
  { tripnaraVerb: 'NOTIFY', lifecycle: 'rolledBack', sagaCompensation: false },
  { tripnaraVerb: 'OPTIMIZE', lifecycle: 'pending', sagaCompensation: false },
  { tripnaraVerb: 'OPTIMIZE', lifecycle: 'committed', sagaCompensation: false },
  { tripnaraVerb: 'OPTIMIZE', lifecycle: 'rolledBack', sagaCompensation: true },
] as const;

export function mapTravelVerbToOtaNdc(
  verb: TravelOntologyVerb,
  lifecycle: TravelRuntimeLifecycle,
): OtaNdcVerbMapping | undefined {
  return MAPPINGS.find((m) => m.tripnaraVerb === verb && m.lifecycle === lifecycle);
}

export function isSagaCompensationLifecycle(lifecycle: TravelRuntimeLifecycle): boolean {
  return lifecycle === 'rolledBack';
}

export function listOtaNdcMappingsForVerb(verb: TravelOntologyVerb): OtaNdcVerbMapping[] {
  return MAPPINGS.filter((m) => m.tripnaraVerb === verb);
}
