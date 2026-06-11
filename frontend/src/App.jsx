import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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

  return (
    <div className="app-container">
      <nav style={{ padding: '1rem', borderBottom: '1px solid var(--nav-border)', backgroundColor: 'var(--nav-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--text)' }}>
          LinkVault
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={toggleTheme} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {token && (
            <button onClick={handleLogout} className="btn-secondary">
              Sign Out
            </button>
          )}
        </div>
      </nav>

      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <Routes>
          <Route path="/login" element={!token ? <Login setToken={setToken} /> : <Navigate to="/" />} />
          <Route path="/" element={token ? <Dashboard token={token} /> : <Navigate to="/login" />} />
          <Route path="/analytics/:code" element={token ? <Analytics token={token} /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
