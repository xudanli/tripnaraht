// src/agent/utils/token-calculator.util.spec.ts
/**
 * TokenCalculator 单元测试
 * 
 * 注意：此测试文件需要 Jest 测试框架支持
 * 如果项目尚未配置 Jest，可以使用以下命令安装：
 * npm install --save-dev jest @types/jest ts-jest
 * 
 * 或者使用现有的测试脚本进行手动测试
 * 
 * 当前状态：此文件作为测试示例和模板，需要配置 Jest 后才能运行
 */

import { TokenCalculator } from './token-calculator.util';

describe('TokenCalculator', () => {
  describe('estimateTextTokens', () => {
    it('应该正确处理空值', () => {
      expect(TokenCalculator.estimateTokens(null as any)).toBe(0);
      expect(TokenCalculator.estimateTokens(undefined as any)).toBe(0);
      expect(TokenCalculator.estimateTokens('')).toBe(0);
    });

    it('应该正确估算英文文本', () => {
      // 英文：1 token ≈ 4 字符
      // "Hello World" = 11 字符 ≈ 3 tokens
      const text = 'Hello World';
      const tokens = TokenCalculator.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(10); // 允许一些误差（实际估算为约 3 tokens，但可能略高）
    });

    it('应该正确估算中文文本', () => {
      // 中文：1 token ≈ 1.5 字符
      // "你好世界" = 4 字符 ≈ 3 tokens
      const text = '你好世界';
      const tokens = TokenCalculator.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(10); // 允许一些误差（实际估算为约 3 tokens，但可能略高）
    });

    it('应该正确估算中英文混合文本', () => {
      const text = 'Hello 世界';
      const tokens = TokenCalculator.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('应该处理长文本', () => {
      const longText = 'This is a long text. '.repeat(100);
      const tokens = TokenCalculator.estimateTokens(longText);
      expect(tokens).toBeGreaterThan(0);
      // 约 2100 字符，应该估算为约 500+ tokens
      expect(tokens).toBeGreaterThan(400);
    });
  });

  describe('estimateJsonTokens', () => {
    it('应该正确处理 null 和 undefined', () => {
      expect(TokenCalculator.estimateJsonTokens(null)).toBe(0);
      expect(TokenCalculator.estimateJsonTokens(undefined)).toBe(0);
    });

    it('应该正确估算简单 JSON 对象', () => {
      const obj = { name: 'test', value: 123 };
      const tokens = TokenCalculator.estimateJsonTokens(obj);
      expect(tokens).toBeGreaterThan(0);
    });

    it('应该正确估算复杂 JSON 对象', () => {
      const obj = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        metadata: {
          timestamp: '2024-01-01',
          version: '1.0',
        },
      };
      const tokens = TokenCalculator.estimateJsonTokens(obj);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('应该正确处理空数组', () => {
      expect(TokenCalculator.estimateMessagesTokens([])).toBe(0);
    });

    it('应该正确估算消息数组', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const tokens = TokenCalculator.estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('应该处理包含中文的消息', () => {
      const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！' },
      ];
      const tokens = TokenCalculator.estimateMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateStateTokens', () => {
    it('应该正确处理空状态', () => {
      expect(TokenCalculator.estimateStateTokens(null)).toBe(0);
      expect(TokenCalculator.estimateStateTokens(undefined)).toBe(0);
    });

    it('应该正确估算包含基本字段的状态', () => {
      const state = {
        user_input: '测试输入',
        trip: { trip_id: '123' },
        memory: { semantic_facts: { pois: [] } },
        compute: {},
        result: { status: 'DRAFT' },
      };
      const tokens = TokenCalculator.estimateStateTokens(state);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('estimateTotalTokens', () => {
    it('应该正确计算总 token 数', () => {
      const requestText = '用户请求';
      const responseText = '系统响应';
      const additionalData = { key: 'value' };

      const tokens = TokenCalculator.estimateTotalTokens(
        requestText,
        responseText,
        additionalData
      );

      expect(tokens).toBeGreaterThan(0);
      // 应该包含请求、响应、额外数据和 API 开销
      expect(tokens).toBeGreaterThan(10);
    });

    it('应该处理空值', () => {
      const tokens = TokenCalculator.estimateTotalTokens(null, null);
      expect(tokens).toBeGreaterThanOrEqual(10); // 至少包含 API 开销
    });
  });
});

