/**
 * Jest Setup File
 * 
 * 用途：
 * 1. 禁止测试中出现非预期的 ERROR 日志
 * 2. 将预期的测试错误（模拟失败场景）从 ERROR 降级到 WARN/DEBUG
 */

// 允许的错误模式（这些是测试中预期的错误，用于模拟失败场景）
const ALLOW_ERROR_PATTERNS: RegExp[] = [
  /向量搜索失败/,
  /Embedding 生成失败/,
  /索引失败/,
  /LLM 失败/,
  /RouteDirection not found/,
  /获取失败/,
  /提取.*失败/,
  /回答路线问题失败/,
  /RAG 检索失败/, // 新增：允许 RAG 检索失败
];

// 捕获所有 console.error 调用
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Mock console.error 来捕获非预期的错误
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    const allowed = ALLOW_ERROR_PATTERNS.some((re) => re.test(msg));
    
    if (!allowed) {
      // 非预期错误：抛出异常（测试失败）
      throw new Error(`Unexpected console.error in tests: ${msg}`);
    }
    
    // 预期错误：降级到 warn 并输出（保持可见性但降低级别）
    originalConsoleWarn('[TEST] Expected error (downgraded from ERROR to WARN):', ...args);
  });
});

afterAll(() => {
  // 恢复原始 console.error
  (console.error as any).mockRestore?.();
});
