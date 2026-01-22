import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// API Configuration
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://api.chiroflow.com';
const API_VERSION = 'v1';

// Token storage keys
const ACCESS_TOKEN_KEY = 'chiroflow_access_token';
const REFRESH_TOKEN_KEY = 'chiroflow_refresh_token';
const DEVICE_ID_KEY = 'chiroflow_device_id';

// Token management
export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },

  async getDeviceId(): Promise<string | null> {
    return SecureStore.getItemAsync(DEVICE_ID_KEY);
  },

  async setDeviceId(deviceId: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};

// API response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  apiVersion?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
    organizationName: string;
  };
  tokens: AuthTokens;
  device: {
    id: string;
    deviceId: string;
  };
}

// API client class
class ApiClient {
  private baseUrl: string;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseUrl = `${API_URL}/api/mobile/${API_VERSION}`;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-API-Version': API_VERSION,
    };

    const accessToken = await tokenStorage.getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const deviceId = await tokenStorage.getDeviceId();
    if (deviceId) {
      headers['X-Device-ID'] = deviceId;
    }

    return headers;
  }

  private async refreshTokenIfNeeded(): Promise<boolean> {
    // If already refreshing, wait for the existing refresh
    if (this.isRefreshing) {
      return this.refreshPromise || Promise.resolve(false);
    }

    this.isRefreshing = true;
    this.refreshPromise = this.doRefreshToken();

    try {
      return await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<boolean> {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        return false;
      }

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Version': API_VERSION,
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await tokenStorage.clearTokens();
        return false;
      }

      const data: ApiResponse<AuthTokens> = await response.json();

      if (data.success && data.data) {
        await tokenStorage.setAccessToken(data.data.accessToken);
        await tokenStorage.setRefreshToken(data.data.refreshToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retry = true
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = await this.getHeaders();

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {}),
        },
      });

      // Handle 401 Unauthorized
      if (response.status === 401 && retry) {
        const refreshed = await this.refreshTokenIfNeeded();
        if (refreshed) {
          return this.request<T>(endpoint, options, false);
        }
        // Refresh failed, return unauthorized error
        return {
          success: false,
          error: 'Session expired. Please log in again.',
          code: 'SESSION_EXPIRED',
        };
      }

      const data: ApiResponse<T> = await response.json();
      return data;
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        code: 'NETWORK_ERROR',
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Authentication API
export const authApi = {
  async login(
    email: string,
    password: string,
    deviceInfo: {
      deviceId: string;
      deviceName: string;
      platform: string;
      osVersion: string;
      appVersion: string;
    }
  ): Promise<ApiResponse<LoginResponse>> {
    const response = await api.post<LoginResponse>('/auth/login', {
      email,
      password,
      ...deviceInfo,
    });

    if (response.success && response.data) {
      await tokenStorage.setAccessToken(response.data.tokens.accessToken);
      await tokenStorage.setRefreshToken(response.data.tokens.refreshToken);
      await tokenStorage.setDeviceId(response.data.device.deviceId);
    }

    return response;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      await tokenStorage.clearTokens();
    }
  },

  async refreshToken(): Promise<boolean> {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    const response = await api.post<AuthTokens>('/auth/refresh', { refreshToken });

    if (response.success && response.data) {
      await tokenStorage.setAccessToken(response.data.accessToken);
      await tokenStorage.setRefreshToken(response.data.refreshToken);
      return true;
    }

    return false;
  },
};

// Sync API
export const syncApi = {
  async pushOperations(operations: unknown[]): Promise<ApiResponse<unknown>> {
    return api.post('/sync/push', { operations });
  },

  async pullChanges(since: string): Promise<ApiResponse<unknown>> {
    return api.get(`/sync/pull?since=${encodeURIComponent(since)}`);
  },
};

// Notifications API
export const notificationsApi = {
  async registerDevice(
    token: string,
    platform: 'ios' | 'android'
  ): Promise<ApiResponse<unknown>> {
    return api.post('/notifications/register', { token, platform });
  },

  async unregisterDevice(): Promise<ApiResponse<unknown>> {
    return api.delete('/notifications/register');
  },
};
