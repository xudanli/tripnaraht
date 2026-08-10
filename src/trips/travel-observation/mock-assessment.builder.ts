import { ASSESSMENT_CTA } from './cta-and-roles';
import type { GroundingResult } from './grounding/grounding.types';
import {
  enforceAuthorityGate,
  resolveAssessmentAuthority,
} from './assessment/assessment-authority';
import type {
  ObservationAction,
  ObservationAssessment,
  ObservationContext,
  ObservationFact,
  ObservationIntent,
  TravelObservationEvent,
  VerificationStatus,
} from './observation.types';

type AssessmentDraft = Omit<
  ObservationAssessment,
  'authority' | 'contextHash'
>;

function hasGps(event: TravelObservationEvent): boolean {
  const { latitude, longitude } = event.spatialContext;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function fact(
  event: TravelObservationEvent,
  key: string,
): ObservationFact | undefined {
  return event.observations.find((o) => o.semanticKey === key);
}

function finalizeAssessment(
  draft: AssessmentDraft,
  event: TravelObservationEvent,
  grounding?: GroundingResult,
): ObservationAssessment {
  const authority = resolveAssessmentAuthority({
    hasGps: hasGps(event),
    verificationStatus: draft.verificationStatus,
    status: draft.status,
    grounding,
  });
  const gated = enforceAuthorityGate({
    status: draft.status,
    authority,
  });
  return {
    ...draft,
    status: gated.status,
    authority: gated.authority,
    contextHash:
      grounding?.contextHash ?? `lch_pending_${event.observationId}`,
    writesPlanVersion: false,
  };
}

/**
 * Build assessment from extraction facts + S3 grounding.
 */
export function buildMockAssessment(input: {
  event: TravelObservationEvent;
  context: ObservationContext;
  assessmentRevision: number;
  grounding?: GroundingResult;
}): ObservationAssessment {
  const { event, context, assessmentRevision, grounding } = input;
  const gps = hasGps(event);
  const assessedAt = new Date().toISOString();
  const assessmentId = `assess_${event.observationId}_r${assessmentRevision}`;
  const verificationStatus: VerificationStatus =
    grounding?.verificationStatus ?? event.verificationStatus;

  if (!gps) {
    // Parking / rental conclusions do not require GPS (parking may be VISUAL_ONLY)
    if (event.intent === 'CHECK_PARKING' || grounding?.parkingFit) {
      return finalizeAssessment(
        parkingAssessment(
          event,
          grounding,
          assessmentId,
          assessmentRevision,
          assessedAt,
          verificationStatus,
        ),
        event,
        grounding,
      );
    }
    if (event.intent === 'CHECK_RENTAL_HANDOVER') {
      return finalizeAssessment(
        rentalHandoverAssessment(
          event,
          grounding,
          assessmentId,
          assessmentRevision,
          assessedAt,
          verificationStatus,
        ),
        event,
        grounding,
      );
    }
    return finalizeAssessment(
      noGpsAssessment(event, assessmentId, assessmentRevision, assessedAt),
      event,
      grounding,
    );
  }

  if (
    grounding?.roadMatch === 'CONFLICT' ||
    verificationStatus === 'CONFLICTING'
  ) {
    return finalizeAssessment(
      conflictingAssessment(
        event,
        grounding,
        assessmentId,
        assessmentRevision,
        assessedAt,
        verificationStatus,
      ),
      event,
      grounding,
    );
  }

  const recaptureViews =
    event.extractionMeta?.requiredAdditionalViews?.filter(Boolean) ?? [];
  const needsRecapture = recaptureViews.length > 0;

  if (needsRecapture) {
    return finalizeAssessment(
      recaptureAssessment(
        event,
        assessmentId,
        assessmentRevision,
        assessedAt,
        recaptureViews,
        verificationStatus,
      ),
      event,
      grounding,
    );
  }

  if (
    grounding?.vehicleRoadFit === 'MISMATCH' &&
    (verificationStatus === 'VERIFIED' || verificationStatus === 'CORROBORATED')
  ) {
    return finalizeAssessment(
      froadMismatchAssessment(
        event,
        grounding,
        context,
        assessmentId,
        assessmentRevision,
        assessedAt,
        verificationStatus,
      ),
      event,
      grounding,
    );
  }

  if (grounding?.meetingPoint === 'MISMATCH') {
    return finalizeAssessment(
      meetingMismatchAssessment(
        event,
        grounding,
        assessmentId,
        assessmentRevision,
        assessedAt,
        verificationStatus,
      ),
      event,
      grounding,
    );
  }

  if (event.intent === 'CHECK_PARKING' || grounding?.parkingFit) {
    return finalizeAssessment(
      parkingAssessment(
        event,
        grounding,
        assessmentId,
        assessmentRevision,
        assessedAt,
        verificationStatus,
      ),
      event,
      grounding,
    );
  }

  if (event.intent === 'CHECK_RENTAL_HANDOVER') {
    return finalizeAssessment(
      rentalHandoverAssessment(
        event,
        grounding,
        assessmentId,
        assessmentRevision,
        assessedAt,
        verificationStatus,
      ),
      event,
      grounding,
    );
  }

  return finalizeAssessment(
    defaultInfoAssessment(
      event,
      grounding,
      context,
      assessmentId,
      assessmentRevision,
      assessedAt,
      verificationStatus,
    ),
    event,
    grounding,
  );
}

function noGpsAssessment(
  event: TravelObservationEvent,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
): AssessmentDraft {
  const cta = ASSESSMENT_CTA.NO_GPS;
  const froad = fact(event, 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED');
  const closed = fact(event, 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED');

  const what = closed
    ? '图片中出现禁止通行或封路标志。'
    : froad
      ? `图片中疑似为 ${String(froad.value ?? 'F-road')} 道路标志。`
      : '已收到现场照片，但缺少有效定位。';

  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: what,
      impact:
        '由于无法获取当前位置，NARA 无法确认这是否是你当前路线上的道路，也不能据此判断当前车辆是否可以通行。',
      recommendation: closed
        ? '请不要仅依据应用继续前进，并遵循现场标志。开启定位后可重试正式判断。'
        : '开启定位后重试以获得行程相关判断；也可仅查看标志的一般说明。',
    },
    status: closed ? 'NOTICE' : 'INFO',
    decisionProblem: {
      type: 'DATA_UNCERTAINTY',
      semanticKey: 'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
    },
    evidenceIds: [`ev_extract_nogps_${event.observationId}`],
    actions: [
      { type: 'ACKNOWLEDGE', label: cta.zh.primary },
      { type: 'ACKNOWLEDGE', label: cta.zh.secondary },
    ],
    dataFreshness: { assessedAt },
    verificationStatus: 'INSUFFICIENT',
    writesPlanVersion: false,
  };
}

function conflictingAssessment(
  event: TravelObservationEvent,
  grounding: GroundingResult | undefined,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  const cta = ASSESSMENT_CTA.CONFLICTING;
  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened:
        grounding?.notes.find((n) => n.includes('MISMATCH')) ??
        '图片内容与当前位置或其他数据源不一致。',
      impact: '暂时不能用于当前路线的正式判断。',
      recommendation: '请确认是否为旧照片、更新定位，或重新拍摄。',
    },
    status: 'NEED_CONFIRM',
    decisionProblem: {
      type: 'DATA_UNCERTAINTY',
      semanticKey: 'DATA_CONFLICT.IMAGE_LOCATION_MISMATCH',
    },
    evidenceIds: [`ev_conflict_${event.observationId}`],
    actions: [
      { type: 'ACKNOWLEDGE', label: cta.zh.primary },
      { type: 'RECAPTURE', captureInstruction: '请在当前位置重新拍摄道路标志与前方道路。', label: cta.zh.secondary },
    ],
    dataFreshness: {
      assessedAt,
      roadStatusUpdatedAt: grounding?.roadStatusUpdatedAt,
    },
    verificationStatus,
    writesPlanVersion: false,
  };
}

