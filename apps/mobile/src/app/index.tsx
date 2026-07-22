import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// Fase 1: redirect fijo a login. Fase 2 lee la sesión de
// expo-secure-store y redirige por rol (agente -> /home, cliente -> /dashboard).
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return null;
}
