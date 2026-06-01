import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/services/api";
import { useSettingsStore } from "./settingsStore";
import Toast from "react-native-toast-message";
import Logger from "@/utils/Logger";
import { LoginCredentialsManager } from "@/services/storage";

const logger = Logger.withTag("AuthStore");

interface AuthState {
  isLoggedIn: boolean;
  isLoginModalVisible: boolean;
  showLoginModal: () => void;
  hideLoginModal: () => void;
  checkLoginStatus: (apiBaseUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const trySavedCredentialsLogin = async () => {
  const savedCredentials = await LoginCredentialsManager.get();
  if (!savedCredentials?.password) return false;

  const username = (savedCredentials.username || "").trim();
  const password = savedCredentials.password;
  const loginResult = await api.login(username || undefined, password).catch(() => null);
  return !!loginResult?.ok;
};

const validateExistingSession = async () => {
  // Small authenticated API call to verify cookie validity.
  await api.getSearchHistory();
};

const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  isLoginModalVisible: false,
  showLoginModal: () => set({ isLoginModalVisible: true }),
  hideLoginModal: () => set({ isLoginModalVisible: false }),

  checkLoginStatus: async (apiBaseUrl?: string) => {
    if (!apiBaseUrl) {
      set({ isLoggedIn: false, isLoginModalVisible: false });
      return;
    }

    try {
      const settingsState = useSettingsStore.getState();
      let serverConfig = settingsState.serverConfig;

      if (settingsState.isLoadingServerConfig) {
        const maxWaitTime = 3000;
        const checkInterval = 100;
        let waitTime = 0;

        while (waitTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
          const currentState = useSettingsStore.getState();
          if (!currentState.isLoadingServerConfig) {
            serverConfig = currentState.serverConfig;
            break;
          }
        }
      }

      if (!serverConfig?.StorageType) {
        if (!settingsState.isLoadingServerConfig) {
          Toast.show({ type: "error", text1: "Server config unavailable. Please check network or API URL." });
        }
        return;
      }

      const authToken = await AsyncStorage.getItem("authCookies");

      if (!authToken) {
        if (serverConfig.StorageType === "localstorage") {
          const loginResult = await api.login().catch(() => null);
          if (loginResult?.ok) {
            set({ isLoggedIn: true, isLoginModalVisible: false });
          } else {
            set({ isLoggedIn: false, isLoginModalVisible: true });
          }
          return;
        }

        const autoLoginOk = await trySavedCredentialsLogin();
        set({ isLoggedIn: autoLoginOk, isLoginModalVisible: !autoLoginOk });
        return;
      }

      // Cookie exists, but may be expired. Validate once.
      try {
        await validateExistingSession();
        set({ isLoggedIn: true, isLoginModalVisible: false });
      } catch (sessionError) {
        const unauthorized = sessionError instanceof Error && sessionError.message === "UNAUTHORIZED";
        if (!unauthorized) {
          // Temporary network/API error: keep session state optimistic.
          set({ isLoggedIn: true, isLoginModalVisible: false });
          return;
        }

        const autoLoginOk = await trySavedCredentialsLogin();
        if (autoLoginOk) {
          set({ isLoggedIn: true, isLoginModalVisible: false });
        } else {
          set({ isLoggedIn: false, isLoginModalVisible: true });
        }
      }
    } catch (error) {
      logger.error("Failed to check login status:", error);
      set({ isLoggedIn: false, isLoginModalVisible: true });
    }
  },

  logout: async () => {
    try {
      await api.logout();
      set({ isLoggedIn: false, isLoginModalVisible: true });
    } catch (error) {
      logger.error("Failed to logout:", error);
    }
  },
}));

export default useAuthStore;
