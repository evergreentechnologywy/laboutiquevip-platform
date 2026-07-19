import React, { createContext, useState, useContext, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth as useClerkAuth, useUser as useClerkUser } from "@clerk/react";
import { buildLoginUrl, currentAppPath } from "@/lib/authUrls";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { getToken, signOut, isLoaded: isAuthLoaded } = useClerkAuth();
  const { user: clerkUser, isLoaded: isUserLoaded, isSignedIn } = useClerkUser();

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState(null);

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
    } catch (err) {
      setUser(null);
      setIsAuthenticated(false);
      base44.auth.clearToken();
      if (err?.status === 404 || err?.code === "user_not_registered") {
        setAuthError({ type: "user_not_registered" });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAppState();
  }, [isUserLoaded, isAuthLoaded, isSignedIn, clerkUser]);

  // Public directory must never gate on auth infra: if Clerk hasn't resolved
  // within 4s (missing/invalid key, blocked CDN, Clerk outage), proceed as
  // anonymous rather than spinning forever.
  useEffect(() => {
    const t = setTimeout(() => {
      setIsLoadingAuth((cur) => {
        if (cur) {
          setUser(null);
          setIsAuthenticated(false);
          try { base44.auth.clearToken(); } catch { /* noop */ }
        }
        return false;
      });
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.clearToken();
    await signOut();
    if (shouldRedirect) {
      window.location.href = "/";
    }
  };

  const navigateToLogin = (next) => {
    const target = next || currentAppPath();
    window.location.href = buildLoginUrl(target);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
