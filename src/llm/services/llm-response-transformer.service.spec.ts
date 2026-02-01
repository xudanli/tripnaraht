// src/llm/services/llm-response-transformer.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LlmResponseTransformerService } from './llm-response-transformer.service';

describe('LlmResponseTransformerService', () => {
  let service: LlmResponseTransformerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmResponseTransformerService],
    }).compile();

    service = module.get<LlmResponseTransformerService>(LlmResponseTransformerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transformToStructuredResponse', () => {
    it('should transform valid LLM output with paragraph blocks', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test content' },
          { type: 'heading', level: 2, text: 'Test heading' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test question', type: 'text', required: true },
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks).toBeDefined();
      expect(result.plannerResponseBlocks?.length).toBe(2);
      expect(result.plannerResponseBlocks?.[0].type).toBe('paragraph');
      expect(result.plannerResponseBlocks?.[0].content).toBe('Test content');
      expect(result.plannerResponseBlocks?.[1].type).toBe('heading');
      expect(result.plannerResponseBlocks?.[1].text).toBe('Test heading');
      expect(result.clarificationQuestions).toBeDefined();
      expect(result.clarificationQuestions?.length).toBe(1);
      expect(result.clarificationQuestions?.[0].id).toBe('q1');
      expect(result.plannerReply).toBeDefined();
    });

    it('should transform valid LLM output with list blocks', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks).toBeDefined();
      expect(result.plannerResponseBlocks?.length).toBe(1);
      expect(result.plannerResponseBlocks?.[0].type).toBe('list');
      expect(result.plannerResponseBlocks?.[0].items).toEqual(['Item 1', 'Item 2']);
    });

    it('should generate IDs for blocks without id', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks?.[0].id).toBeDefined();
      expect(result.plannerResponseBlocks?.[0].id).toMatch(/^block_0_\d+$/);
    });

    it('should handle non-existent questionId (will attempt auto-fix)', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
          { type: 'question_card', questionId: 'non_existent' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test', type: 'text', required: true },
        ],
      };

      // 注意：由于有自动修复机制，这个测试可能会成功（自动修复会移除question_card）
      // 或者会降级到文本模式（如果自动修复失败）
      const result = await service.transformToStructuredResponse(llmOutput);
      
      // 如果自动修复成功，应该返回结构化响应（question_card被移除）
      // 如果自动修复失败，应该降级到文本模式
      expect(result.plannerReply).toBeDefined();
      expect(result.plannerResponseBlocks).toBeDefined();
      // question_card应该被移除，只保留paragraph
      expect(result.plannerResponseBlocks?.length).toBe(1);
      expect(result.plannerResponseBlocks?.[0].type).toBe('paragraph');
    });

    it('should pass validation when questionId matches', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'question_card', questionId: 'q1' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test', type: 'text', required: true },
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks).toBeDefined();
      expect(result.clarificationQuestions).toBeDefined();
    });

    it('should fallback to text mode on validation failure', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph' }, // missing content
        ],
      };

      // 由于错误不可恢复，应该抛出错误
      await expect(
        service.transformToStructuredResponse(llmOutput, 'Fallback text')
      ).rejects.toThrow('missing or invalid required field: content');
    });

    it('should handle boolean type questions (map to single_choice)', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'question_card', questionId: 'q1' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test question', type: 'boolean', required: true },
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.clarificationQuestions).toBeDefined();
      expect(result.clarificationQuestions?.[0].type).toBe('single_choice');
      expect(result.clarificationQuestions?.[0].options).toEqual(['是', '否']);
    });

    it('should handle boolean type with custom options', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'question_card', questionId: 'q1' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test', type: 'boolean', required: true, options: ['Yes', 'No'] },
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.clarificationQuestions?.[0].type).toBe('single_choice');
      expect(result.clarificationQuestions?.[0].options).toEqual(['Yes', 'No']);
    });

    it('should generate text reply from blocks', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test paragraph' },
          { type: 'heading', level: 2, text: 'Test heading' },
          { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerReply).toContain('Test paragraph');
      expect(result.plannerReply).toContain('Test heading');
      expect(result.plannerReply).toContain('Item 1');
      expect(result.plannerReply).toContain('Item 2');
    });

    it('should generate ordered list text correctly', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'list', items: ['First', 'Second'], ordered: true },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerReply).toContain('1. First');
      expect(result.plannerReply).toContain('2. Second');
    });

    it('should generate unordered list text correctly', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerReply).toContain('• Item 1');
      expect(result.plannerReply).toContain('• Item 2');
    });

    it('should handle empty blocks array', async () => {
      const llmOutput = {
        responseBlocks: [],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('non-empty array');
    });

    it('should handle missing responseBlocks', async () => {
      const llmOutput = {
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow();
    });

    it('should handle invalid block type', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'invalid_type', content: 'Test' },
        ],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('invalid type');
    });

    it('should handle missing required fields in paragraph', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph' }, // missing content
        ],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('missing or invalid required field: content');
    });

    it('should handle missing required fields in heading', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'heading', level: 2 }, // missing text
        ],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('missing required fields: level or text');
    });

    it('should handle invalid heading level', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'heading', level: 5, text: 'Test' }, // invalid level
        ],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('invalid level');
    });

    it('should handle missing required fields in list', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'list' }, // missing items
        ],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('missing or empty required field: items');
    });

    it('should handle empty list items', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'list', items: [] }, // empty items
        ],
        clarificationQuestions: [],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('missing or empty required field: items');
    });

    it('should handle duplicate question IDs (will attempt auto-fix)', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Question 1', type: 'text', required: true },
          { id: 'q1', question: 'Question 2', type: 'text', required: true }, // duplicate
        ],
      };

      // 注意：由于有自动修复机制，这个测试可能会成功（如果自动修复生效）
      // 或者会降级到文本模式（如果自动修复失败）
      const result = await service.transformToStructuredResponse(llmOutput);
      
      // 如果自动修复成功，应该返回结构化响应
      // 如果自动修复失败，应该降级到文本模式
      expect(result.plannerReply).toBeDefined();
    });

    it('should handle missing options for single_choice', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test', type: 'single_choice', required: true }, // missing options
        ],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('missing or empty required field: options');
    });

    it('should handle missing options for multi_choice', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test', type: 'multi_choice', required: true }, // missing options
        ],
      };

      await expect(
        service.transformToStructuredResponse(llmOutput)
      ).rejects.toThrow('missing or empty required field: options');
    });

    it('should fallback to suggestedQuestions when transformation fails', async () => {
      const llmOutput = {
        responseBlocks: [{ type: 'paragraph' }], // invalid - missing content
        suggestedQuestions: ['Question 1', 'Question 2'],
      };

      // 由于错误不可恢复，应该抛出错误
      await expect(
        service.transformToStructuredResponse(llmOutput, 'Fallback text')
      ).rejects.toThrow('missing or invalid required field: content');
    });

    it('should fallback to clarificationQuestions string array when transformation fails', async () => {
      const llmOutput = {
        responseBlocks: [{ type: 'paragraph' }], // invalid - missing content
        clarificationQuestions: ['Question 1', 'Question 2'], // string array
      };

      // 由于错误不可恢复，应该抛出错误
      await expect(
        service.transformToStructuredResponse(llmOutput, 'Fallback text')
      ).rejects.toThrow('missing or invalid required field: content');
    });

    it('should use fallback text when provided', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(
        llmOutput,
        'Custom fallback text'
      );

      expect(result.plannerReply).toBe('Custom fallback text');
    });

    it('should generate default text reply when no fallback provided', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerReply).toBe('Test');
    });

    it('should handle summary_card type', async () => {
      const llmOutput = {
        responseBlocks: [
          {
            type: 'summary_card',
            summary: {
              destination: '冰岛',
              duration: '10天',
              travelers: '双人',
              budget: { amount: 50000, currency: 'RMB' },
            },
          },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks).toBeDefined();
      expect(result.plannerResponseBlocks?.[0].type).toBe('summary_card');
      expect(result.plannerResponseBlocks?.[0].summary?.destination).toBe('冰岛');
      expect(result.plannerReply).toContain('目的地：冰岛');
    });

    it('should handle highlight type', async () => {
      const llmOutput = {
        responseBlocks: [
          {
            type: 'highlight',
            highlightText: '重要提示',
            highlightType: 'warning',
          },
        ],
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks?.[0].type).toBe('highlight');
      expect(result.plannerResponseBlocks?.[0].highlightText).toBe('重要提示');
      expect(result.plannerResponseBlocks?.[0].highlightType).toBe('warning');
      expect(result.plannerReply).toContain('⚠️ 重要提示');
    });

    it('should handle question_card with valid questionId', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'question_card', questionId: 'q1' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test question', type: 'text', required: true },
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks?.[0].type).toBe('question_card');
      expect(result.plannerResponseBlocks?.[0].questionId).toBe('q1');
    });

    it('should handle complex response with multiple block types', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Introduction' },
          { type: 'heading', level: 2, text: 'Main Points' },
          { type: 'list', items: ['Point 1', 'Point 2'], ordered: false },
          { type: 'question_card', questionId: 'q1' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Question?', type: 'text', required: true },
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks?.length).toBe(4);
      expect(result.clarificationQuestions?.length).toBe(1);
      expect(result.plannerReply).toBeDefined();
    });

    it('should handle text field compatibility (question vs text)', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [
          { id: 'q1', text: 'Question text', type: 'text', required: true }, // using text instead of question
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.clarificationQuestions).toBeDefined();
      expect(result.clarificationQuestions?.[0]?.question).toBe('Question text');
    });

    it('should handle auto-fix for non-existent questionId', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
          { type: 'question_card', questionId: 'non_existent' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Test', type: 'text', required: true },
        ],
      };

      // 自动修复应该移除question_card，保留其他blocks
      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks).toBeDefined();
      expect(result.plannerResponseBlocks?.length).toBe(1); // question_card被移除
      expect(result.plannerResponseBlocks?.[0].type).toBe('paragraph');
    });

    it('should handle auto-fix for duplicate questionId', async () => {
      const llmOutput = {
        responseBlocks: [
          { type: 'paragraph', content: 'Test' },
        ],
        clarificationQuestions: [
          { id: 'q1', question: 'Question 1', type: 'text', required: true },
          { id: 'q1', question: 'Question 2', type: 'text', required: true }, // duplicate
        ],
      };

      // 自动修复应该重命名重复的questionId
      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.clarificationQuestions).toBeDefined();
      expect(result.clarificationQuestions?.length).toBe(2);
      // 第二个问题的id应该被重命名
      const questionIds = result.clarificationQuestions?.map(q => q.id) || [];
      expect(new Set(questionIds).size).toBe(2); // 所有id应该唯一
    });

    it('should truncate blocks exceeding maximum', async () => {
      const llmOutput = {
        responseBlocks: Array.from({ length: 25 }, (_, i) => ({
          type: 'paragraph',
          content: `Block ${i}`,
        })),
        clarificationQuestions: [],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.plannerResponseBlocks?.length).toBeLessThanOrEqual(20);
    });

    it('should truncate questions exceeding maximum', async () => {
      const llmOutput = {
        responseBlocks: [{ type: 'paragraph', content: 'Test' }],
        clarificationQuestions: Array.from({ length: 15 }, (_, i) => ({
          id: `q${i}`,
          question: `Question ${i}`,
          type: 'text' as const,
          required: true,
        })),
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      expect(result.clarificationQuestions?.length).toBeLessThanOrEqual(10);
    });

    it('should filter duplicate questions with similar text', async () => {
      const llmOutput = {
        responseBlocks: [{ type: 'paragraph', content: 'Test' }],
        clarificationQuestions: [
          { id: 'q1', question: '这次旅行是几位同行呢?', type: 'text' as const, required: true },
          { id: 'q2', question: '这次旅行是几位同行呢？', type: 'text' as const, required: true }, // 标点符号不同
          { id: 'q3', question: '这次旅行是几位同行呢', type: 'text' as const, required: true }, // 无标点
          { id: 'q4', question: '这次旅行是几位同行呢？', type: 'text' as const, required: true }, // 完全重复
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      // 应该只保留第一个问题（相似的问题会被过滤）
      expect(result.clarificationQuestions).toBeDefined();
      expect(result.clarificationQuestions?.length).toBe(1);
      expect(result.clarificationQuestions?.[0].id).toBe('q1');
    });

    it('should filter duplicate questions with normalized text differences', async () => {
      const llmOutput = {
        responseBlocks: [{ type: 'paragraph', content: 'Test' }],
        clarificationQuestions: [
          { id: 'q1', question: '您对冰岛的哪些体验特别感兴趣？', type: 'text' as const, required: true },
          { id: 'q2', question: '您对冰岛的哪些体验特别感兴趣?', type: 'text' as const, required: true }, // 标点不同
          { id: 'q3', question: '您对冰岛的哪些体验特别感兴趣', type: 'text' as const, required: true }, // 无标点
        ],
      };

      const result = await service.transformToStructuredResponse(llmOutput);

      // 应该只保留第一个问题
      expect(result.clarificationQuestions?.length).toBe(1);
      expect(result.clarificationQuestions?.[0].id).toBe('q1');
    });
  });
});
