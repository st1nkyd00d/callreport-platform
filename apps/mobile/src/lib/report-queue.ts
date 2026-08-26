import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from './api-client';
import { authJson } from './api-json';
import type { AgentReport, CreateReportInput } from './agent-types';

// Cola offline de reportes (Fase 4, plan.md: "si el POST falla por
// conexión, el reporte queda en cola local con reintento manual visible
// -- un call center no puede perder reportes por WiFi inestable").
const KEY = 'callreport.agent.queue';

export interface QueuedReport {
  localId: string;
  input: CreateReportInput;
  queuedAt: string;
}

async function readAll(): Promise<QueuedReport[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedReport[];
  } catch {
    return [];
  }
}

async function writeAll(items: QueuedReport[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export function list(): Promise<QueuedReport[]> {
  return readAll();
}

export async function enqueue(input: CreateReportInput): Promise<QueuedReport> {
  const item: QueuedReport = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input,
    queuedAt: new Date().toISOString(),
  };
  const items = await readAll();
  items.push(item);
  await writeAll(items);
  return item;
}

export async function remove(localId: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((i) => i.localId !== localId));
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

// Reintenta cada item en orden. Un ApiError (400/403/409/...) es un
// rechazo real del servidor -- no tiene sentido reintentarlo, se
// descarta y se refleja en `failed`. Cualquier otro error (fetch nunca
// llegó a responder: sin conexión) deja el item en la cola para el
// próximo intento.
export async function flush(authFetch: AuthFetch): Promise<{ sent: number; failed: number }> {
  const items = await readAll();
  let sent = 0;
  let failed = 0;
  const remaining: QueuedReport[] = [];

  for (const item of items) {
    try {
      await authJson<AgentReport>(authFetch, 'POST', '/reports', item.input);
      sent += 1;
    } catch (e) {
      if (e instanceof ApiError) {
        failed += 1;
      } else {
        remaining.push(item);
      }
    }
  }

  await writeAll(remaining);
  return { sent, failed };
}
