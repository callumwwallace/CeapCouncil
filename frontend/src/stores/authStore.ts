import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Token } from '@/types';
import api from '@/lib/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  setTokens: (tokens: Token) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const tokens = await api.login({ username: email, password });
          api.setToken(tokens.access_token);
          api.setRefreshToken(tokens.refresh_token);
          
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            isAuthenticated: true,
          });
          
          await get().fetchUser();
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email: string, username: string, password: string, fullName?: string) => {
        set({ isLoading: true });
        try {
          await api.register({ email, username, password, full_name: fullName });
          // Auto-login after registration
          await get().login(email, password);
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        api.setToken(null);
        api.setRefreshToken(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      fetchUser: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        
        api.setToken(accessToken);
        try {
          const user = await api.getCurrentUser();
          set({ user, isAuthenticated: true });
        } catch {
          get().logout();
        }
      },

      setTokens: (tokens: Token) => {
        api.setToken(tokens.access_token);
        api.setRefreshToken(tokens.refresh_token);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
        });
      },

      /** Rehydrate the API client with persisted tokens after page load */
      hydrate: () => {
        const { accessToken, refreshToken } = get();
        if (accessToken) api.setToken(accessToken);
        if (refreshToken) api.setRefreshToken(refreshToken);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: !!state.accessToken,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrate();
          if (state.accessToken) {
            useAuthStore.getState().fetchUser();
          }
        }
      },
    }
  )
);

// Register API client callbacks so auto-refresh keeps the store in sync
api.onAuthChange(
  // On successful token refresh
  (tokens: Token) => {
    useAuthStore.getState().setTokens(tokens);
  },
  // On refresh failure (token fully expired)
  () => {
    useAuthStore.getState().logout();
  },
);
