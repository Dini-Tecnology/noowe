import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests: Supabase route authorization
 */
describe('Supabase Route Authorization', () => {
  const requireAuthPath = path.resolve(__dirname, '../../components/auth/RequireAuth.tsx');
  const adminDashboardPath = path.resolve(__dirname, '../../pages/AdminDashboard.tsx');

  it('protects restricted screens with Supabase-backed auth state', () => {
    const content = fs.readFileSync(requireAuthPath, 'utf-8');

    expect(content).toContain('useAuth');
    expect(content).toContain('allowedRoles');
    expect(content).toContain('hasAnyRole');
    expect(content).toContain('Acesso negado');
  });

  it('uses Supabase password reset from the auth gate', () => {
    const content = fs.readFileSync(requireAuthPath, 'utf-8');

    expect(content).toContain('sendPasswordReset');
    expect(content).toContain('Esqueci minha senha');
  });

  it('requires admin, owner, or manager roles for the admin dashboard', () => {
    const content = fs.readFileSync(adminDashboardPath, 'utf-8');

    expect(content).toContain("allowedRoles={['admin', 'owner', 'manager']}");
    expect(content).toContain('Supabase Auth');
  });
});
