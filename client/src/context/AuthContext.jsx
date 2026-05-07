import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiGetMe, apiLogin, apiLogout, apiSignup, setSessionExpiredHandler } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutInFlight = useRef(false);

  const handleSessionExpired = useCallback(() => {
    if (logoutInFlight.current) return;
    setUser(null);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired);
    return () => setSessionExpiredHandler(null);
  }, [handleSessionExpired]);

  useEffect(() => {
    let mounted = true;

    apiGetMe()
      .then((payload) => { if (mounted) setUser(payload.data.user); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, []);

  // Revalidate session when tab regains focus
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      apiGetMe()
        .then((payload) => setUser(payload.data.user))
        .catch(() => setUser(null));
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login: async (credentials) => {
      const payload = await apiLogin(credentials);
      setUser(payload.data.user);
      return payload;
    },
    signup: apiSignup,
    logout: async () => {
      logoutInFlight.current = true;
      try { await apiLogout(); } catch { /* ignore */ }
      setUser(null);
      logoutInFlight.current = false;
    }
  }), [loading, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