function recaptureAssessment(
  event: TravelObservationEvent,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  recaptureViews: string[],
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: `已完成现场提取（${intentLabel(event.intent)}），关键字段仍不足。`,
      impact: '关键证据不足，暂不能形成正式行程结论。',
      recommendation: recaptureViews[0],
    },
    status: 'UNKNOWN',
    decisionProblem: {
      type: 'DATA_UNCERTAINTY',
      semanticKey: fact(event, 'DATA_UNCERTAINTY.ROAD_ID_UNKNOWN')
        ? 'DATA_UNCERTAINTY.ROAD_ID_UNKNOWN'
        : fact(event, 'DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN')
          ? 'DATA_UNCERTAINTY.VEHICLE_DRIVETRAIN_UNKNOWN'
          : 'DATA_UNCERTAINTY.CONTEXT_MISSING',
    },
    evidenceIds: [`ev_extract_${event.observationId}_r${assessmentRevision}`],
    actions: [
      {
        type: 'RECAPTURE',
        captureInstruction: recaptureViews[0],
        label: ASSESSMENT_CTA.UNKNOWN.zh.primary,
      },
      {
        type: 'ACKNOWLEDGE',
        label: ASSESSMENT_CTA.UNKNOWN.zh.secondary,
      },
    ],
    dataFreshness: { assessedAt },
    verificationStatus,
    writesPlanVersion: false,
  };
}

