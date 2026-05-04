import { useAuth } from '../../context/AuthContext.jsx';
import Sidebar from '../Sidebar/Sidebar.jsx';
import './AppShell.css';

export default function AppShell({ authenticated = false, children }) {
  const { user } = useAuth();

  if (!authenticated) {
    return <main id="main-content">{children}</main>;
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <div className="main">
        <main id="main-content" className="content">
          <div className="content__inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
