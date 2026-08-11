import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../services/supabase';

type Listener = (data: any) => void;

export const useWebSocket = (namespace: string = '/') => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [namespace]);

  const connectSocket = async () => {
    try {
      const supabase = getSupabaseClient();
      const channelName = namespace === '/' ? 'root-events' : namespace.replace(/\//g, '-').replace(/^-+/, '');

      channelRef.current = supabase.channel(`ws-${channelName || 'root'}`);
      channelRef.current.on('broadcast', { event: '*' }, (payload) => {
        const event = payload.event;
        const callbacks = listenersRef.current.get(event);
        callbacks?.forEach((cb) => cb(payload.payload));
      });

      await new Promise<void>((resolve, reject) => {
        channelRef.current!.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setConnected(true);
            setError(null);
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Realtime channel error: ${status}`));
          }
        });
      });
    } catch (err: any) {
      setError(err.message || 'Failed to initialize socket');
      setConnected(false);
    }
  };

  const disconnectSocket = async () => {
    if (channelRef.current) {
      await getSupabaseClient().removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setConnected(false);
  };

  const emit = (event: string, data?: any) => {
    if (channelRef.current && connected) {
      channelRef.current.send({
        type: 'broadcast',
        event,
        payload: data ?? {},
      });
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  const on = (event: string, callback: (data: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
  };

  const off = (event: string, callback?: (data: any) => void) => {
    if (!listenersRef.current.has(event)) return;
    if (callback) {
      listenersRef.current.get(event)!.delete(callback);
    } else {
      listenersRef.current.delete(event);
    }
  };

  const joinRoom = (room: string) => {
    emit('join', { room });
  };

  const leaveRoom = (room: string) => {
    emit('leave', { room });
  };

  return {
    socket: channelRef.current,
    connected,
    error,
    emit,
    on,
    off,
    joinRoom,
    leaveRoom,
    reconnect: connectSocket,
    disconnect: disconnectSocket,
  };
};
