/**
 * iceland.fRoadStatus — 统一 F-road「物理权限」视图（road.is → 结构化契约）。
 * 与 `fRoadCheck`（gate）互补：本 skill 面向编排与世界模型，不做 ALLOW/BLOCK 裁决。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { RoadStatusRealtimeService } from './services/road-status-realtime.service';
import type { FRoadStatus } from './iceland-world-driving-contracts';
import { mapRoadStatusToFRoadStatus } from './utils/iceland-f-road-status-mapper.util';

export interface IcelandFRoadStatusInput extends SkillInput {
  request_id: string;
  /** 要查询的 F-road 编号，如 ["F208","F910"] */
  roadIds: string[];
}

export interface IcelandFRoadStatusOutput extends SkillOutput {
  roads: FRoadStatus[];
  /** 已尝试或主依赖的数据源标签（供证据链） */
  sources: string[];
  dataGaps: string[];
}

@SkillDecorator({
  name: 'iceland.fRoadStatus',
  description:
    '冰岛 F-road 基础设施态：开放/封闭/积雪/不可通行、4x4、涉水、房车限制与置信度；统一 road.is 管线（可扩展 SafeTravel / Vegagerðin 表）。',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class IcelandFRoadStatusSkill implements Skill<IcelandFRoadStatusInput, IcelandFRoadStatusOutput> {
  private readonly logger = new Logger(IcelandFRoadStatusSkill.name);

  metadata = {
    name: 'iceland.fRoadStatus',
    description:
      '冰岛 F-road 统一状态契约（开放/积雪/不可通行、4x4、涉水、房车限制、confidence）。',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['request_id', 'roadIds'],
      typeChecks: {
        request_id: { type: 'string' as const },
        roadIds: { type: 'array' as const, min: 1 },
      },
    },
  };

  constructor(private readonly roadStatus: RoadStatusRealtimeService) {}

  async execute(input: IcelandFRoadStatusInput): Promise<IcelandFRoadStatusOutput> {
    const ids = Array.from(
      new Set(
        (input.roadIds || [])
          .map((r) => String(r || '').trim().toUpperCase())
          .filter((r) => /^F\d{1,4}$/i.test(r)),
      ),
    );
    const roads: FRoadStatus[] = [];
    const dataGaps: string[] = [];

    for (const id of ids) {
      try {
        const rs = await this.roadStatus.getRoadStatus(id);
        if (!rs) {
          dataGaps.push(`${id}: no_status_from_road_pipeline`);
          continue;
        }
        roads.push(mapRoadStatusToFRoadStatus(rs));
      } catch (e: any) {
        this.logger.warn(`[iceland.fRoadStatus] ${id}: ${e?.message ?? e}`);
        dataGaps.push(`${id}: fetch_error`);
      }
    }

    return {
      roads,
      sources: ['road.is_api_or_cache', 'vegagerdin_gagnaveita_fallback_when_configured'],
      dataGaps,
    };
  }
}
