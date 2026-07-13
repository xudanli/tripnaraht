import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http2 from 'http2';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';

export interface ApnsAlertPayload {
  title: string;
  body: string;
  custom: Record<string, unknown>;
}

@Injectable()
export class MobileApnsService implements OnModuleInit {
  private readonly logger = new Logger(MobileApnsService.name);
  private enabled = false;
  private keyId = '';
  private teamId = '';
  private bundleId = '';
  private privateKey = '';
  private useSandbox = true;
  private cachedProviderToken?: { token: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.enabled = this.config.get<string>('MOBILE_APNS_ENABLED') === 'true';
    this.keyId = this.config.get<string>('APNS_KEY_ID') ?? '';
    this.teamId = this.config.get<string>('APNS_TEAM_ID') ?? '';
    this.bundleId = this.config.get<string>('APNS_BUNDLE_ID') ?? '';
    this.useSandbox = this.config.get<string>('APNS_USE_SANDBOX') !== 'false';

    const inlineKey = this.config.get<string>('APNS_PRIVATE_KEY');
    const keyPath = this.config.get<string>('APNS_KEY_PATH');
    if (inlineKey?.includes('BEGIN PRIVATE KEY')) {
      this.privateKey = inlineKey.replace(/\\n/g, '\n');
    } else if (keyPath && fs.existsSync(keyPath)) {
      this.privateKey = fs.readFileSync(keyPath, 'utf8');
    }

    if (this.enabled && (!this.keyId || !this.teamId || !this.bundleId || !this.privateKey)) {
      this.logger.warn('MOBILE_APNS_ENABLED=true 但 APNS 凭证不完整，推送将仅记录日志');
      this.enabled = false;
    }

    if (this.enabled) {
      this.logger.log(`APNs 已启用 (${this.useSandbox ? 'sandbox' : 'production'}) topic=${this.bundleId}`);
    } else {
      this.logger.log('APNs 未启用（MOBILE_APNS_ENABLED!=true），推送写入日志');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async send(deviceToken: string, alert: ApnsAlertPayload): Promise<{ ok: boolean; status?: number; reason?: string }> {
    const payload = {
      aps: {
        alert: { title: alert.title, body: alert.body },
        sound: 'default',
      },
      ...alert.custom,
    };

    if (!this.enabled) {
      this.logger.log(
        `[APNs dry-run] token=${deviceToken.slice(0, 8)}… custom=${JSON.stringify(alert.custom)}`,
      );
      return { ok: true };
    }

    const host = this.useSandbox
      ? 'api.sandbox.push.apple.com'
      : 'api.push.apple.com';

    return new Promise((resolve) => {
      const client = http2.connect(`https://${host}`);
      client.on('error', (err) => {
        this.logger.warn(`APNs 连接失败: ${err.message}`);
        client.close();
        resolve({ ok: false, reason: err.message });
      });

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.getProviderToken()}`,
        'apns-topic': this.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });

      let responseBody = '';
      req.on('response', (headers) => {
        const status = Number(headers[':status'] ?? 0);
        req.on('data', (chunk) => {
          responseBody += chunk.toString();
        });
        req.on('end', () => {
          client.close();
          if (status === 200) {
            resolve({ ok: true, status });
          } else {
            resolve({ ok: false, status, reason: responseBody || `HTTP ${status}` });
          }
        });
      });

      req.on('error', (err) => {
        client.close();
        resolve({ ok: false, reason: err.message });
      });

      req.end(JSON.stringify(payload));
    });
  }

  private getProviderToken(): string {
    const now = Date.now();
    if (this.cachedProviderToken && this.cachedProviderToken.expiresAt > now + 60_000) {
      return this.cachedProviderToken.token;
    }
    const token = jwt.sign({}, this.privateKey, {
      algorithm: 'ES256',
      issuer: this.teamId,
      expiresIn: '50m',
      header: { alg: 'ES256', kid: this.keyId },
    });
    this.cachedProviderToken = { token, expiresAt: now + 50 * 60 * 1000 };
    return token;
  }
}
