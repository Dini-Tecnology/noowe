import { useState, useEffect } from 'react';
import { authService } from '../services/auth';
import type { NormalizedAuthUser } from '../services/supabase-auth';

type User = NormalizedAuthUser;

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthStatus();
    return authService.onAuthStateChange((authenticated) => {
      setIsAuthenticated(authenticated);
      if (authenticated) {
        void refreshUser();
      } else {
        setUser(null);
      }
    });
  }, []);

  const checkAuthStatus = async () => {
    try {
      const currentUser = await authService.restoreSession();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
    } catch (error) {
      console.error('Failed to check auth status:', error);
      await logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const { user: loggedInUser } = await authService.login(email, password);
      if (!loggedInUser) {
        return { success: false, error: 'Login did not return an authenticated Supabase user' };
      }
      setUser(loggedInUser);
      setIsAuthenticated(true);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      const { user: registeredUser } = await authService.register(
        email,
        password,
        fullName
      );
      if (!registeredUser) {
        setUser(null);
        setIsAuthenticated(false);
        return { success: true };
      }
      setUser(registeredUser);
      setIsAuthenticated(true);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setIsAuthenticated(Boolean(currentUser));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  return {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshUser,
  };
};
