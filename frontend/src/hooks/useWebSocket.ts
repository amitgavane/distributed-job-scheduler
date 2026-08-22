import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { IS_DEMO } from '../lib/isDemo';

type EventHandler = (data: unknown) => void;

const noopSubscribe = () => {};

export function useWebSocket(events: Record<string, EventHandler>) {
  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  const subscribe = useCallback((channel: string, id: string) => {
    if (IS_DEMO) return;
    socketRef.current?.emit(channel, id);
  }, []);

  useEffect(() => {
    if (IS_DEMO) return;

    const socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    const attach = () => {
      Object.entries(eventsRef.current).forEach(([event, handler]) => {
        socket.off(event);
        socket.on(event, handler);
      });
    };

    socket.on('connect', attach);
    attach();

    return () => {
      Object.keys(eventsRef.current).forEach((event) => socket.off(event));
      socket.disconnect();
    };
  }, []);

  return { subscribe: IS_DEMO ? noopSubscribe : subscribe };
};
