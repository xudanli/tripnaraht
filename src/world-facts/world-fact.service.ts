import { Injectable, Logger } from '@nestjs/common';
import { WorldFactRepository } from './world-fact.repository';
import type { WorldFactAppendInput } from './world-fact.types';

/**
 * Append-only ingest：同 factKey 新行可链接 supersedes（审计链），不原地更新。
 */
@Injectable()
export class WorldFactService {
  private readonly logger = new Logger(WorldFactService.name);

  constructor(private readonly repo: WorldFactRepository) {}

  async append(input: WorldFactAppendInput): Promise<{ id: string }> {
    const prevId = await this.repo.findLatestIdByFactKey(input.factKey);
    const row = await this.repo.append({
      ...input,
      supersedesFactId: prevId,
    });
    this.logger.debug(`WorldFact append factKey=${input.factKey} id=${row.id} supersedes=${prevId ?? 'none'}`);
    return { id: row.id };
  }
}
