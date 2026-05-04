import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGetMe, apiLogin, apiSignup } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    apiGetMe()
      .then((payload) => {
        if (mounted) setUser(payload.data.user);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
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
    logout: () => {
      window.location.href = '/logout';
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
