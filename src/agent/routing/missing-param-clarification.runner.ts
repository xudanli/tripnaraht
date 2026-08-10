/**
 * 缺少必需参数的澄清消息（纯函数，从 ClaudeOrchestrator 迁出）。
 */

/** 翻译参数名称（去除技术术语） */
export function translateParamName(paramName: string): string {
  const translations: Record<string, string> = {
    countryCode: '目的地国家',
    tripId: '行程ID',
    world: '行程上下文信息',
    destination: '目的地',
    origin: '出发地',
    date_range: '日期范围',
    start_date: '开始日期',
    days: '行程天数',
    mode: '交通方式',
    party: '同行人员信息',
    constraints: '约束条件',
    preferences: '偏好设置',
    planState: '行程规划状态',
    request: '行程请求上下文',
    itinerary: '当前日程结构',
  };
  return translations[paramName] || paramName;
}

/** 从错误消息中提取解决方案 */
export function extractSolutionsFromError(error: any): string[] {
  const errorMessage = error?.message || '';
  const solutions: string[] = [];

  if (errorMessage.includes('可通过')) {
    const match = errorMessage.match(/可通过\s*([^或]+)(?:\s*或\s*([^）]+))?/);
    if (match) {
      if (match[1]) {
        solutions.push(`通过 ${match[1].trim()} 提供信息`);
      }
      if (match[2]) {
        solutions.push(`或直接 ${match[2].trim()}`);
      }
    }
  }

  if (errorMessage.includes('countryCode')) {
    if (!solutions.length) {
      solutions.push('在请求中提供国家代码（如 "CN"、"IS"）');
      solutions.push('或提供已保存的行程 ID，系统将自动获取国家代码');
      solutions.push('或在消息中明确提及目的地国家（如 "中国"、"冰岛"）');
    }
  } else if (errorMessage.includes('tripId')) {
    if (!solutions.length) {
      solutions.push('提供已保存的行程 ID');
      solutions.push('或直接提供行程相关的详细信息（目的地、日期等）');
    }
  } else {
    if (!solutions.length) {
      solutions.push('检查请求参数是否完整');
      solutions.push('提供更多上下文信息');
    }
  }

  return solutions.length > 0 ? solutions : ['请提供完整的请求信息'];
}

/** 构建缺少必需参数的澄清消息（使用用户语言） */
export function buildMissingParamClarificationMessage(error: any): string {
  const errorMessage = error?.message || '缺少必需参数';

  let missingParams: string[] = [];
  if (error?.missingParams && Array.isArray(error.missingParams)) {
    missingParams = error.missingParams.map((p: string) => translateParamName(p));
  } else {
    if (errorMessage.includes('countryCode')) {
      missingParams.push('目的地国家');
    }
    if (errorMessage.includes('tripId')) {
      missingParams.push('行程ID');
    }
    if (errorMessage.includes('world')) {
      missingParams.push('行程上下文信息');
    }
    if (missingParams.length === 0) {
      const match = errorMessage.match(/(\w+)\s*是必需的/);
      if (match) {
        missingParams.push(translateParamName(match[1]));
      } else {
        const paramMatch = errorMessage.match(/缺少必需参数:\s*(.+)/);
        if (paramMatch) {
          missingParams = paramMatch[1]
            .split(',')
            .map((p: string) => translateParamName(p.trim()));
        } else {
          missingParams.push('必需信息');
        }
      }
    }
  }

  const missingParam = missingParams.join('、');
  const solutions = extractSolutionsFromError(error);

  return [
    `需要补充一些信息才能完成行程规划。`,
    '',
    `缺少的信息：`,
    `- ${missingParam || '必需信息'}`,
    '',
    `您可以：`,
    ...solutions.map((solution: string, index: number) => `${index + 1}. ${solution}`),
    '',
    `提供这些信息后，我们将继续为您规划行程。`,
  ].join('\n');
}
