import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import pb from '@/lib/pocketbase';

// Define the auth state interface
interface AuthState {
  user: any | null;
  isLoading: boolean;
  init: () => void;
  setUser: (user: any | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  logout: () => void;
}

// Create the main store
export const useStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        isLoading: true,
        init: () => {
          if (pb.authStore.isValid) {
            set({ user: pb.authStore.model, isLoading: false });
          } else {
            set({ user: null, isLoading: false });
          }
        },
        setUser: (user) => set({ user, isLoading: false }),
        setIsLoading: (isLoading) => set({ isLoading }),
        logout: () => {
          pb.authStore.clear();
          set({ user: null });
        },
      }),
      {
        name: 'main-store',
      }
    )
  )
);