import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_BASE_URL } from './api-config';
import { useAuth } from './auth-context';

interface RealtimeContextValue {
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ isConnected: false });

// Fase 5 (plan.md): socket del dashboard del cliente. El socket es
// mejora de experiencia, NUNCA la fuente de verdad -- por eso cada
// "señal de que algo puede haber cambiado" (evento recibido, reconexión,
// vuelta a primer plano) simplemente invalida las queries de React Query
// en vez de mutar el caché a mano: el REST sigue siendo quien decide qué
// se muestra. Los items nuevos que aparecen arriba del feed tras el
// refetch animan su entrada solos (Animated.View con `entering` monta
// por primera vez), sin necesidad de un setQueryData quirúrgico.
export function RealtimeProvider({ children }: PropsWithChildren) {
  const { session, refreshAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    // Sin sesión de cliente, no hay socket que crear -- isConnected ya
    // arranca en false. Si HABÍA una sesión conectada y deja de haberla,
    // el cleanup del efecto anterior (más abajo) es quien la resetea:
    // llamar setState acá de forma síncrona en el cuerpo del efecto
    // dispara renders en cascada innecesarios (react-hooks/set-state-in-effect).
    if (!session || session.user.role !== 'client_user') {
      return;
    }

    const socket = io(API_BASE_URL, {
      path: '/ws',
      auth: { token: session.accessToken },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    function invalidateAll() {
      void queryClient.invalidateQueries({ queryKey: ['client-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['upcoming-appointments'] });
      // Fase 6: un reporte nuevo puede requerir seguimiento (badge del
      // tab) y un seguimiento resuelto en otra sesión (p.ej. un
      // supervisor desde admin-web) tiene que reflejarse acá también.
      void queryClient.invalidateQueries({ queryKey: ['followups'] });
      void queryClient.invalidateQueries({ queryKey: ['followups-count'] });
    }

    socket.on('connect', () => {
      setIsConnected(true);
      refreshingRef.current = false;
      // Resync (plan.md): al conectar o reconectar, refetch -- los
      // eventos emitidos mientras el socket estaba caído no se pierden.
      invalidateAll();
    });

    socket.on('disconnect', () => setIsConnected(false));

    // El access token dura 15 min (ver AuthService); un handshake con un
    // token vencido falla acá. Se refresca UNA vez y se reintenta -- sin
    // guard, un token de refresh también vencido entraría en loop.
    socket.on('connect_error', () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      refreshAccessToken()
        .then((accessToken) => {
          socket.auth = { token: accessToken };
          socket.connect();
        })
        .catch(() => {
          refreshingRef.current = false;
        });
    });

    socket.on('report.created', invalidateAll);
    socket.on('report.updated', invalidateAll);
    socket.on('followup.resolved', invalidateAll);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!socket.connected) socket.connect();
        else invalidateAll();
      }
    });

    return () => {
      appStateSub.remove();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [session, queryClient, refreshAccessToken]);

  return (
    <RealtimeContext.Provider value={{ isConnected }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
