import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SubscriptionPlan } from "@shared/subscriptions";

interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role?: string;
  plan: SubscriptionPlan;
  planRenewalAt?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Initialize auth state - use cookies only for consistency
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Try to authenticate with cookies (server handles httpOnly cookies automatically)
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setIsAuthenticated(true);
          localStorage.setItem("user", JSON.stringify(userData));
          return;
        }
        
        // If auth fails, clear any stale data
        setUser(null);
        setIsAuthenticated(false);
        setToken(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      } catch (error) {
        console.error("Auth initialization failed:", error);
        setUser(null);
        setIsAuthenticated(false);
        setToken(null);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    };

    initializeAuth();
  }, []);

  // Use a simple query to periodically check auth status
  const { data, isError, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    queryFn: async (): Promise<User> => {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Auth check failed");
      }
      
      return response.json();
    },
    enabled: isAuthenticated, // Only run if we think we're authenticated
    retry: false,
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (data) {
      setUser(data);
      localStorage.setItem("user", JSON.stringify(data));
    }
  }, [data]);

  useEffect(() => {
    if (isError) {
      setUser(null);
      setIsAuthenticated(false);
      setToken(null);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  }, [isError]);

  const login = (newToken: string, userData: User) => {
    // Store token in localStorage for API requests (even though cookies are primary)
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(userData));
  };

  const logout = async () => {
    try {
      // Call logout endpoint to clear httpOnly cookies
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.error("Logout API call failed:", error);
    } finally {
      // Clear local state regardless of API call result
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setLocation("/");
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
