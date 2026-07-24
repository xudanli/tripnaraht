/**
 * Page AI Contract registry — Nest injectable wrapper over frozen contracts.
 * Unknown / stub-only pages → PAGE_CONTRACT_NOT_FOUND (no universal prompt).
 */

import { Injectable } from '@nestjs/common';
import type { PageAIContract, PageId } from '../contracts/page-insight.types';
import {
  getPageAIContract,
  isPageAIContractLive,
  listRegisteredPageAIContracts,
} from '../contracts/page-ai-contracts';

export class PageContractNotFoundError extends Error {
  readonly code = 'PAGE_CONTRACT_NOT_FOUND';

  constructor(pageId: string) {
    super(`No live PageAIContract for pageId=${pageId}`);
    this.name = 'PageContractNotFoundError';
  }
}

@Injectable()
export class PageAIContractRegistry {
  get(pageId: PageId): PageAIContract {
    const contract = getPageAIContract(pageId);
    if (!contract || !isPageAIContractLive(pageId)) {
      throw new PageContractNotFoundError(pageId);
    }
    return contract;
  }

  tryGet(pageId: PageId): PageAIContract | undefined {
    return getPageAIContract(pageId);
  }

  list(): PageAIContract[] {
    return listRegisteredPageAIContracts();
  }
}
