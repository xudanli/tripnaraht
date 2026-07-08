import {
  assertBlockerLayer,
  type BlockerAssertionResult,
} from '../blockers/blocker-case.schema';
import { textContainsAnySnippet } from './memory-delete.assertions';

export function assertPrivateWishNotVisibleToPeer(input: {
  ownerContextText: string;
  peerContextText: string;
  forbiddenSnippets: string[];
  peerUserId: string;
}): BlockerAssertionResult[] {
  const peerHits = input.forbiddenSnippets.filter((s) => input.peerContextText.includes(s));
  const ownerHasSecret = input.forbiddenSnippets.some((s) => input.ownerContextText.includes(s));

  return [
    assertBlockerLayer(
      'memory_canonical',
      'owner_can_still_use_own_private_wish',
      ownerHasSecret,
      true,
      ownerHasSecret,
      'Owner should retain their private wish for decision use',
    ),
    assertBlockerLayer(
      'assembled_context',
      'peer_context_excludes_private_wish_text',
      peerHits.length === 0,
      'none of forbidden snippets',
      peerHits.length ? peerHits : 'clean',
      `Peer ${input.peerUserId} must not receive owner private wish: ${peerHits.join(', ')}`,
    ),
    assertBlockerLayer(
      'policy',
      'peer_assembled_context_no_pdi_leak',
      !textContainsAnySnippet(input.peerContextText, input.forbiddenSnippets),
      false,
      peerHits.length > 0,
    ),
  ];
}