function froadMismatchAssessment(
  event: TravelObservationEvent,
  grounding: GroundingResult,
  context: ObservationContext,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  const roadId = grounding.detectedRoadId ?? 'F-road';
  const vehicle = context.vehicle;
  const actions: ObservationAction[] = [
    {
      type: 'PREVIEW',
      previewRef: 'arrange:froad_vehicle_mismatch',
      label: ASSESSMENT_CTA.SUGGEST_REPLACE.zh.primary,
    },
    {
      type: 'ACKNOWLEDGE',
      label: ASSESSMENT_CTA.EXECUTION_BLOCK.zh.secondary,
    },
  ];

  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: `前方道路为 ${roadId}。官方状态${
        grounding.officialRoadOpen === undefined
          ? '暂未对账'
          : grounding.officialRoadOpen
            ? '目前显示开放'
            : '目前显示关闭或受限'
      }。`,
      impact: `当前车辆驱动类型为 ${vehicle?.drivetrain ?? 'UNKNOWN'}（${vehicle?.vehicleClass ?? 'unknown'}）。道路开放不代表当前车辆符合通行要求。`,
      recommendation: '不要继续进入。建议返回主路并使用替代路线，或升级四驱车辆。',
    },
    status: 'EXECUTION_BLOCK',
    decisionProblem: {
      type: 'INFEASIBILITY',
      semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
    },
    evidenceIds: [
      `ev_fit_${event.observationId}`,
      `ev_road_${roadId}`,
    ],
    actions,
    dataFreshness: {
      assessedAt,
      roadStatusUpdatedAt: grounding.roadStatusUpdatedAt,
    },
    verificationStatus,
    writesPlanVersion: false,
  };
}

function meetingMismatchAssessment(
  event: TravelObservationEvent,
  grounding: GroundingResult,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  const detected = fact(event, 'OBSERVATION.ACTIVITY.OPERATOR_SIGN_DETECTED');
  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: `识别到招牌 ${String(detected?.value ?? '')}，与订单集合点不一致。`,
      impact: '当前位置可能不是正确集合点，存在迟到或错过活动风险。',
      recommendation: '请前往订单指定集合点，或查看步行导航方案。',
    },
    status: 'NEED_CONFIRM',
    decisionProblem: {
      type: 'EXECUTION_DEVIATION',
      semanticKey: 'EXECUTION_DEVIATION.WRONG_MEETING_POINT',
    },
    evidenceIds: [`ev_meeting_${event.observationId}`],
    actions: [
      {
        type: 'NAVIGATION',
        routeRef: 'meeting_point:booking',
        label: ASSESSMENT_CTA.NEED_CONFIRM.zh.primary,
      },
      {
        type: 'ACKNOWLEDGE',
        label: ASSESSMENT_CTA.NEED_CONFIRM.zh.secondary,
      },
    ],
    dataFreshness: { assessedAt },
    verificationStatus,
    writesPlanVersion: false,
  };
}

