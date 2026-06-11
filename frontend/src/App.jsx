import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { CONFIG } from './config';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import { Moon, Sun } from 'lucide-react';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem(CONFIG.themeStorageKey) || 'light');
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(CONFIG.themeStorageKey, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    navigate('/login');
  };

  const location = useLocation();

  const getNavStyle = (path) => ({
    color: location.pathname === path || (path === '/analytics' && location.pathname.startsWith('/analytics')) ? 'var(--accent)' : 'var(--text)',
    textDecoration: 'none',
    fontWeight: 600,
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    backgroundColor: location.pathname === path || (path === '/analytics' && location.pathname.startsWith('/analytics')) ? 'var(--accent-soft)' : 'transparent',
    transition: 'all 0.2s'
  });

  return (
    <div className="app-container">
      <nav style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--card)', backdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ fontWeight: '800', fontSize: '1.5rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.8rem' }}>🔗</span> LinkVault
          </div>
          
          {token && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to="/" style={getNavStyle('/')}>Dashboard</Link>
              <Link to="/analytics" style={getNavStyle('/analytics')}>Analytics</Link>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={toggleTheme} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', borderRadius: '50%' }}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {token && (
            <button onClick={handleLogout} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Sign Out
            </button>
          )}
        </div>
      </nav>

      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <Routes>
          <Route path="/login" element={!token ? <Login setToken={setToken} /> : <Navigate to="/" />} />
          <Route path="/" element={token ? <Dashboard token={token} /> : <Navigate to="/login" />} />
          <Route path="/analytics" element={token ? (
            <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <h2 style={{ marginBottom: '1rem' }}>Analytics Dashboard</h2>
              <p style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>Please select a specific link from your Dashboard to view its detailed analytics.</p>
              <Link to="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1.5rem' }}>Go to Dashboard</Link>
            </div>
          ) : <Navigate to="/login" />} />
          <Route path="/analytics/:code" element={token ? <Analytics token={token} /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
