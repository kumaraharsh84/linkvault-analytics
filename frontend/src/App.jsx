import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { CONFIG } from './config';
import Login from './pages/Login';
import Shorten from './pages/Shorten';
import MyLinks from './pages/MyLinks';
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

  const getNavStyle = (path) => {
    const isActive = location.pathname === path || (path === '/analytics' && location.pathname.startsWith('/analytics'));
    return isActive ? 'nav-link active' : 'nav-link';
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div className="nav-brand">
            <div className="nav-brand-logo">L</div> LinkVault
          </div>
          
          {token && (
            <div className="nav-links">
              <Link to="/" className={getNavStyle('/')}>Shorten</Link>
              <Link to="/links" className={getNavStyle('/links')}>My Links</Link>
              <Link to="/analytics" className={getNavStyle('/analytics')}>Analytics</Link>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={toggleTheme} className="btn-secondary" style={{ padding: '6px' }} title="Toggle Theme">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {token && (
            <button onClick={handleLogout} className="btn-secondary">
              Sign Out
            </button>
          )}
        </div>
      </nav>

      <main>
        <Routes>
          <Route path="/login" element={!token ? <Login setToken={setToken} /> : <Navigate to="/" />} />
          <Route path="/" element={token ? <Shorten token={token} /> : <Navigate to="/login" />} />
          <Route path="/links" element={token ? <MyLinks token={token} /> : <Navigate to="/login" />} />
          <Route path="/analytics" element={token ? (
            <div className="page-container">
              <div className="card-clean" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <h2 style={{ marginBottom: '12px' }}>Analytics Overview</h2>
                <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>Please select a specific link from your My Links tab to view its detailed analytics.</p>
                <Link to="/links" className="btn-primary">View My Links</Link>
              </div>
            </div>
          ) : <Navigate to="/login" />} />
          <Route path="/analytics/:code" element={token ? <Analytics token={token} /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