function parkingAssessment(
  event: TravelObservationEvent,
  grounding: GroundingResult | undefined,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  const fit = grounding?.parkingFit ?? 'UNKNOWN';
  const validUntil = grounding?.parkingValidUntil;
  const paid = grounding?.parkingPaidRequired === true;
  const timeFact = fact(event, 'OBSERVATION.PARKING.TIME_LIMIT_DETECTED');
  const until =
    validUntil ??
    (typeof timeFact?.value === 'string' ? timeFact.value : undefined);

  if (fit === 'INCOMPLETE' || fit === 'UNKNOWN') {
    return {
      assessmentId,
      observationId: event.observationId,
      assessmentRevision,
      summary: {
        whatHappened: '停车牌信息不完整或附加牌未拍清。',
        impact: '无法可靠判断当前是否可停、付费要求或有效时间。',
        recommendation: '请补拍完整停车牌及下方附加说明；在确认前请勿假设可以停车。',
      },
      status: 'NEED_CONFIRM',
      decisionProblem: {
        type: 'DATA_UNCERTAINTY',
        semanticKey: 'DATA_UNCERTAINTY.PARKING_RULE_INCOMPLETE',
      },
      evidenceIds: [`ev_parking_${event.observationId}`],
      actions: [
        {
          type: 'RECAPTURE',
          captureInstruction: '请拍摄完整停车牌及附加牌。',
          label: ASSESSMENT_CTA.UNKNOWN.zh.primary,
        },
        {
          type: 'ACKNOWLEDGE',
          label: ASSESSMENT_CTA.NEED_CONFIRM.zh.secondary,
        },
      ],
      dataFreshness: { assessedAt },
      verificationStatus:
        verificationStatus === 'INSUFFICIENT'
          ? 'INSUFFICIENT'
          : verificationStatus,
      writesPlanVersion: false,
    };
  }

  if (fit === 'VISUAL_ONLY') {
    const noParking = !!fact(event, 'OBSERVATION.PARKING.NO_PARKING_DETECTED');
    return {
      assessmentId,
      observationId: event.observationId,
      assessmentRevision,
      summary: {
        whatHappened: noParking
          ? '图片中疑似禁止停车标志。'
          : '已识别停车相关标志，但缺少定位与当地规则对账。',
        impact:
          '当前结论仅为标志内容说明，不能确认你所在车位现在是否可停，也不保证不会被罚款。',
        recommendation:
          '开启定位后重试以核对当地时间与规则；亦可仅查看标志原文说明。',
      },
      status: 'INFO',
      decisionProblem: {
        type: 'DATA_UNCERTAINTY',
        semanticKey: 'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
      },
      evidenceIds: [`ev_parking_visual_${event.observationId}`],
      actions: [
        { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.NO_GPS.zh.primary },
        { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.NO_GPS.zh.secondary },
      ],
      dataFreshness: { assessedAt },
      verificationStatus: 'INSUFFICIENT',
      writesPlanVersion: false,
    };
  }

  if (fit === 'NOT_ALLOWED_NOW') {
    return {
      assessmentId,
      observationId: event.observationId,
      assessmentRevision,
      summary: {
        whatHappened: '当前时段似乎不允许在此停车。',
        impact: until
          ? `限制可能持续至 ${until}；违规可能导致罚款或拖车。`
          : '违规可能导致罚款或拖车；请勿假设不会被处罚。',
        recommendation: '请寻找其他合法车位，或查看附近停车方案。',
      },
      status: 'NOTICE',
      decisionProblem: {
        type: 'RISK',
        semanticKey: 'RULE_TRIGGER.PARKING_NOT_ALLOWED_NOW',
      },
      evidenceIds: [`ev_parking_block_${event.observationId}`],
      actions: [
        { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.NOTICE.zh.primary },
        { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.NOTICE.zh.secondary },
      ],
      dataFreshness: { assessedAt },
      verificationStatus,
      writesPlanVersion: false,
    };
  }

  if (fit === 'PAID_REQUIRED') {
    return {
      assessmentId,
      observationId: event.observationId,
      assessmentRevision,
      summary: {
        whatHappened: '此处为付费停车区域。',
        impact: until
          ? `需缴费；识别到时间相关信息至 ${until}。`
          : '需缴费后停放；请按现场缴费方式操作。',
        recommendation: until
          ? `缴费后停放，并在 ${until} 前离开或续费。不保证绝对不会被罚款。`
          : '缴费后停放，并留意离开时间。不保证绝对不会被罚款。',
      },
      status: 'INFO',
      evidenceIds: [`ev_parking_paid_${event.observationId}`],
      actions: [
        { type: 'ACKNOWLEDGE', label: '设置离开提醒' },
        { type: 'ACKNOWLEDGE', label: '查看原文' },
      ],
      dataFreshness: { assessedAt },
      verificationStatus,
      writesPlanVersion: false,
    };
  }

  // ALLOWED_NOW
  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: '根据现场标志与可用规则，当前似乎可以停车。',
      impact: paid
        ? '仍可能需要付费。'
        : until
          ? `请留意有效至 ${until}。`
          : '请持续关注附加牌与现场变化。',
      recommendation: until
        ? `可以短时停放；建议在 ${until} 前离开。这不是“绝对不会被罚款”的承诺。`
        : '可以短时停放；这不是“绝对不会被罚款”的承诺。',
    },
    status: 'INFO',
    evidenceIds: [`ev_parking_ok_${event.observationId}`],
    actions: [
      { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.INFO.zh.primary },
      { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.INFO.zh.secondary },
    ],
    dataFreshness: { assessedAt },
    verificationStatus,
    writesPlanVersion: false,
  };
}

