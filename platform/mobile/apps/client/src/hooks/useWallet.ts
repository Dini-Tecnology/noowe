import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import customerBackend, { type CustomerWalletSnapshot } from '../services/customer-backend';

export const walletQueryKey = ['customer-wallet'] as const;

export function useWallet() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: walletQueryKey,
    queryFn: () => customerBackend.getWalletSnapshot(),
    staleTime: 30_000,
  });

  const commitSnapshot = (snapshot: CustomerWalletSnapshot) => {
    queryClient.setQueryData(walletQueryKey, snapshot);
    return snapshot;
  };

  const addPix = useMutation({
    mutationFn: (input: { pixKey: string; setDefault?: boolean }) =>
      customerBackend.addPixPaymentMethod(input.pixKey, input.setDefault),
    onSuccess: commitSnapshot,
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => customerBackend.setDefaultPaymentMethod(id),
    onSuccess: commitSnapshot,
  });

  const removeMethod = useMutation({
    mutationFn: (id: string) => customerBackend.removePaymentMethod(id),
    onSuccess: commitSnapshot,
  });

  const transfer = useMutation({
    mutationFn: (input: { recipientEmail: string; amount: number }) =>
      customerBackend.transferWallet(input),
    onSuccess: commitSnapshot,
  });

  useEffect(() => {
    let disposed = false;
    let activeChannel: Awaited<ReturnType<typeof customerBackend.subscribeToWalletChanges>> | undefined;
    customerBackend.subscribeToWalletChanges(() => {
      void queryClient.invalidateQueries({ queryKey: walletQueryKey });
    }).then((channel) => {
      if (disposed) {
        void channel.unsubscribe();
      } else {
        activeChannel = channel;
      }
    }).catch(() => undefined);

    return () => {
      disposed = true;
      if (activeChannel) void activeChannel.unsubscribe();
    };
  }, [queryClient]);

  return { query, addPix, setDefault, removeMethod, transfer };
}
