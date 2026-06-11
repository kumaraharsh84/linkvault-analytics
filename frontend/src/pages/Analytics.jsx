import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CONFIG } from '../config';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Analytics({ token }) {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`${CONFIG.apiBase}/analytics/${code}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load analytics');
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [code, token]);

  if (loading) return <div style={{ textAlign: 'center', padding: '4rem' }}>Loading analytics...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--danger)' }}>{error}</div>;
  if (!data) return null;

  const getChartColors = (count) => {
    const colors = [
      '#4f46e5', '#10b981', '#f59e0b', '#ef4444', 
      '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16'
    ];
    return Array.from({ length: count }).map((_, i) => colors[i % colors.length]);
  };

  const createChartData = (obj, label) => ({
    labels: Object.keys(obj || {}),
    datasets: [{
      label,
      data: Object.values(obj || {}),
      backgroundColor: getChartColors(Object.keys(obj || {}).length),
      borderWidth: 0,
    }]
  });

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', marginBottom: '1rem', textDecoration: 'none', fontWeight: '500' }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>Analytics for /{code}</h1>
            <a href={`${CONFIG.apiBase}/${code}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500', color: 'var(--accent)', textDecoration: 'none' }}>
              Test Link <ExternalLink size={16} />
            </a>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--accent)', lineHeight: 1 }}>{data.totalClicks}</div>
            <div style={{ color: 'var(--muted)', fontWeight: '500', marginTop: '0.25rem' }}>Total Clicks</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Clicks Over Time</h3>
          <div style={{ height: '250px' }}>
            <Line 
              data={{
                labels: Object.keys(data.byDate || {}),
                datasets: [{
                  label: 'Clicks',
                  data: Object.values(data.byDate || {}),
                  borderColor: '#4f46e5',
                  backgroundColor: 'rgba(79, 70, 229, 0.1)',
                  fill: true,
                  tension: 0.3
                }]
              }}
              options={{ maintainAspectRatio: false }}
            />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Traffic Sources (Referrer)</h3>
          <div style={{ height: '250px' }}>
            <Bar 
              data={createChartData(data.byReferrer, 'Clicks')}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
            />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Browsers</h3>
          <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut 
              data={createChartData(data.byBrowser, 'Clicks')}
              options={{ maintainAspectRatio: false }}
            />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Operating Systems</h3>
          <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut 
              data={createChartData(data.byOs, 'Clicks')}
              options={{ maintainAspectRatio: false }}
            />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Devices</h3>
          <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
            <Doughnut 
              data={createChartData(data.byDevice, 'Clicks')}
              options={{ maintainAspectRatio: false }}
            />
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Locations (Country)</h3>
          <div style={{ height: '250px' }}>
            <Bar 
              data={createChartData(data.byCountry, 'Clicks')}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