function rentalHandoverAssessment(
  event: TravelObservationEvent,
  grounding: GroundingResult | undefined,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  const incomplete = event.observations.some(
    (o) => o.semanticKey === 'DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE',
  );
  const mileage = fact(event, 'OBSERVATION.RENTAL.MILEAGE_DETECTED');
  const fuel = fact(event, 'OBSERVATION.RENTAL.FUEL_LEVEL_DETECTED');
  const damage = fact(event, 'OBSERVATION.RENTAL.DAMAGE_SUSPECTED');
  const handover = fact(event, 'OBSERVATION.RENTAL.HANDOVER_TYPE');

  if (incomplete) {
    return {
      assessmentId,
      observationId: event.observationId,
      assessmentRevision,
      summary: {
        whatHappened: '租车交接拍摄角度尚未齐全。',
        impact: '证据包尚不完整，可能不足以应对取还车纠纷。',
        recommendation: '请按引导补拍四角、侧面、前后与仪表盘后再生成证据包。',
      },
      status: 'NEED_CONFIRM',
      decisionProblem: {
        type: 'DATA_UNCERTAINTY',
        semanticKey: 'DATA_UNCERTAINTY.RENTAL_VIEWS_INCOMPLETE',
      },
      evidenceIds: [`ev_rental_incomplete_${event.observationId}`],
      actions: [
        {
          type: 'RECAPTURE',
          captureInstruction: '请补拍缺失的车身角度与仪表盘。',
          label: ASSESSMENT_CTA.UNKNOWN.zh.primary,
        },
        {
          type: 'ACKNOWLEDGE',
          label: ASSESSMENT_CTA.NEED_CONFIRM.zh.secondary,
        },
      ],
      dataFreshness: { assessedAt },
      verificationStatus: 'INSUFFICIENT',
      writesPlanVersion: false,
    };
  }

  const whatParts = [
    `已记录${handover?.value === 'RETURN' ? '还车' : '取车'}交接影像。`,
  ];
  if (mileage) whatParts.push(`里程读数：${String(mileage.value)}。`);
  if (fuel) whatParts.push(`油量/电量：${String(fuel.value)}。`);
  if (damage) {
    whatParts.push('系统标记了疑似表面损伤区域（仅供留证，不认定责任）。');
  }

  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: whatParts.join(''),
      impact:
        '证据包已保存于行程中，可用于日后核对；不会自动发送给租车公司，也不会由 AI 判定责任。',
      recommendation:
        '请核对疑似损伤是否属实并确认；需要时可导出（PDF 为后续能力）。',
    },
    status: 'INFO',
    evidenceIds: [
      `ev_rental_pkg_${event.observationId}`,
      ...event.mediaRefs.map((_, i) => `ev_rental_media_${i}`),
    ],
    actions: [
      { type: 'ACKNOWLEDGE', label: '查看证据包' },
      { type: 'ACKNOWLEDGE', label: ASSESSMENT_CTA.INFO.zh.secondary },
    ],
    dataFreshness: { assessedAt },
    verificationStatus:
      verificationStatus === 'INSUFFICIENT' ? 'UNVERIFIED' : verificationStatus,
    writesPlanVersion: false,
  };
}

