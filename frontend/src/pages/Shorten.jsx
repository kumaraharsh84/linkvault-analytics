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
    <div className="page-container">
      <div className="page-header" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', letterSpacing: '-0.04em' }}>Shorten & Track</h1>
        <p>Create powerful short links with built-in analytics.</p>
      </div>

      <div className="card-clean" style={{ marginBottom: '40px' }}>
        {error && <div style={{ color: 'white', backgroundColor: 'var(--danger)', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem', fontWeight: 500 }}>{error}</div>}
        {successMsg && <div style={{ color: 'var(--bg)', backgroundColor: 'var(--text)', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem', fontWeight: 500 }}>{successMsg}</div>}
        
        <form onSubmit={handleShorten} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>Destination URL</label>
            <input 
              type="url" 
              className="input-field" 
              placeholder="https://example.com/very/long/path"
              value={longUrl}
              onChange={e => setLongUrl(e.target.value)}
              required
              style={{ fontSize: '1rem', padding: '12px' }}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>Custom Code (Optional)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="my-link"
                value={customCode}
                onChange={e => setCustomCode(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '500' }}>Saved Title (Optional)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="e.g. Instagram Reel"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '12px', fontSize: '1rem', marginTop: '8px' }}>
            {loading ? 'Shortening...' : 'Shorten Link'}
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        <div className="card-clean" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '3rem', fontWeight: '700', letterSpacing: '-0.05em', lineHeight: 1 }}>{stats.totalLinks}</div>
          <div style={{ color: 'var(--muted)', marginTop: '8px', fontSize: '0.9rem', fontWeight: 500 }}>Total Links Created</div>
        </div>
        <div className="card-clean" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '3rem', fontWeight: '700', letterSpacing: '-0.05em', lineHeight: 1 }}>{stats.totalClicks}</div>
          <div style={{ color: 'var(--muted)', marginTop: '8px', fontSize: '0.9rem', fontWeight: 500 }}>Total Clicks</div>
        </div>
      </div>
    </div>
  );
}
