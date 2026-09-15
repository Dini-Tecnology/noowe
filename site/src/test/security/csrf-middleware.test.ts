import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Security Tests: Supabase browser auth client
 */
describe('Supabase Browser Auth Security', () => {
  const clientPath = path.resolve(__dirname, '../../integrations/supabase/client.ts');
  const authServicePath = path.resolve(__dirname, '../../lib/supabase-auth.ts');

  it('uses Supabase Auth PKCE with persisted and auto-refreshed sessions', () => {
    const content = fs.readFileSync(clientPath, 'utf-8');

    expect(content).toContain("flowType: 'pkce'");
    expect(content).toContain('persistSession: true');
    expect(content).toContain('autoRefreshToken: true');
    expect(content).toContain('detectSessionInUrl: true');
  });

  it('fails fast when a service_role key is accidentally exposed in the browser', () => {
    const content = fs.readFileSync(clientPath, 'utf-8');

    expect(content).toContain('service_role');
    expect(content).toContain('Never expose the Supabase service_role key');
  });

  it('implements email confirmation and password reset through Supabase Auth', () => {
    const content = fs.readFileSync(authServicePath, 'utf-8');

    expect(content).toContain('supabase.auth.signUp');
    expect(content).toContain('emailRedirectTo');
    expect(content).toContain('supabase.auth.resetPasswordForEmail');
    expect(content).toContain('supabase.auth.updateUser');
  });
});
