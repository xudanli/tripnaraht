// scripts/svalbard/pickup-point-scorer.ts
/**
 * 斯瓦尔巴出海集合点/码头评分器
 * 
 * 根据 OSM tags 和地理位置特征，计算每个候选点的 pickup_score
 * 用于识别"最可能的出海集合点"
 */

export interface PickupPointCandidate {
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  lat: number;
  lng: number;
  tags: Record<string, string>;
  name?: string;
  nameEN?: string;
}

export interface ScoredPickupPoint extends PickupPointCandidate {
  pickupScore: number;
  scoreBreakdown: {
    baseScore: number;
    tagsScore: number;
    contactScore: number;
    locationScore: number;
    penaltyScore: number;
  };
  reasons: string[]; // 解释为什么认为它是集合点
  distanceToCoastline?: number; // 距离海岸线的距离（米）
}

/**
 * 计算出海集合点评分
 * 
 * 评分规则：
 * +100: amenity=ferry_terminal（强信号）
 * +60: man_made=pier（中强信号）
 * +40: leisure=marina / landuse=harbour（港区语义）
 * +30: 带 tourism=information（游客中心/集合说明更清晰）
 * +20: 有 website/phone/opening_hours（可联系/可核验）
 * +10: 离"城镇中心/酒店聚集区"近（可以用 POI 密度或 Longyearbyen place 节点做中心）
 * -30: 明显是 cargo/industrial（如果 tags 暗示货运港区）
 */
export function scorePickupPoint(
  candidate: PickupPointCandidate,
  options?: {
    distanceToCoastline?: number; // 距离海岸线的距离（米）
    distanceToTownCenter?: number; // 距离城镇中心的距离（米）
    townCenterLat?: number;
    townCenterLng?: number;
  }
): ScoredPickupPoint {
  const tags = candidate.tags;
  const reasons: string[] = [];
  let baseScore = 0;
  let tagsScore = 0;
  let contactScore = 0;
  let locationScore = 0;
  let penaltyScore = 0;

  // 1. Base Score（基于主要 tag）
  if (tags.amenity === 'ferry_terminal') {
    baseScore = 100;
    reasons.push('强信号：ferry_terminal（渡轮 terminal）');
  } else if (tags.man_made === 'pier') {
    baseScore = 60;
    reasons.push('中强信号：pier（栈桥/码头结构）');
  } else if (tags.leisure === 'marina' || tags.landuse === 'harbour' || tags.water === 'harbour' || tags.harbour) {
    baseScore = 40;
    reasons.push('港区语义：marina/harbour（游艇码头/港区）');
  } else if (tags.waterway === 'dock') {
    baseScore = 30;
    reasons.push('码头语义：dock（船坞）');
  } else if (tags.office === 'tourism' || tags.tourism === 'agency') {
    baseScore = 20;
    reasons.push('旅游服务：tourism office/agency（可能提供集合服务）');
  } else if (tags.amenity === 'boat_rental') {
    baseScore = 15;
    reasons.push('船只租赁：boat_rental（可能作为集合点）');
  }

  // 2. Tags Score（辅助 tag 加分）
  if (tags.tourism === 'information') {
    tagsScore += 30;
    reasons.push('加分：有游客信息中心（集合说明更清晰）');
  }

  // 3. Contact Score（可联系/可核验）
  if (tags.website) {
    contactScore += 10;
    reasons.push('加分：有网站（可核验）');
  }
  if (tags.phone || tags['contact:phone']) {
    contactScore += 10;
    reasons.push('加分：有电话（可联系）');
  }
  if (tags.opening_hours) {
    contactScore += 10;
    reasons.push('加分：有营业时间（可确认开放状态）');
  }

  // 4. Location Score（地理位置）
  if (options?.distanceToCoastline !== undefined) {
    if (options.distanceToCoastline < 300) {
      locationScore += 10;
      reasons.push(`加分：距离海岸线 ${Math.round(options.distanceToCoastline)}m（很近）`);
    } else if (options.distanceToCoastline < 1000) {
      locationScore += 5;
      reasons.push(`加分：距离海岸线 ${Math.round(options.distanceToCoastline)}m（较近）`);
    }
  }

  if (options?.distanceToTownCenter !== undefined && options.distanceToTownCenter < 5000) {
    locationScore += 10;
    reasons.push(`加分：距离城镇中心 ${Math.round(options.distanceToTownCenter)}m（方便到达）`);
  }

  // 5. Penalty Score（扣分项）
  // 检查是否为货运/工业港区
  if (
    tags.cargo ||
    tags.industrial ||
    tags['port:type'] === 'cargo' ||
    tags['harbour:type'] === 'cargo' ||
    tags.name?.toLowerCase().includes('cargo') ||
    tags.name?.toLowerCase().includes('industrial')
  ) {
    penaltyScore = -30;
    reasons.push('扣分：疑似货运/工业港区（不适合游客集合）');
  }

  const totalScore = baseScore + tagsScore + contactScore + locationScore + penaltyScore;

  return {
    ...candidate,
    pickupScore: totalScore,
    scoreBreakdown: {
      baseScore,
      tagsScore,
      contactScore,
      locationScore,
      penaltyScore,
    },
    reasons,
    distanceToCoastline: options?.distanceToCoastline,
  };
}

/**
 * 对候选点列表进行评分和排序
 */
export function scoreAndRankPickupPoints(
  candidates: PickupPointCandidate[],
  options?: {
    coastlineData?: Array<{ lat: number; lng: number }>; // 海岸线点数据（用于计算距离）
    townCenterLat?: number;
    townCenterLng?: number;
  }
): ScoredPickupPoint[] {
  // 计算每个点的评分
  const scored = candidates.map(candidate => {
    // 计算距离海岸线（如果有海岸线数据）
    let distanceToCoastline: number | undefined;
    if (options?.coastlineData && options.coastlineData.length > 0) {
      distanceToCoastline = calculateDistanceToCoastline(
        candidate.lat,
        candidate.lng,
        options.coastlineData
      );
    }

    // 计算距离城镇中心
    let distanceToTownCenter: number | undefined;
    if (options?.townCenterLat && options?.townCenterLng) {
      distanceToTownCenter = calculateDistance(
        candidate.lat,
        candidate.lng,
        options.townCenterLat,
        options.townCenterLng
      );
    }

    return scorePickupPoint(candidate, {
      distanceToCoastline,
      distanceToTownCenter,
      townCenterLat: options?.townCenterLat,
      townCenterLng: options?.townCenterLng,
    });
  });

  // 按分数降序排序
  return scored.sort((a, b) => b.pickupScore - a.pickupScore);
}

/**
 * 计算两点之间的距离（米）
 * 使用 Haversine 公式
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 计算点到海岸线的最短距离（米）
 * 简化版本：计算到所有海岸线点的最短距离
 */
function calculateDistanceToCoastline(
  lat: number,
  lng: number,
  coastlinePoints: Array<{ lat: number; lng: number }>
): number {
  let minDistance = Infinity;
  for (const point of coastlinePoints) {
    const distance = calculateDistance(lat, lng, point.lat, point.lng);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }
  return minDistance;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

