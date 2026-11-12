/**
 * Estado de autenticacao (zustand).
 * Persistido no AsyncStorage para o produtor nao precisar logar toda vez:
 * no campo, digitar senha e a maior barreira de uso.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Usuario } from '@/services/api';

const CHAVE = '@merendai/auth';

interface AuthState {
  token: string | null;
  user: Usuario | null;
  carregado: boolean;
  entrar: (token: string, user: Usuario) => Promise<void>;
  sair: () => Promise<void>;
  restaurar: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  carregado: false,
  entrar: async (token, user) => {
    await AsyncStorage.setItem(CHAVE, JSON.stringify({ token, user }));
    set({ token, user });
  },
  sair: async () => {
    await AsyncStorage.removeItem(CHAVE);
    set({ token: null, user: null });
  },
  restaurar: async () => {
    try {
      const raw = await AsyncStorage.getItem(CHAVE);
      if (raw) { const { token, user } = JSON.parse(raw); set({ token, user }); }
    } finally {
      set({ carregado: true });
    }
  },
}));
