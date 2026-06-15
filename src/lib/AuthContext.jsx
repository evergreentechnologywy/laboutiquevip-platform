import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { getToken, signOut, isLoaded: isAuthLoaded } = useClerkAuth();
  const { user: clerkUser, isLoaded: isUserLoaded, isSignedIn } = useClerkUser();

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const checkAppState = async () => {
    setAuthError(null);
    if (!isUserLoaded || !isAuthLoaded) {
      setIsLoadingAuth(true);
      return;
    }

    if (!isSignedIn) {
      setUser(null);
      setIsAuthenticated(false);
      base44.auth.clearToken();
      setIsLoadingAuth(false);
      return;
    }

    try {
      const token = await getToken();
      if (token) {
        base44.auth.setToken(token);
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        base44.auth.clearToken();
      }
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      base44.auth.clearToken();
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAppState();
  }, [isUserLoaded, isAuthLoaded, isSignedIn, clerkUser]);

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.clearToken();
    await signOut();
    if (shouldRedirect) {
      window.location.href = '/';
    }
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
