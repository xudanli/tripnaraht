import {
  runOpenWorldDiscoveryBuffer,
  type RunOpenWorldDiscoveryBufferInput,
} from '../../planning-policy/open-world/discovery-buffer.util';
import type { LlmService } from '../../llm/services/llm.service';
import { extractOpenWorldMentionsViaLlm } from './open-world-llm-mention-extractor.util';

/** L1 异步管道：规则 mention + 可选 LLM mention → Discovery Buffer */
export async function runOpenWorldDiscoveryPipeline(
  input: RunOpenWorldDiscoveryBufferInput,
  deps?: { llmService?: LlmService },
): Promise<ReturnType<typeof runOpenWorldDiscoveryBuffer>> {
  const llmMentions = await extractOpenWorldMentionsViaLlm(deps?.llmService, input.userMessage, {
    countryCode: input.countryCode,
    destinationHint: input.destinationHint,
  });
  return runOpenWorldDiscoveryBuffer({
    ...input,
    extraMentions: llmMentions,
  });
}
