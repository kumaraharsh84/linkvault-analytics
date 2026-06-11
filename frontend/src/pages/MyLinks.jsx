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
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>My Links</h1>
          <p>Browse saved links, search, and jump back into anything you need.</p>
        </div>
        <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search links..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </div>

      <div className="card-clean" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredLinks.map(link => (
          <div key={link.code} className="link-item">
            <div className="link-item-left">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', width: '64px' }}>
                <QRCodeSVG id={`qr-${link.code}`} value={`${CONFIG.apiBase}/${link.code}`} size={56} fgColor="var(--text)" bgColor="transparent" />
                <button onClick={() => handleDownloadQR(link.code)} className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>
                  <Download size={10} style={{ marginRight: '4px' }} /> QR
                </button>
              </div>
              <div className="link-item-details">
                <div className="link-item-title">
                  {link.title ? link.title : 'Untitled Link'}
                </div>
                <a href={`${CONFIG.apiBase}/${link.code}`} target="_blank" rel="noreferrer" className="link-item-short">
                  {CONFIG.apiBase.split('//')[1]}/{link.code}
                </a>
                <div className="link-item-long" title={link.longUrl}>
                  {link.longUrl}
                </div>
                <div className="link-item-meta">
                  <span className="badge">{link.clickCount || 0} clicks</span>
                  <span>{new Date(link.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div className="link-item-actions">
              <Link to={`/analytics/${link.code}`} className="btn-secondary">
                <BarChart2 size={14} style={{ marginRight: '6px' }} /> Analytics
              </Link>
              <button onClick={() => handleDelete(link.code)} className="btn-secondary" style={{ color: 'var(--danger)', borderColor: 'transparent' }} title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {filteredLinks.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '8px' }}>No links found</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>{searchTerm ? 'Try adjusting your search term.' : 'Create your first short link from the Shorten tab.'}</p>
            {!searchTerm && <Link to="/" className="btn-primary">Go to Shorten</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
