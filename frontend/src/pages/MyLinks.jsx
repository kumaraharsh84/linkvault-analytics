import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CONFIG } from '../config';
import { BarChart2, Trash2, Download, Search } from 'lucide-react';

export default function MyLinks({ token }) {
  const [links, setLinks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`${CONFIG.apiBase}/links`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLinks(Array.isArray(data) ? data : (data.links || []));
      }
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleDelete = async (code) => {
    if (!window.confirm('Are you sure you want to delete this link?')) return;
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

  const filteredLinks = links.filter(link => {
    const search = searchTerm.toLowerCase();
    return (link.title && link.title.toLowerCase().includes(search)) ||
           (link.code && link.code.toLowerCase().includes(search)) ||
           (link.longUrl && link.longUrl.toLowerCase().includes(search));
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>My Links</h1>
          <p style={{ color: 'var(--muted)' }}>Browse saved links, filter, and jump back into anything you need.</p>
        </div>
        <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search links..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {filteredLinks.map(link => (
          <div key={link.code} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flex: 1, minWidth: '300px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                <QRCodeSVG id={`qr-${link.code}`} value={`${CONFIG.apiBase}/${link.code}`} size={64} fgColor="var(--text)" bgColor="transparent" />
                <button onClick={() => handleDownloadQR(link.code)} className="btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Download size={12} /> QR
                </button>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <h3 style={{ marginBottom: '0.25rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {link.title && <span style={{ fontWeight: '600' }}>{link.title}</span>}
                  {link.title && <span style={{ color: 'var(--border)' }}>|</span>}
                  <a href={`${CONFIG.apiBase}/${link.code}`} target="_blank" rel="noreferrer" style={{ fontWeight: link.title ? '400' : '600', textDecoration: 'none', color: 'var(--accent)' }}>
                    {CONFIG.apiBase.split('//')[1]}/{link.code}
                  </a>
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link.longUrl}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{link.clickCount || 0} clicks</span>
                  <span>Created {new Date(link.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to={`/analytics/${link.code}`} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                <BarChart2 size={16} /> Analytics
              </Link>
              <button onClick={() => handleDelete(link.code)} className="btn-secondary" style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {filteredLinks.length === 0 && (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
            <h3 style={{ marginBottom: '0.5rem' }}>No links found</h3>
            <p style={{ color: 'var(--muted)' }}>{searchTerm ? 'Try adjusting your search term.' : 'Create your first short link from the Shorten tab to get started.'}</p>
            {!searchTerm && <Link to="/" className="btn-primary" style={{ display: 'inline-block', marginTop: '1.5rem', textDecoration: 'none' }}>Go to Shorten</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
