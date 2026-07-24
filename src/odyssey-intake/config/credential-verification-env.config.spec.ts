import {
  buildCredentialGatewayStatus,
  loadCredentialVerificationEnvConfig,
  resolveCredentialChannelTransport,
} from './credential-verification-env.config';

describe('credential-verification-env.config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CREDENTIAL_XUEXIN_GATEWAY_URL;
    delete process.env.CREDENTIAL_MAIL_GATEWAY_URL;
    delete process.env.CREDENTIAL_OAUTH_GATEWAY_URL;
    delete process.env.CREDENTIAL_BADGE_OCR_GATEWAY_URL;
    process.env.CREDENTIAL_VERIFICATION_MODE = 'hybrid';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('hybrid uses stub when channel URL missing', () => {
    const config = loadCredentialVerificationEnvConfig();
    expect(resolveCredentialChannelTransport(config, null, '学信网')).toBe('stub');
  });

  it('hybrid uses production when channel URL configured', () => {
    process.env.CREDENTIAL_XUEXIN_GATEWAY_URL = 'http://127.0.0.1:3099/chsi';
    const config = loadCredentialVerificationEnvConfig();
    expect(resolveCredentialChannelTransport(config, config.xuexinGatewayUrl, '学信网')).toBe(
      'production',
    );
  });

  it('production mode throws when URL missing', () => {
    process.env.CREDENTIAL_VERIFICATION_MODE = 'production';
    const config = loadCredentialVerificationEnvConfig();
    expect(() => resolveCredentialChannelTransport(config, null, '学信网')).toThrow(
      /生产网关 URL 未配置/,
    );
  });

  it('builds gateway status without exposing secrets', () => {
    process.env.CREDENTIAL_XUEXIN_GATEWAY_URL = 'http://127.0.0.1:3099/chsi';
    const status = buildCredentialGatewayStatus(loadCredentialVerificationEnvConfig());
    expect(status.channels.find((c) => c.channel === 'xuexin')?.transport).toBe('production');
    expect(status.channels.find((c) => c.channel === 'xuexin')?.urlHost).toBe('127.0.0.1:3099');
  });
});
