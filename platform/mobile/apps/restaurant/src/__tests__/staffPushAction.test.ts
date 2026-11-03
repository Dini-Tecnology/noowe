jest.mock('expo-constants', () => ({}));
jest.mock('expo-device', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/shared/services/supabase', () => ({ getSupabaseClient: jest.fn() }));

import { getSupabaseClient } from '@/shared/services/supabase';
import { runStaffPushAction, staffPushAction } from '../services/staff-push';

describe('botões da notificação (O2)', () => {
  const answer = (error: { code: string } | null, userId = 'gerente') => {
    const rpc = jest.fn().mockResolvedValue({ error });
    (getSupabaseClient as jest.Mock).mockReturnValue({
      rpc,
      auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: userId } } } }) },
    });
    return rpc;
  };
  const action = { rpc: 'restaurant_resolve_approval', params: {} };

  it('a ação não sai no nome de quem não recebeu o push', async () => {
    const rpc = answer(null, 'outra-pessoa');
    await runStaffPushAction(action, 'gerente');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('quem recebeu o push executa a ação', async () => {
    const rpc = answer(null);
    await runStaffPushAction(action, 'gerente');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('o mesmo código em outra chamada continua sendo erro', async () => {
    answer({ code: '23514' });
    await expect(runStaffPushAction({ rpc: 'restaurant_complete_task', params: {} })).rejects.toEqual({ code: '23514' });
  });

  it('quem chega depois de outro resolver não vê erro', async () => {
    answer({ code: '23514' });
    await expect(runStaffPushAction(action)).resolves.toBeUndefined();
  });

  it('recusa de verdade chega à tela', async () => {
    answer({ code: '42501' });
    await expect(runStaffPushAction(action)).rejects.toEqual({ code: '42501' });
  });

  it('concluir e assumir chamam o servidor pela tarefa', () => {
    expect(staffPushAction('task_complete', { taskId: 't1' })).toEqual({ rpc: 'restaurant_complete_task', params: { p_task_id: 't1' } });
    expect(staffPushAction('task_claim', { taskId: 't1' })).toEqual({ rpc: 'restaurant_claim_task', params: { p_task_id: 't1' } });
  });

  it('aprovar e recusar resolvem o pedido, não a tarefa', () => {
    expect(staffPushAction('approval_approve', { taskId: 't1', approvalId: 'a1' })).toEqual({
      rpc: 'restaurant_resolve_approval',
      params: { p_approval_id: 'a1', p_status: 'approved' },
    });
    expect(staffPushAction('approval_reject', { taskId: 't1', approvalId: 'a1' })).toEqual({
      rpc: 'restaurant_resolve_approval',
      params: { p_approval_id: 'a1', p_status: 'rejected' },
    });
  });

  it('o toque comum e push sem os dados não disparam nada', () => {
    expect(staffPushAction('expo.modules.notifications.actions.DEFAULT', { taskId: 't1' })).toBeNull();
    expect(staffPushAction('task_complete', {})).toBeNull();
    expect(staffPushAction('approval_approve', { taskId: 't1' })).toBeNull();
    expect(staffPushAction('task_complete', null)).toBeNull();
  });
});
