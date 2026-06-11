import { useState, useEffect } from 'react';
import { CONFIG } from '../config';

export default function Shorten({ token }) {
  const [longUrl, setLongUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const [stats, setStats] = useState({ totalLinks: 0, totalClicks: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${CONFIG.apiBase}/links`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          const links = Array.isArray(data) ? data : (data.links || []);
          const clicks = links.reduce((acc, link) => acc + (link.clickCount || 0), 0);
          setStats({ totalLinks: links.length, totalClicks: clicks });
        }
      } catch (err) {}
    };
    fetchStats();
  }, [token]);

  const handleShorten = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${CONFIG.apiBase}/shorten`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ longUrl, customCode: customCode || undefined, title: title || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to shorten link');
      
      setLongUrl('');
      setCustomCode('');
      setTitle('');
      setSuccessMsg(`Link shortened successfully! ${CONFIG.apiBase.split('//')[1]}/${data.link.code}`);
      setStats(prev => ({ ...prev, totalLinks: prev.totalLinks + 1 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: 'var(--accent)' }}>Shorten & Track</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1.2rem' }}>Create powerful short links with built-in analytics.</p>
      </div>

      <div className="glass-panel" style={{ padding: '3rem', marginBottom: '3rem', maxWidth: '800px', margin: '0 auto 3rem auto' }}>
        {error && <div style={{ color: 'white', backgroundColor: 'var(--danger)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>{error}</div>}
        {successMsg && <div style={{ color: 'white', backgroundColor: 'var(--accent)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>{successMsg}</div>}
        
        <form onSubmit={handleShorten} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '1rem', fontWeight: '500' }}>Destination URL</label>
            <input 
              type="url" 
              className="input-field" 
              placeholder="https://example.com/very/long/path"
              value={longUrl}
              onChange={e => setLongUrl(e.target.value)}
              required
              style={{ fontSize: '1.1rem', padding: '1rem' }}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>Custom Code (Optional)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="my-link"
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>Saved Title (Optional)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="e.g. Instagram Reel"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '1rem', fontSize: '1.1rem', marginTop: '1rem' }}>
            {loading ? 'Shortening...' : 'Shorten Link'}
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text)' }}>{stats.totalLinks}</div>
          <div style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>Total Links Created</div>
        </div>
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--text)' }}>{stats.totalClicks}</div>
          <div style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>Total Clicks</div>
        </div>
      </div>
    </div>
  );
}
