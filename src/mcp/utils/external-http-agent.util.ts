/**
 * Shared HTTPS agent for external REST APIs (Google Places, Pexels, etc.).
 * Honors disable-proxy flags so devbox can start without a local proxy on :9090.
 */

import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

/** Init probe timeout — keep startup fast when upstream is unreachable */
export const EXTERNAL_API_INIT_PROBE_TIMEOUT_MS = 5_000;

/** Default axios timeout for operational requests */
export const EXTERNAL_API_REQUEST_TIMEOUT_MS = 30_000;

export function isExternalHttpProxyDisabled(): boolean {
  return (
    process.env.EXTERNAL_API_DISABLE_PROXY === 'true' ||
    process.env.LLM_DISABLE_PROXY === 'true' ||
    process.env.GOOGLE_DISABLE_PROXY === 'true'
  );
}

export function resolveExternalHttpsProxyUrl(): string | undefined {
  if (isExternalHttpProxyDisabled()) {
    return undefined;
  }
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    undefined
  );
}

export function createExternalHttpsAgent(): https.Agent | HttpsProxyAgent<string> {
  const proxyUrl = resolveExternalHttpsProxyUrl();
  if (proxyUrl) {
    return new HttpsProxyAgent<string>(proxyUrl);
  }
  return new https.Agent({
    keepAlive: true,
    family: 4,
    rejectUnauthorized: true,
  });
}
