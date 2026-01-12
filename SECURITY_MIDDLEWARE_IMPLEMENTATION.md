# Security Middleware Implementation

## Overview

A security middleware has been implemented to detect and block common attack patterns, including the PHPUnit exploit attempt that was observed in the logs.

## What Was Detected

The log entry showed a request to:
```
GET /api/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php
```

This is a known attack pattern targeting PHPUnit's `eval-stdin.php` file, which has been exploited in the past for remote code execution. While your application is a Node.js/NestJS application and not vulnerable to this specific PHP exploit, it's important to block such requests to:
1. Prevent unnecessary processing
2. Log security events for monitoring
3. Deter automated scanners

## Implementation

### Security Middleware (`src/common/middlewares/security.middleware.ts`)

The middleware detects and handles the following attack patterns:

#### High/Critical Severity (Blocked immediately):
1. **PHPUnit Exploits** - Detects requests to PHPUnit files (eval-stdin.php, vendor/phpunit paths)
2. **Path Traversal** - Detects attempts to access files outside the web root (../, ..%2f, etc.)
3. **SQL Injection** - Detects common SQL injection patterns
4. **Command Injection** - Detects shell command injection attempts
5. **XSS Attempts** - Detects cross-site scripting attempts
6. **File Inclusion** - Detects attempts to include system files or use PHP wrappers
7. **XXE Injection** - Detects XML external entity injection attempts

#### Medium Severity (Logged but allowed):
1. **Vulnerability Scanning** - Detects common vulnerability scanner paths (wp-admin, phpmyadmin, .env, .git, etc.)
2. **Suspicious User-Agents** - Detects known security scanning tools (sqlmap, nikto, nmap, etc.)

### Features

1. **Early Blocking**: The middleware runs before other processing, blocking malicious requests early
2. **Comprehensive Logging**: All security events are logged with severity levels and context
3. **IP Tracking**: Logs include IP addresses and User-Agent strings for monitoring
4. **Flexible Response**: High/critical threats are blocked (403 Forbidden), while medium/low threats are logged but allowed through

### Integration

The security middleware is registered in `src/main.ts` and runs:
- After cookie parsing
- Before other middleware and request processing
- This ensures malicious requests are blocked as early as possible

## Security Event Logging

When a threat is detected, the middleware logs:
- **Severity Level**: Critical, High, Medium, or Low
- **Threat Type**: Specific attack pattern detected
- **Request Details**: Method, URL, IP address, User-Agent
- **Location**: Where the threat was detected (URL, query params, body)

Example log output:
```
🚨 [Security Alert] HIGH: phpunit_exploit - PHPUnit exploit attempt detected
Method: GET, URL: /api/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php, IP: xxx.xxx.xxx.xxx, User-Agent: Mozilla/5.0...
```

## Response to Blocked Requests

When a high or critical severity threat is detected, the middleware returns:
```json
{
  "statusCode": 403,
  "message": "Access denied",
  "error": "Forbidden",
  "timestamp": "2026-01-12T05:04:36.000Z"
}
```

## Configuration

The middleware is automatically enabled and requires no configuration. The attack patterns are hardcoded based on common security threats.

### Customization

To customize the middleware:
1. Edit `src/common/middlewares/security.middleware.ts`
2. Add or modify attack patterns in the `attackPatterns` array
3. Adjust severity levels as needed
4. Modify the response behavior in `handleThreat()`

## Monitoring Recommendations

1. **Monitor Logs**: Regularly review security event logs for patterns
2. **IP Tracking**: Track repeated offenders for potential IP blocking
3. **Rate Limiting**: Consider adding IP-based rate limiting for repeated security events
4. **Alerting**: Set up alerts for critical severity events

## Future Enhancements

Potential improvements:
1. **IP Blocking**: Automatically block IPs after multiple security events
2. **Rate Limiting**: Add rate limiting specifically for security events
3. **Whitelisting**: Allow whitelisting of legitimate paths that might trigger false positives
4. **Metrics**: Track security event metrics over time
5. **Integration**: Integrate with security information and event management (SIEM) systems

## Testing

To test the middleware:
1. Make a request to a known attack path (e.g., `/api/vendor/phpunit/eval-stdin.php`)
2. Check logs for the security alert
3. Verify the response is 403 Forbidden
4. Confirm the request is logged with all context information

## Notes

- The middleware only checks string content, not binary data
- POST body checking happens after JSON parsing, so malformed JSON might not be checked
- User-Agent checking can produce false positives for legitimate security tools used by developers
- Path patterns may need adjustment based on your application's actual URL structure
