import { Injectable } from '@nestjs/common';

/**
 * 记录「已成功完成的外部工具调用 / 写路径」的幂等键。
 * - 执行前：用 `hasCommitted` 判断是否应跳过（重试防重复计费）。
 * - 成功后：调用 `recordSuccessfulToolCall` 登记。
 * Phase 1 为进程内 Map；后续可换 Redis。
 */
@Injectable()
export class HarnessIdempotencyRegistryService {
  private readonly committedByRequest = new Map<string, Set<string>>();

  hasCommitted(requestId: string, idempotencyKey: string): boolean {
    const k = String(idempotencyKey).trim();
    if (k === '') return false;
    return this.committedByRequest.get(requestId)?.has(k) ?? false;
  }

  recordSuccessfulToolCall(requestId: string, idempotencyKey: string): void {
    const k = String(idempotencyKey).trim();
    if (k === '') return;
    let set = this.committedByRequest.get(requestId);
    if (!set) {
      set = new Set();
      this.committedByRequest.set(requestId, set);
    }
    set.add(k);
  }

  clearRequest(requestId: string): void {
    this.committedByRequest.delete(requestId);
  }
}
