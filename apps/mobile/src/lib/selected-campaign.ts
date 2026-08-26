import AsyncStorage from '@react-native-async-storage/async-storage';

// Campaña activa del agente (Fase 4, plan.md: "la selección persiste
// (AsyncStorage) para no re-seleccionar en cada reporte"). AsyncStorage
// en vez de expo-secure-store: no es un secreto, y SecureStore ya está
// reservado para la sesión (session.ts).
const KEY = 'callreport.agent.campaign';

export async function loadSelectedCampaignId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function saveSelectedCampaignId(campaignId: string): Promise<void> {
  await AsyncStorage.setItem(KEY, campaignId);
}

export async function clearSelectedCampaignId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
