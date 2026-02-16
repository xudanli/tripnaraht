// src/agent/context-engine/services/execution-history-compressor.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionHistoryCompressorService } from './execution-history-compressor.service';

describe('ExecutionHistoryCompressorService', () => {
  let service: ExecutionHistoryCompressorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutionHistoryCompressorService],
    }).compile();
    service = module.get<ExecutionHistoryCompressorService>(ExecutionHistoryCompressorService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  it('DECISION_LOG 超长时应压缩', () => {
    const longLines = Array.from({ length: 10 }, (_, i) =>
      `[Agent${i}] 这是一条很长的决策说明文字，用于测试压缩逻辑是否能正确触发并生成摘要 ${i}`,
    );
    const longText = longLines.join('\n');
    const blocks = [
      {
        key: 'DECISION_LOG',
        type: 'DECISION_LOG',
        text: longText,
        priority: 70,
        visibility: 'public' as const,
        provenance: { source: 'db' as const, identifier: 'x', timestamp: '' },
      },
    ];
    const result = service.compress(blocks);
    expect(result[0].text.length).toBeLessThan(blocks[0].text.length);
    expect(result[0].text).toContain('共 10 条决策');
  });

  it('非执行类型块应原样返回', () => {
    const blocks = [
      {
        key: 'WORLD_MODEL',
        type: 'WORLD_MODEL',
        text: '很长的世界模型描述...',
        priority: 90,
        visibility: 'public' as const,
        provenance: { source: 'db' as const, identifier: 'x', timestamp: '' },
      },
    ];
    const result = service.compress(blocks);
    expect(result[0].text).toBe(blocks[0].text);
  });
});
