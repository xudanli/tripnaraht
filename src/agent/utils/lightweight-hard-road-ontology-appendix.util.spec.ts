import {
  buildLightweightHardOntologyAppendixLines,
  buildOntologyEvidenceDisplayLinesZh,
  collectMatchedOntologyRegionDefinitions,
  shouldInjectLightweightHardRoadOntologyLayer,
} from './lightweight-hard-road-ontology-appendix.util';
import type { OntologyRegionRoadStatusPayload } from '../../infrastructure/external/road-is/ontology-road-status-provider.service';

describe('lightweight-hard-road-ontology-appendix', () => {
  const icelandTripCtx = '目的地代码: IS-REK\n开始日期: 2026-06-01\n草案地点速览\n- 教会山';

  it('shouldInject: 问句含斯奈山 + 冰岛行程 → true', () => {
    expect(
      shouldInjectLightweightHardRoadOntologyLayer('自驾斯奈山半岛有什么要求', '自驾斯奈山半岛有什么要求', icelandTripCtx),
    ).toBe(true);
  });

  it('shouldInject: 行程含教会山 + 自驾意图 → true', () => {
    expect(
      shouldInjectLightweightHardRoadOntologyLayer('自驾有什么要注意的', '自驾有什么要注意的', icelandTripCtx),
    ).toBe(true);
  });

  it('shouldInject: 无冰岛语境 → false', () => {
    expect(
      shouldInjectLightweightHardRoadOntologyLayer('自驾有什么要注意的', '自驾有什么要注意的', '目的地代码: JP-TOK'),
    ).toBe(false);
  });

  it('buildOntologyEvidenceDisplayLinesZh: 自然语言摘要', () => {
    const statusMap = new Map<string, OntologyRegionRoadStatusPayload>([
      [
        'ontology:region:IS:SNAEFELLSNES',
        {
          ontologyNodeId: 'ontology:region:IS:SNAEFELLSNES',
          aggregateAccessState: 'OPEN',
          segments: [
            {
              roadQueryKey: '54',
              source: 'road_is_provider',
              accessState: 'OPEN',
              condition: 'OPEN',
            },
          ],
        },
      ],
    ]);
    const hits = collectMatchedOntologyRegionDefinitions({
      message: '斯奈山',
      msgLower: '斯奈山',
      tripContextText: icelandTripCtx,
    });
    const zh = buildOntologyEvidenceDisplayLinesZh({ hits, roadStatusByOntologyId: statusMap });
    expect(zh[0]).toContain('系统已根据');
    expect(zh.some((l) => l.includes('斯奈山半岛'))).toBe(true);
    expect(zh.some((l) => l.includes('可正常通行'))).toBe(true);
  });

  it('buildLines: 命中斯奈山节点且共位', () => {
    const lines = buildLightweightHardOntologyAppendixLines({
      message: '斯奈山路况怎样',
      msgLower: '斯奈山路况怎样',
      tripContextText: icelandTripCtx,
    });
    expect(lines.some((l) => l.includes('ontology:region:IS:SNAEFELLSNES'))).toBe(true);
    expect(lines.some((l) => l.includes('共位锚点'))).toBe(true);
  });

  it('buildLines: 注入路况真值子块', () => {
    const statusMap = new Map<string, OntologyRegionRoadStatusPayload>([
      [
        'ontology:region:IS:SNAEFELLSNES',
        {
          ontologyNodeId: 'ontology:region:IS:SNAEFELLSNES',
          aggregateAccessState: 'IMPASSABLE',
          segments: [
            {
              roadQueryKey: '54',
              source: 'road_is_provider',
              accessState: 'IMPASSABLE',
              condition: 'CLOSED',
            },
          ],
        },
      ],
    ]);
    const lines = buildLightweightHardOntologyAppendixLines({
      message: '斯奈山路况怎样',
      msgLower: '斯奈山路况怎样',
      tripContextText: icelandTripCtx,
      roadStatusByOntologyId: statusMap,
    });
    expect(lines.some((l) => l.includes('路况真值'))).toBe(true);
    expect(lines.some((l) => l.includes('IMPASSABLE'))).toBe(true);
  });
});
