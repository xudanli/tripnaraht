/**
 * Reset formal shadow observation window (archive pre-v2 / pre-build snapshots).
 *
 * Usage: npm run execution-risk-shadow:reset-window
 */

import 'dotenv/config';
import { resetShadowObservationWindow } from '../../src/trips/execution-risk-center/shadow/execution-risk-shadow-observation.store';

const reason = process.env.ERC_SHADOW_RESET_REASON ?? 'new build / clusterVisibility gate';

const dataset = resetShadowObservationWindow(undefined, reason);
console.log(
  `[erc-shadow-reset] observation window reset reason=${reason} ` +
    `openedAt=${dataset.observationWindowOpenedAt} activeBuild=${dataset.activeBuildSha}`,
);
