'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type TenantInfo = {
  id: string;
  name: string;
  subdomain: string;
  settings: Record<string, unknown>;
};

type TenantContextType = {
  tenant: TenantInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

type TenantProviderProps = {
  children: ReactNode;
  initialTenant?: TenantInfo | null;
};

export function TenantProvider({ children, initialTenant = null }: TenantProviderProps) {
  const [tenant, setTenant] = useState<TenantInfo | null>(initialTenant);
  const [isLoading, setIsLoading] = useState(!initialTenant);
  const [error, setError] = useState<string | null>(null);

  const fetchTenant = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tenant');
      if (!response.ok) {
        if (response.status === 401) {
          setTenant(null);
          return;
        }
        throw new Error('Failed to fetch tenant');
      }
      const data = await response.json();
      setTenant(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTenant(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialTenant) {
      fetchTenant();
    }
  }, [initialTenant]);

  return (
    <TenantContext.Provider
      value={{
        tenant,
        isLoading,
        error,
        refetch: fetchTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextType {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/**
 * Hook that returns tenant or throws if not available
 * Use in components that require tenant to function
 */
export function useRequiredTenant(): TenantInfo {
  const { tenant, isLoading } = useTenant();

  if (isLoading) {
    throw new Error('Tenant is still loading');
  }

  if (!tenant) {
    throw new Error('Tenant is required but not available');
  }

  return tenant;
}
