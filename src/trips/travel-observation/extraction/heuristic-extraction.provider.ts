import { Injectable } from '@nestjs/common';
import type { ObservationExtractionProvider } from './provider.interface';
import {
  CONFIDENCE_THRESHOLDS,
  PRE_ONTOLOGY_KEYS,
  type ObservationModelInput,
  type RawVisualObservation,
  type RawVisualSceneType,
} from './raw-visual.types';

/**
 * S2 heuristic extractor — derives RawVisualObservation from OCR text seed /
 * userQuestion / mediaRef tokens. No cloud multimodal required.
 * Swap for Multimodal/OCR provider behind the same interface later.
 */
@Injectable()
export class HeuristicExtractionProvider
  implements ObservationExtractionProvider
{
  readonly providerId = 'heuristic-ocr-v1';

  async extract(input: ObservationModelInput): Promise<RawVisualObservation> {
    const corpus = buildCorpus(input);
    const recognizedText = tokenizeRecognized(corpus);
    const facts: RawVisualObservation['extractedFacts'] = [];
    const objects: RawVisualObservation['detectedObjects'] = [];
    const uncertainties: string[] = [];
    const requiredAdditionalViews: string[] = [];

    const sceneType = sceneForIntent(input.intent);

    if (input.intent === 'CHECK_ROAD' || /F\d{2,3}/i.test(corpus)) {
      const road = matchRoadId(corpus);
      if (road) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.ROAD_ID,
          value: road.id,
          confidence: road.confidence,
        });
        if (/^F/i.test(road.id)) {
          facts.push({
            key: PRE_ONTOLOGY_KEYS.ROAD_FROAD_SIGN,
            value: true,
            confidence: road.confidence,
          });
          objects.push({
            type: 'road_sign',
            subtype: 'froad',
            confidence: road.confidence,
          });
        } else {
          objects.push({
            type: 'road_sign',
            subtype: 'road_number',
            confidence: road.confidence,
          });
        }
      } else if (input.intent === 'CHECK_ROAD') {
        uncertainties.push('ROAD_ID_NOT_READABLE');
        requiredAdditionalViews.push(
          '请靠近拍摄道路编号标志，保持文字完整并避免反光。',
        );
      }

      if (/(closed|lokað|no entry|禁止|封路|road closed)/i.test(corpus)) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.ROAD_CLOSED_SIGN,
          value: true,
          confidence: 0.82,
        });
        objects.push({
          type: 'road_sign',
          subtype: 'closed',
          confidence: 0.82,
        });
      }
      if (/(gravel|malbik|碎石|rough)/i.test(corpus)) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.ROAD_GRAVEL,
          value: true,
          confidence: 0.72,
        });
      }
      if (/(ford|water crossing|涉水|vatn)/i.test(corpus)) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.ROAD_WATER,
          value: true,
          confidence: 0.7,
        });
      }
    }

    if (input.intent === 'CHECK_VEHICLE' || /yaris|toyota|land\s*cruiser|4wd|2wd/i.test(corpus)) {
      const model = matchVehicleModel(corpus);
      if (model) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.VEHICLE_MODEL,
          value: model.name,
          confidence: model.confidence,
        });
        objects.push({
          type: 'vehicle',
          subtype: model.name,
          confidence: model.confidence,
        });
        if (model.vehicleClass) {
          facts.push({
            key: PRE_ONTOLOGY_KEYS.VEHICLE_CLASS,
            value: model.vehicleClass,
            confidence: Math.min(model.confidence, 0.75),
          });
        }
      } else if (input.intent === 'CHECK_VEHICLE') {
        uncertainties.push('VEHICLE_MODEL_UNKNOWN');
        requiredAdditionalViews.push(
          '请靠近拍摄车辆尾部的车型标识，保持文字完整并避免反光。',
        );
      }

      const dt = matchDrivetrain(corpus);
      if (dt) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.VEHICLE_DRIVETRAIN,
          value: dt.value,
          confidence: dt.confidence,
        });
        if (dt.confidence < CONFIDENCE_THRESHOLDS.VEHICLE_DRIVETRAIN) {
          uncertainties.push('VEHICLE_DRIVETRAIN_LOW_CONFIDENCE');
          requiredAdditionalViews.push(
            '请补拍仪表盘或租车合同中的驱动类型说明。',
          );
        }
      } else if (input.intent === 'CHECK_VEHICLE') {
        uncertainties.push('VEHICLE_DRIVETRAIN_UNKNOWN');
        // Do NOT infer SUV => 4WD
        requiredAdditionalViews.push(
          '请补拍车型尾标或合同中的 2WD/4WD 说明；外观不能单独认定四驱。',
        );
      }
    }

    if (
      input.intent === 'CHECK_ACTIVITY_ENTRY' ||
      /booking\s*center|visitor\s*centre|游客中心/i.test(corpus)
    ) {
      const op = matchOperator(corpus);
      if (op) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.ACTIVITY_OPERATOR,
          value: op.name,
          confidence: op.confidence,
        });
        facts.push({
          key: PRE_ONTOLOGY_KEYS.ACTIVITY_ENTRY,
          value: true,
          confidence: op.confidence,
        });
        objects.push({
          type: 'activity_sign',
          subtype: op.name,
          confidence: op.confidence,
        });
      } else if (input.intent === 'CHECK_ACTIVITY_ENTRY') {
        uncertainties.push('OPERATOR_SIGN_UNKNOWN');
        requiredAdditionalViews.push(
          '请拍摄入口招牌或运营商名称，避免遮挡。',
        );
      }
    }

    if (
      input.intent === 'CHECK_PARKING' ||
      /(parking|p-zone|no parking|禁止停车|停车|gjaldskylda|bílastæði)/i.test(
        corpus,
      )
    ) {
      const parking = matchParking(corpus);
      if (parking.signDetected) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.PARKING_SIGN,
          value: true,
          confidence: parking.confidence,
        });
        objects.push({
          type: 'parking_sign',
          confidence: parking.confidence,
        });
      }
      if (parking.noParking) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.PARKING_NO_PARKING,
          value: true,
          confidence: parking.confidence,
        });
      }
      if (parking.paid) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.PARKING_PAID,
          value: true,
          confidence: parking.confidence,
        });
      }
      if (parking.timeLimit) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.PARKING_TIME_LIMIT,
          value: parking.timeLimit,
          confidence: parking.confidence,
        });
      }
      if (parking.residentOnly) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.PARKING_RESIDENT_ONLY,
          value: true,
          confidence: parking.confidence,
        });
      }
      if (parking.incomplete || (input.intent === 'CHECK_PARKING' && !parking.signDetected)) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.PARKING_INCOMPLETE,
          value: true,
          confidence: 0.9,
        });
        uncertainties.push('PARKING_RULE_INCOMPLETE');
        requiredAdditionalViews.push(
          '请拍摄完整停车牌及下方附加牌，避免裁切时间与例外说明。',
        );
      }
    }

    if (
      input.intent === 'CHECK_RENTAL_HANDOVER' ||
      /(odometer|mileage|km\s*\d|scratch|dent|划痕|里程|油量|fuel\s*gauge)/i.test(
        corpus,
      )
    ) {
      const rental = matchRental(corpus, input);
      if (rental.handoverType) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.RENTAL_HANDOVER_TYPE,
          value: rental.handoverType,
          confidence: 0.9,
        });
      }
      if (rental.mileage != null) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.RENTAL_MILEAGE,
          value: rental.mileage,
          confidence: 0.82,
        });
        objects.push({ type: 'dashboard', subtype: 'odometer', confidence: 0.82 });
      }
      if (rental.fuel) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.RENTAL_FUEL,
          value: rental.fuel,
          confidence: 0.8,
        });
      }
      if (rental.plate) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.RENTAL_PLATE,
          value: rental.plate,
          confidence: 0.78,
        });
      }
      if (rental.damage) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.RENTAL_DAMAGE,
          value: rental.damage,
          confidence: 0.7,
        });
        objects.push({
          type: 'vehicle_damage',
          subtype: 'suspected',
          confidence: 0.7,
        });
      }
      if (input.intent === 'CHECK_RENTAL_HANDOVER' && rental.viewsIncomplete) {
        facts.push({
          key: PRE_ONTOLOGY_KEYS.RENTAL_VIEWS_INCOMPLETE,
          value: true,
          confidence: 1,
        });
        uncertainties.push('RENTAL_VIEWS_INCOMPLETE');
        requiredAdditionalViews.push(
          '请按引导补拍车辆四角、左右侧面、前后与仪表盘。',
        );
      }
    }

    if (recognizedText.length === 0) {
      uncertainties.push('OCR_EMPTY');
      if (requiredAdditionalViews.length === 0) {
        requiredAdditionalViews.push(
          '图片中未识别到清晰文字，请靠近主体并避免反光后重拍。',
        );
      }
    }

    return {
      sceneType,
      detectedObjects: objects,
      recognizedText,
      extractedFacts: facts,
      uncertainties: [...new Set(uncertainties)],
      requiredAdditionalViews: [...new Set(requiredAdditionalViews)],
    };
  }
}

