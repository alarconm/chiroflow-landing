import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { authApi, tokenStorage } from '../services/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const accessToken = await tokenStorage.getAccessToken();
        const refreshToken = await tokenStorage.getRefreshToken();

        if (!accessToken && !refreshToken) {
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: null,
          });
          return;
        }

        // Try to refresh the token to validate session
        const success = await authApi.refreshToken();

        if (success) {
          // In a real app, you'd decode the token or fetch user info
          // For now, we'll mark as authenticated and let the app fetch user details
          setState({
            isAuthenticated: true,
            isLoading: false,
            user: null, // User info would be fetched separately
            error: null,
          });
        } else {
          setState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: null,
          });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: null,
        });
      }
    };

    checkAuth();
  }, []);

  const getDeviceInfo = async () => {
    const deviceId = (await Device.getDeviceIdAsync?.()) ||
                     `${Device.brand}-${Device.modelName}-${Date.now()}`;

    return {
      deviceId,
      deviceName: Device.deviceName || 'Unknown Device',
      platform: Platform.OS,
      osVersion: Device.osVersion || 'Unknown',
      appVersion: Application.nativeApplicationVersion || '1.0.0',
    };
  };

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const deviceInfo = await getDeviceInfo();
      const response = await authApi.login(email, password, deviceInfo);

      if (response.success && response.data) {
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: response.data.user,
          error: null,
        });
        return true;
      } else {
        setState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: response.error || 'Login failed',
        });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: errorMessage,
      });
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await authApi.logout();
    } finally {
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      });
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
