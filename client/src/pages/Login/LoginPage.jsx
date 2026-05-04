import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import reflyLogo from '../../assets/refly-logo.png';
import './LoginPage.css';

export default function LoginPage() {
  const { loading, login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate('/', { replace: true });
    }
  }, [loading, navigate, user]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={reflyLogo} alt="" aria-hidden="true" />
          <span>Refly</span>
        </div>

        <div className="auth-header">
          <h1>Sign in</h1>
          <p>Use your approved workspace account.</p>
        </div>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              onChange={updateField}
              placeholder="name@example.com"
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={updateField}
              required
              type="password"
              value={form.password}
            />
          </label>

          <button className="auth-submit" disabled={loading || submitting} type="submit">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          Need access? <Link to="/signup">Request an account</Link>
        </p>
      </div>
    </section>
  );
}
