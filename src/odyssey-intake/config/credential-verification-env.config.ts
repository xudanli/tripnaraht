export type CredentialGatewayMode = 'stub' | 'production' | 'hybrid';

export interface CredentialVerificationEnvConfig {
  mode: CredentialGatewayMode;
  gatewayApiKey: string | null;
  xuexinGatewayUrl: string | null;
  mailGatewayUrl: string | null;
  oauthGatewayUrl: string | null;
  badgeOcrGatewayUrl: string | null;
  mailFrom: string;
  emailOtpTtlSeconds: number;
  badgeUploadTtlSeconds: number;
  httpTimeoutMs: number;
  httpMaxRetries: number;
}

export function loadCredentialVerificationEnvConfig(): CredentialVerificationEnvConfig {
  const modeRaw = (process.env.CREDENTIAL_VERIFICATION_MODE ?? 'hybrid').toLowerCase();
  const mode: CredentialGatewayMode =
    modeRaw === 'production' || modeRaw === 'stub' || modeRaw === 'hybrid' ? modeRaw : 'hybrid';

  return {
    mode,
    gatewayApiKey: process.env.CREDENTIAL_GATEWAY_API_KEY?.trim() || null,
    xuexinGatewayUrl: process.env.CREDENTIAL_XUEXIN_GATEWAY_URL?.trim() || null,
    mailGatewayUrl: process.env.CREDENTIAL_MAIL_GATEWAY_URL?.trim() || null,
    oauthGatewayUrl: process.env.CREDENTIAL_OAUTH_GATEWAY_URL?.trim() || null,
    badgeOcrGatewayUrl: process.env.CREDENTIAL_BADGE_OCR_GATEWAY_URL?.trim() || null,
    mailFrom: process.env.CREDENTIAL_MAIL_FROM?.trim() || 'verify@tripnara.com',
    emailOtpTtlSeconds: parsePositiveInt(process.env.CREDENTIAL_EMAIL_OTP_TTL_SECONDS, 600),
    badgeUploadTtlSeconds: parsePositiveInt(process.env.CREDENTIAL_BADGE_UPLOAD_TTL_SECONDS, 900),
    httpTimeoutMs: parsePositiveInt(process.env.CREDENTIAL_GATEWAY_HTTP_TIMEOUT_MS, 8000),
    httpMaxRetries: parsePositiveInt(process.env.CREDENTIAL_GATEWAY_HTTP_MAX_RETRIES, 3),
  };
}

export function shouldUseProductionChannel(
  config: CredentialVerificationEnvConfig,
  channelUrl: string | null,
): boolean {
  if (config.mode === 'stub') return false;
  if (config.mode === 'production') return Boolean(channelUrl);
  return Boolean(channelUrl);
}

export type CredentialChannelId = 'xuexin' | 'work_email' | 'oauth' | 'badge_ocr';

export interface CredentialChannelStatus {
  channel: CredentialChannelId;
  transport: 'stub' | 'production';
  configured: boolean;
  urlHost: string | null;
}

export function resolveCredentialChannelTransport(
  config: CredentialVerificationEnvConfig,
  channelUrl: string | null,
  channelName: string,
): 'stub' | 'production' {
  if (config.mode === 'stub') return 'stub';
  if (config.mode === 'production') {
    if (!channelUrl) {
      throw new Error(`${channelName} 生产网关 URL 未配置（CREDENTIAL_VERIFICATION_MODE=production）`);
    }
    return 'production';
  }
  return channelUrl ? 'production' : 'stub';
}

export function safeUrlHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function buildCredentialGatewayStatus(config: CredentialVerificationEnvConfig): {
  mode: CredentialGatewayMode;
  channels: CredentialChannelStatus[];
} {
  const channels: Array<{ id: CredentialChannelId; url: string | null; label: string }> = [
    { id: 'xuexin', url: config.xuexinGatewayUrl, label: '学信网' },
    { id: 'work_email', url: config.mailGatewayUrl, label: '企业邮箱' },
    { id: 'oauth', url: config.oauthGatewayUrl, label: 'OAuth' },
    { id: 'badge_ocr', url: config.badgeOcrGatewayUrl, label: '工牌 OCR' },
  ];

  return {
    mode: config.mode,
    channels: channels.map(({ id, url, label }) => {
      let transport: 'stub' | 'production' = 'stub';
      try {
        transport = resolveCredentialChannelTransport(config, url, label);
      } catch {
        transport = 'production';
      }
      return {
        channel: id,
        transport,
        configured: Boolean(url),
        urlHost: safeUrlHost(url),
      };
    }),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
