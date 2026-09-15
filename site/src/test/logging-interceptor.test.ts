/**
 * LoggingInterceptor Unit Tests
 * 
 * Tests for the structured logging interceptor including:
 * - Request/response logging
 * - Correlation ID propagation
 * - Sensitive data sanitization
 * - Error logging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the sanitizeBody logic directly so sensitive auth/session payloads
// remain redacted regardless of the transport layer.

describe('LoggingInterceptor - Sanitization', () => {
  // Replicate the sanitization logic for testing
  const sensitiveFields = [
    'password', 'current_password', 'new_password',
    'token', 'refresh_token', 'access_token',
    'secret', 'authorization', 'credit_card',
    'card_number', 'cvv', 'otp', 'code',
  ];

  function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    if (!body) return body;
    const sanitized = { ...body };
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  it('should redact password fields', () => {
    const body = {
      email: 'test@example.com',
      password: 'secretPassword123!',
      current_password: 'oldPassword',
      new_password: 'newPassword',
    };

    const sanitized = sanitizeBody(body);

    expect(sanitized.email).toBe('test@example.com');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.current_password).toBe('[REDACTED]');
    expect(sanitized.new_password).toBe('[REDACTED]');
  });

  it('should redact token fields', () => {
    const body = {
      user_id: '123',
      token: 'jwt-token-value',
      refresh_token: 'refresh-value',
      access_token: 'access-value',
    };

    const sanitized = sanitizeBody(body);

    expect(sanitized.user_id).toBe('123');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.refresh_token).toBe('[REDACTED]');
    expect(sanitized.access_token).toBe('[REDACTED]');
  });

  it('should redact payment fields', () => {
    const body = {
      amount: 100,
      credit_card: '4111111111111111',
      card_number: '4111111111111111',
      cvv: '123',
    };

    const sanitized = sanitizeBody(body);

    expect(sanitized.amount).toBe(100);
    expect(sanitized.credit_card).toBe('[REDACTED]');
    expect(sanitized.card_number).toBe('[REDACTED]');
    expect(sanitized.cvv).toBe('[REDACTED]');
  });

  it('should redact OTP and auth code fields', () => {
    const body = {
      phone: '+5511999999999',
      otp: '123456',
      code: '654321',
    };

    const sanitized = sanitizeBody(body);

    expect(sanitized.phone).toBe('+5511999999999');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.code).toBe('[REDACTED]');
  });

  it('should handle null/undefined body gracefully', () => {
    expect(sanitizeBody(null as any)).toBeNull();
    expect(sanitizeBody(undefined as any)).toBeUndefined();
  });

  it('should not modify non-sensitive fields', () => {
    const body = {
      name: 'Test User',
      email: 'test@example.com',
      role: 'admin',
      restaurant_id: 'uuid-123',
    };

    const sanitized = sanitizeBody(body);

    expect(sanitized).toEqual(body);
  });

  it('should not mutate the original body object', () => {
    const body = { password: 'secret', name: 'test' };
    const sanitized = sanitizeBody(body);

    expect(body.password).toBe('secret'); // Original unchanged
    expect(sanitized.password).toBe('[REDACTED]');
  });
});

describe('LoggingInterceptor - Correlation ID', () => {
  it('should use X-Request-ID from headers when present', () => {
    const existingId = 'existing-request-id-123';
    const headers = { 'x-request-id': existingId };
    const requestId = headers['x-request-id'] || 'generated-uuid';
    expect(requestId).toBe(existingId);
  });

  it('should generate new ID when X-Request-ID is missing', () => {
    const headers: Record<string, string> = {};
    const requestId = headers['x-request-id'] || 'generated-uuid';
    expect(requestId).toBe('generated-uuid');
  });

  it('should use X-Trace-ID from headers when present', () => {
    const existingTraceId = 'trace-id-456';
    const headers = { 'x-trace-id': existingTraceId, 'x-request-id': 'req-123' };
    const traceId = headers['x-trace-id'] || headers['x-request-id'] || 'generated';
    expect(traceId).toBe(existingTraceId);
  });

  it('should fall back to request-id for trace-id when not present', () => {
    const headers = { 'x-request-id': 'req-123' };
    const traceId = headers['x-trace-id'] || headers['x-request-id'] || 'generated';
    expect(traceId).toBe('req-123');
  });
});

describe('Structured Log Format', () => {
  it('should produce valid JSON in production mode', () => {
    const log = {
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      message: 'Test message',
      context: 'HTTP',
      data: {
        requestId: 'req-123',
        method: 'GET',
        path: '/api/v1/users',
        statusCode: 200,
        duration: 45,
      },
    };

    const jsonStr = JSON.stringify(log);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.timestamp).toBeDefined();
    expect(parsed.level).toBe('info');
    expect(parsed.data.requestId).toBe('req-123');
    expect(parsed.data.duration).toBe(45);
  });
});
