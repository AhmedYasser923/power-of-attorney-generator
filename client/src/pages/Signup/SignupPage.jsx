import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import reflyLogo from '../../assets/refly-logo.png';
import '../Login/LoginPage.css';
import './SignupPage.css';

export default function SignupPage() {
  const { loading, signup, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    setSuccess('');
    setSubmitting(true);

    try {
      const payload = await signup(form);
      setSuccess(payload.message || 'Your request was submitted and is awaiting admin approval.');
      setForm({ name: '', email: '', password: '', passwordConfirm: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-page signup-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={reflyLogo} alt="" aria-hidden="true" />
          <span>Refly</span>
        </div>

        <div className="auth-header">
          <h1>Request access</h1>
          <p>New accounts are reviewed before activation.</p>
        </div>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
        {success && <div className="auth-alert auth-alert--success">{success}</div>}

        <form className="auth-form" onSubmit={submit}>
          <label className="auth-field">
            <span>Name</span>
            <input
              autoComplete="name"
              name="name"
              onChange={updateField}
              required
              type="text"
              value={form.name}
            />
          </label>

          <label className="auth-field">
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              onChange={updateField}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              onChange={updateField}
              required
              type="password"
              value={form.password}
            />
          </label>

          <label className="auth-field">
            <span>Confirm Password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              name="passwordConfirm"
              onChange={updateField}
              required
              type="password"
              value={form.passwordConfirm}
            />
          </label>

          <button className="auth-submit" disabled={loading || submitting} type="submit">
            {submitting ? 'Submitting...' : 'Request access'}
          </button>
        </form>

        <p className="auth-switch">
          Already approved? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