function buildCorpus(input: ObservationModelInput): string {
  const parts = [
    input.ocrTextSeed ?? '',
    input.userQuestion ?? '',
    ...input.images.map((i) => i.mediaRef.replace(/[_-]/g, ' ')),
  ];
  return parts.join('\n');
}

function tokenizeRecognized(
  corpus: string,
): RawVisualObservation['recognizedText'] {
  return corpus
    .split(/[\n,;|/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 40)
    .map((text) => ({
      text,
      confidence: 0.8,
    }));
}

function sceneForIntent(
  intent: ObservationModelInput['intent'],
): RawVisualSceneType {
  switch (intent) {
    case 'CHECK_VEHICLE':
      return 'VEHICLE';
    case 'CHECK_ROAD':
      return 'ROAD_SIGN';
    case 'CHECK_ACTIVITY_ENTRY':
      return 'ACTIVITY_ENTRY';
    case 'CHECK_PARKING':
      return 'PARKING_SIGN';
    case 'CHECK_RENTAL_HANDOVER':
      return 'RENTAL_HANDOVER';
  }
}

function matchRental(
  corpus: string,
  input: ObservationModelInput,
): {
  handoverType?: 'PICKUP' | 'RETURN';
  mileage?: number;
  fuel?: string;
  plate?: string;
  damage?: string;
  viewsIncomplete: boolean;
} {
  const handoverType = /return|还车/i.test(corpus)
    ? 'RETURN'
    : /pickup|取车|check[\s-]?out/i.test(corpus)
      ? 'PICKUP'
      : input.intent === 'CHECK_RENTAL_HANDOVER'
        ? 'PICKUP'
        : undefined;
  const mileageMatch = corpus.match(
    /(?:odometer|mileage|里程|km)[^\d]{0,8}(\d{3,7})/i,
  ) || corpus.match(/\b(\d{4,7})\s*km\b/i);
  const fuelMatch =
    corpus.match(/(?:fuel|油量|charge|电量)[^\d%]{0,12}(\d{1,3}\s*%?)/i) ||
    corpus.match(/\b(full|3\/4|1\/2|1\/4|empty|满|半)\b/i);
  const plateMatch = corpus.match(
    /\b([A-Z]{1,3}[-\s]?\d{2,3}[-\s]?\d{2,3})\b/i,
  );
  const damage = /(scratch|dent|划痕|凹陷|scuff)/i.test(corpus)
    ? 'suspected_surface_damage'
    : undefined;
  const mediaCount = input.images.length;
  // Align with RENTAL_P0_REQUIRED_VIEWS length (9) — partial sets stay NEED_CONFIRM
  const viewsIncomplete =
    input.intent === 'CHECK_RENTAL_HANDOVER' && mediaCount < 9;

  return {
    handoverType,
    mileage: mileageMatch ? Number(mileageMatch[1]) : undefined,
    fuel: fuelMatch ? String(fuelMatch[1]).trim() : undefined,
    plate: plateMatch ? plateMatch[1].toUpperCase() : undefined,
    damage,
    viewsIncomplete,
  };
}

function matchParking(corpus: string): {
  signDetected: boolean;
  noParking: boolean;
  paid: boolean;
  residentOnly: boolean;
  incomplete: boolean;
  timeLimit?: string;
  confidence: number;
} {
  const noParking =
    /(no\s*parking|禁止停车|停车禁止|stopp\s*forboðið|no\s*stopping)/i.test(
      corpus,
    );
  const paid =
    /(pay|paid|ticket|缴费|付费|gjaldskylda|parking\s*meter)/i.test(corpus);
  const residentOnly =
    /(resident|居民|permit\s*only|许可证)/i.test(corpus);
  const time =
    corpus.match(/\b([01]?\d|2[0-3])[:.：]([0-5]\d)\b/) ||
    corpus.match(/until\s+(\d{1,2}[:.]\d{2})/i) ||
    corpus.match(/至\s*(\d{1,2}[:：]\d{2})/);
  const timeLimit = time
    ? String(time[1]).includes(':') || String(time[1]).includes('.')
      ? String(time[1]).replace('.', ':')
      : `${time[1]}:${time[2] ?? '00'}`
    : undefined;
  const signDetected =
    noParking ||
    paid ||
    residentOnly ||
    !!timeLimit ||
    /(parking|停车|bílastæði|p-zone)/i.test(corpus);
  const incomplete =
    !noParking &&
    signDetected &&
    !paid &&
    !residentOnly &&
    !timeLimit;

  return {
    signDetected,
    noParking,
    paid,
    residentOnly,
    incomplete: incomplete || !signDetected,
    timeLimit: time
      ? `${String(time[1]).padStart(2, '0')}:${String(time[2] ?? '00').padStart(2, '0')}`
      : undefined,
    confidence: signDetected ? 0.84 : 0.5,
  };
}

function matchRoadId(
  corpus: string,
): { id: string; confidence: number } | null {
  const f = corpus.match(/\bF\s*([0-9]{2,3})\b/i);
  if (f) {
    return { id: `F${f[1]}`, confidence: 0.88 };
  }
  const plain = corpus.match(/\b([0-9]{1,3})\b/);
  // Only accept plain numbers when explicitly labeled road/route
  if (/(route|road|公路|þjóðvegur)/i.test(corpus) && plain) {
    return { id: plain[1], confidence: 0.7 };
  }
  return null;
}

function matchVehicleModel(corpus: string): {
  name: string;
  confidence: number;
  vehicleClass?: string;
} | null {
  if (/land\s*cruiser/i.test(corpus)) {
    return {
      name: 'Toyota Land Cruiser',
      confidence: 0.86,
      vehicleClass: 'SUV_4WD',
    };
  }
  if (/yaris/i.test(corpus)) {
    return {
      name: 'Toyota Yaris',
      confidence: 0.84,
      vehicleClass: 'SEDAN',
    };
  }
  if (/toyota\s+rav4/i.test(corpus)) {
    return {
      name: 'Toyota RAV4',
      confidence: 0.8,
      vehicleClass: 'SUV_4WD',
    };
  }
  if (/camper|motorhome|房车/i.test(corpus)) {
    return {
      name: 'Campervan',
      confidence: 0.75,
      vehicleClass: 'CAMPERVAN',
    };
  }
  return null;
}

function matchDrivetrain(
  corpus: string,
): { value: '2WD' | '4WD'; confidence: number } | null {
  // Explicit only — never infer from SUV body
  if (/\b4x4\b|\b4wd\b|四驱/i.test(corpus)) {
    return { value: '4WD', confidence: 0.9 };
  }
  if (/\b2wd\b|两驱|前驱/i.test(corpus)) {
    return { value: '2WD', confidence: 0.9 };
  }
  // Low-confidence AWD mention → still map to UNKNOWN path via low conf
  if (/\bawd\b|全时四驱/i.test(corpus)) {
    return { value: '4WD', confidence: 0.7 }; // below 0.85 threshold
  }
  return null;
}

function matchOperator(
  corpus: string,
): { name: string; confidence: number } | null {
  if (/booking\s*center/i.test(corpus)) {
    return { name: 'Booking Center', confidence: 0.85 };
  }
  if (/visitor\s*cent(er|re)|游客中心/i.test(corpus)) {
    return { name: 'Visitor Centre', confidence: 0.8 };
  }
  return null;
}
