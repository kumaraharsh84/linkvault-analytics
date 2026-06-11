import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CONFIG } from '../config';
import { Link as LinkIcon, BarChart2, Trash2, Download } from 'lucide-react';

export default function Dashboard({ token }) {
  const [links, setLinks] = useState([]);
  const [longUrl, setLongUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`${CONFIG.apiBase}/links`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLinks(data.links || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLinks();
  }, [fetchLinks]);

  const handleShorten = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${CONFIG.apiBase}/shorten`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ longUrl, customCode: customCode || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to shorten link');
      
      setLongUrl('');
      setCustomCode('');
      fetchLinks();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (code) => {
    if (!confirm('Are you sure you want to delete this link?')) return;
    try {
      await fetch(`${CONFIG.apiBase}/links/${code}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchLinks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadQR = (code) => {
    const svg = document.getElementById(`qr-${code}`);
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `qr-${code}.png`;
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  return (
    <div>
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LinkIcon size={24} color="var(--accent)" />
          Create New Link
        </h2>
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
        <form onSubmit={handleShorten} style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>Destination URL</label>
            <input 
              type="url" 
              className="input-field" 
              placeholder="https://example.com/very/long/path"
              value={longUrl}
              onChange={e => setLongUrl(e.target.value)}
              required
            />
          </div>
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>Custom Code (Optional)</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="my-link"
              value={customCode}
              onChange={e => setCustomCode(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ height: '42px' }}>
            {loading ? 'Shortening...' : 'Shorten'}
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {links.map(link => (
          <div key={link.code} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                <QRCodeSVG id={`qr-${link.code}`} value={`${CONFIG.apiBase}/${link.code}`} size={64} fgColor="var(--text)" bgColor="transparent" />
                <button onClick={() => handleDownloadQR(link.code)} className="btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Download size={12} /> QR
                </button>
              </div>
              <div>
                <h3 style={{ marginBottom: '0.25rem', fontSize: '1.1rem' }}>
                  <a href={`${CONFIG.apiBase}/${link.code}`} target="_blank" rel="noreferrer">
                    {CONFIG.apiBase.split('//')[1]}/{link.code}
                  </a>
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link.longUrl}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{link.clickCount || 0} clicks</span>
                  <span>Created {new Date(link.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to={`/analytics/${link.code}`} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart2 size={16} /> Analytics
              </Link>
              <button onClick={() => handleDelete(link.code)} className="btn-secondary" style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {links.length === 0 && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            No links created yet. Create your first link above!
          </div>
        )}
      </div>
    </div>
  );
}
