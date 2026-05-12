import type { DraftPromptAssemblyInput } from './draft-prompt-assembly.types';
import { renderContextSupplementLayer } from './layers/context-supplement.layer';
import { renderIdentityLayer } from './layers/identity.layer';
import { renderWorldCalendarLayer } from './layers/world.layer';
import { renderUserIntentLayer } from './layers/user-intent.layer';
import { renderStructuredConstraintLayer } from './layers/constraint.layer';
import { renderTopologyLayer } from './layers/topology.layer';
import { renderPlanningPolicyLayer } from './layers/planning-policy.layer';
import { renderUncertaintyLayer } from './layers/uncertainty.layer';
import { renderOutputContractLayer } from './layers/output-contract.layer';

/** 通用区块分隔（与原模板一致） */
const BLOCK_SEP = '\n\n---\n\n';

/** Identity（表格结束后的空行）之后 → World（日历）：原模板为「空行 + --- + 空行 + 日历」 */
const IDENTITY_TO_WORLD = '---\n\n';

/**
 * Prompt Runtime：按固定顺序组装 Experience Draft Synthesis 全文（与原 TripDraftService 单模板逐段等价）。
 */
export function assembleExperienceDraftPrompt(input: DraftPromptAssemblyInput): string {
  const contextPrefix = renderContextSupplementLayer(input.contextBlocks);
  const identity = renderIdentityLayer();
  const world = renderWorldCalendarLayer(input.days, input.timezone);
  const userIntent = renderUserIntentLayer(input.dto);
  const constraint = renderStructuredConstraintLayer(input.dto);
  const topology = renderTopologyLayer(input.candidates);
  const planningPolicy = renderPlanningPolicyLayer();
  const uncertainty = renderUncertaintyLayer();
  const outputContract = renderOutputContractLayer();

  return (
    `${contextPrefix}${identity}${IDENTITY_TO_WORLD}${world}` +
    `${BLOCK_SEP}${userIntent}\n\n${constraint}` +
    `${BLOCK_SEP}${topology}` +
    `${BLOCK_SEP}${planningPolicy}` +
    `${BLOCK_SEP}${uncertainty}` +
    `${BLOCK_SEP}${outputContract}`
  );
}