function defaultInfoAssessment(
  event: TravelObservationEvent,
  grounding: GroundingResult | undefined,
  context: ObservationContext,
  assessmentId: string,
  assessmentRevision: number,
  assessedAt: string,
  verificationStatus: VerificationStatus,
): AssessmentDraft {
  const froad = fact(event, 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED');
  const closed = fact(event, 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED');
  const model = fact(event, 'OBSERVATION.VEHICLE.MODEL_DETECTED');
  const operator = fact(event, 'OBSERVATION.ACTIVITY.OPERATOR_SIGN_DETECTED');

  const whatParts: string[] = [];
  if (froad) {
    whatParts.push(
      `识别到 F-road 相关标志${typeof froad.value === 'string' ? `（${froad.value}）` : ''}。`,
    );
  }
  if (closed) whatParts.push('识别到封路或禁止进入标志。');
  if (model) whatParts.push(`识别车辆为 ${String(model.value)}。`);
  if (operator) whatParts.push(`识别到活动相关招牌：${String(operator.value)}。`);
  if (whatParts.length === 0) {
    whatParts.push(`已完成现场提取与对账（${intentLabel(event.intent)}）。`);
  }

  const status = closed
    ? 'NOTICE'
    : grounding?.vehicleRoadFit === 'FIT' && froad
      ? 'INFO'
      : froad || model || operator
        ? 'INFO'
        : 'UNKNOWN';

  return {
    assessmentId,
    observationId: event.observationId,
    assessmentRevision,
    summary: {
      whatHappened: whatParts.join(''),
      impact:
        grounding?.notes.slice(0, 2).join(' ') ||
        (context.vehicle
          ? `车辆投影 ${context.vehicle.vehicleClass} / ${context.vehicle.drivetrain}；验证状态 ${verificationStatus}。`
          : `验证状态 ${verificationStatus}。`),
      recommendation: closed
        ? '请遵循现场标志，并核对官方道路状态。'
        : '已记录观察与对账结果；如需改行程请通过替代方案 Preview 确认。',
    },
    status,
    evidenceIds: [
      `ev_ground_${event.observationId}_r${assessmentRevision}`,
      ...event.observations.map(
        (o, i) => `ev_fact_${i}_${o.semanticKey.split('.').pop()}`,
      ),
    ],
    actions: [
      {
        type: 'ACKNOWLEDGE',
        label:
          status === 'NOTICE'
            ? ASSESSMENT_CTA.NOTICE.zh.primary
            : ASSESSMENT_CTA.INFO.zh.primary,
      },
      {
        type: 'ACKNOWLEDGE',
        label:
          status === 'NOTICE'
            ? ASSESSMENT_CTA.NOTICE.zh.secondary
            : ASSESSMENT_CTA.INFO.zh.secondary,
      },
    ],
    dataFreshness: {
      assessedAt,
      roadStatusUpdatedAt: grounding?.roadStatusUpdatedAt,
    },
    verificationStatus,
    writesPlanVersion: false,
  };
}

function intentLabel(intent: ObservationIntent): string {
  switch (intent) {
    case 'CHECK_VEHICLE':
      return '检查车辆';
    case 'CHECK_ROAD':
      return '检查道路';
    case 'CHECK_ACTIVITY_ENTRY':
      return '确认活动入口';
    case 'CHECK_PARKING':
      return '核对停车规则';
    case 'CHECK_RENTAL_HANDOVER':
      return '租车取还车留证';
  }
}

/** Guard: must never emit road EXECUTION_BLOCK without GPS */
export function assertNoGpsRoadBlockSafety(
  event: TravelObservationEvent,
  assessment: ObservationAssessment,
): void {
  if (hasGps(event)) return;
  if (assessment.status === 'EXECUTION_BLOCK') {
    throw new Error(
      'Q5 violation: road-based EXECUTION_BLOCK forbidden without GPS',
    );
  }
  const hasPreview = assessment.actions.some((a) => a.type === 'PREVIEW');
  if (hasPreview && event.intent === 'CHECK_ROAD') {
    throw new Error(
      'Q5 violation: alternate-route Preview forbidden without GPS',
    );
  }
}
