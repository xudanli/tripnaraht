/**
 * 服务不可用澄清消息（纯函数，从 ClaudeOrchestrator 迁出）。
 */

export function translateSkillName(skillName: string): string {
  const translations: Record<string, string> = {
    'transport.search': '交通查询服务',
    'poi.search': '地点搜索服务',
    'dem.get_profile': '地形分析服务',
    'opening_hours.get': '开放时间查询服务',
    'geo.check.hazard.zones': '安全风险评估服务',
  };
  return translations[skillName] || skillName;
}

export function translateServiceName(service: string): string {
  const translations: Record<string, string> = {
    transport: '交通信息查询',
    poi: '地点信息查询',
    dem: '地形数据分析',
    opening_hours: '开放时间查询',
    hazard_zones: '安全风险评估',
  };
  return translations[service] || service;
}

export function buildClarificationMessage(error: any): string {
  const skillName = translateSkillName(error.skillName || '未知服务');
  const missingServices = error.missingServices || [];
  const solutions = error.solutions || [];

  return [
    `抱歉，暂时无法完成行程规划。`,
    '',
    '原因：',
    `- ${skillName}暂时不可用`,
    ...(missingServices.length > 0
      ? ['', '受影响的功能：', ...missingServices.map((service: string) => `- ${translateServiceName(service)}`)]
      : []),
    '',
    '您可以：',
    ...solutions.map((solution: string, index: number) => `${index + 1}. ${solution}`),
    '',
    '如果问题持续存在，请联系客服或稍后重试。',
  ].join('\n');
}
