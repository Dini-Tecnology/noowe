import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { getErrorMessage } from '@/shared/utils/error-handler';
import { useRestaurantRole } from '../contexts/RestaurantRoleContext';
import { staffInviteCodeFromUrl } from '../screens/v2/shared/staffInvite';

/**
 * Convite de equipe depois do login. Quem foi convidado pelo e-mail confirmado entra sozinho; quem abriu o link
 * entra pelo código. O link com o app fechado continua disponível aqui, depois de entrar na conta.
 */
export function StaffInviteBridge() {
  const { reloadRole, reloadRestaurants } = useRestaurantRole();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      await reloadRole();
      await reloadRestaurants();
    };

    const acceptFrom = async (url: string | null) => {
      const code = staffInviteCodeFromUrl(url);
      if (!code || handled.current.has(code)) return;
      handled.current.add(code);
      try {
        const result = await supabaseApiAdapter.acceptStaffInvite(code);
        if (!active) return;
        await refresh();
        if (!result?.alreadyAccepted) Alert.alert('Convite aceito', 'Você já faz parte da equipe.');
      } catch (error) {
        if (active) Alert.alert('Não foi possível aceitar o convite', getErrorMessage(error));
      }
    };

    void supabaseApiAdapter.claimMyStaffInvites()
      .then(async (claimed) => { if (active && claimed > 0) await refresh(); })
      .catch(() => undefined);
    void Linking.getInitialURL().then(acceptFrom).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => { void acceptFrom(url); });

    return () => {
      active = false;
      subscription.remove();
    };
    // Roda uma vez por sessão: as funções de recarregar mudam a cada carga do contexto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
