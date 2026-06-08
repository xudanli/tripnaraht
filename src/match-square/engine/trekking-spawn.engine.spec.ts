import { parseVibeFreeTextWithRules } from './vibe-llm-parse.engine';
import { buildTrekkingVibeOrchestrationPlan } from './trekking-vibe-orchestration.engine';
import {
  listPlannedRouteCandidates,
  pickLiveRouteCandidate,
  toRouteResolution,
} from './trekking-spawn.engine';

const LAUGAVEGUR_TEXT =
  '2026年盛夏冰岛兰格维格 Laugavegur 55公里重装徒步，Landmannalaugar 到 Þórsmörk，12.5米 DEM 离线 3D 路线包已导入，冰川强涉水，内陆断网，Plan B，LNT 无痕山林。';

describe('trekking-spawn.engine', () => {
  it('picks IS_LAUGAVEGUR live route for iceland laugavegur script', () => {
    const plan = buildTrekkingVibeOrchestrationPlan(parseVibeFreeTextWithRules(LAUGAVEGUR_TEXT));
    expect(plan).not.toBeNull();
    expect(plan!.scriptId).toBe('iceland_laugavegur_heavy_trek');

    const live = pickLiveRouteCandidate(plan!);
    expect(live?.routeDirectionName).toBe('IS_LAUGAVEGUR');
    expect(live?.availability).toBe('live');
    expect(live?.offlinePackKey).toBe('is-laugavegur');

    expect(listPlannedRouteCandidates(plan!)).toHaveLength(0);

    expect(toRouteResolution(live!, 106)).toEqual(
      expect.objectContaining({
        routeDirectionId: 106,
        routeDirectionName: 'IS_LAUGAVEGUR',
      }),
    );
  });
});
