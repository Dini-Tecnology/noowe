import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests: Supabase session lifecycle
 */
describe('Supabase Session Lifecycle', () => {
  const authServicePath = path.resolve(__dirname, '../../lib/supabase-auth.ts');
  const dockerPath = path.resolve(__dirname, '../../../../docker-compose.yml');
  const envDockerPath = path.resolve(__dirname, '../../../../.env.docker');

  it('uses Supabase refreshSession instead of custom refresh-token endpoints', () => {
    const content = fs.readFileSync(authServicePath, 'utf-8');

    expect(content).toContain('supabase.auth.refreshSession');
    expect(content).not.toContain('/auth/refresh');
    expect(content).not.toContain('JWT_REFRESH_SECRET');
  });

  it('reads custom claims for authorization without signing custom JWTs', () => {
    const content = fs.readFileSync(authServicePath, 'utf-8');

    expect(content).toContain('readJwtClaims');
    expect(content).toContain('claims.roles');
    expect(content).toContain('claims.restaurant_ids');
    expect(content).not.toContain('sign(');
  });

  it('does not configure custom JWT secrets in Docker runtime files', () => {
    for (const filePath of [dockerPath, envDockerPath]) {
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

      expect(content).not.toContain('JWT_SECRET');
      expect(content).not.toContain('JWT_REFRESH_SECRET');
      expect(content).not.toContain('JWT_EXPIRES_IN');
      expect(content).not.toContain('JWT_REFRESH_EXPIRES_IN');
    }
  });
});
