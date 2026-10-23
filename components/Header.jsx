'use client';

import React from 'react';
import { Flame, Database, Layers, Radio } from 'lucide-react';

export default function Header({
  totalHotspots = 0,
  firmsCount = 0,
  sipongiCount = 0,
  activeMapType = 'hitam',
  onSelectMapType,
  layerMode = 'both',
  onSelectLayerMode,
  dbStats = null,
}) {
  const mapOptions = [
    { id: 'osm', label: 'OSM' },
    { id: 'hitam', label: 'Hitam' },
    { id: 'topografi', label: 'Topografi' },
  ];

  return (
    <header style={styles.header} className="glass-panel">
      <div style={styles.titleSection}>
        <div style={styles.logoIcon}>
          <Flame size={22} color="#FF4500" />
        </div>
        <div>
          <h1 style={styles.title}>Kalimantan Fire Hotspot Animation</h1>
          <div style={styles.subtitle}>
            <span style={styles.liveIndicator}>
              <Radio size={12} className="pulse-icon" /> Live PostGIS Raw Data
            </span>
            <span style={styles.dot}>•</span>
            <span>OpenLayers GIS Viewer</span>
          </div>
        </div>
      </div>

      <div style={styles.statsSection}>
        {/* Supabase Status Pill */}
        <div style={styles.statPill} title="Terhubung ke Database Cloud Supabase">
          <span style={{ ...styles.sourceDot, backgroundColor: '#3ECF8E', boxShadow: '0 0 8px #3ECF8E' }} />
          <span style={styles.statLabel}>Database:</span>
          <span style={{ ...styles.statValue, color: '#3ECF8E' }}>
            Supabase ({dbStats?.total ? `${dbStats.total.toLocaleString()} total` : 'Online'})
          </span>
        </div>

        <div style={styles.statPill}>
          <span style={styles.statLabel}>Ditampilkan:</span>
          <span style={styles.statValue}>{totalHotspots.toLocaleString()}</span>
        </div>

        <div style={styles.statPill}>
          <span style={{ ...styles.sourceDot, backgroundColor: '#FF9F1A' }} />
          <span style={styles.statLabel}>FIRMS:</span>
          <span style={styles.statValue}>{firmsCount}</span>
        </div>

        <div style={styles.statPill}>
          <span style={{ ...styles.sourceDot, backgroundColor: '#00F0FF' }} />
          <span style={styles.statLabel}>SIPONGI:</span>
          <span style={styles.statValue}>{sipongiCount}</span>
        </div>

        {/* Visual Layer Mode Selector (Gabungan, Densitas, Titik Api) */}
        <div style={styles.baseMapContainer}>
          <div style={styles.baseMapLabel}>
            <Flame size={13} color="#ff4500" />
            <span>Layer:</span>
          </div>
          <div style={styles.baseMapGroup}>
            {[
              { id: 'both', label: 'Gabungan' },
              { id: 'heatmap', label: 'Densitas' },
              { id: 'points', label: 'Titik Api' },
            ].map((opt) => {
              const isActive = layerMode === opt.id;
              return (
                <button
                  key={opt.id}
                  id={`btn-mode-${opt.id}`}
                  onClick={() => onSelectLayerMode && onSelectLayerMode(opt.id)}
                  style={{
                    ...styles.baseMapBtn,
                    background: isActive ? 'linear-gradient(135deg, #ff4500, #ff7a00)' : 'rgba(255, 255, 255, 0.05)',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    borderColor: isActive ? '#ff4500' : 'rgba(255, 255, 255, 0.1)',
                    boxShadow: isActive ? '0 0 10px rgba(255, 69, 0, 0.4)' : 'none',
                  }}
                  title={`Tampilan: ${opt.label}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Base Map Selector (OSM, Hitam, Topografi) */}
        <div style={styles.baseMapContainer}>
          <div style={styles.baseMapLabel}>
            <Layers size={13} color="#94a3b8" />
            <span>Peta:</span>
          </div>
          <div style={styles.baseMapGroup}>
            {mapOptions.map((opt) => {
              const isActive =
                activeMapType === opt.id ||
                (opt.id === 'hitam' && activeMapType === 'dark');

              return (
                <button
                  key={opt.id}
                  onClick={() => onSelectMapType && onSelectMapType(opt.id)}
                  style={{
                    ...styles.baseMapBtn,
                    background: isActive ? '#ff4500' : 'rgba(255, 255, 255, 0.05)',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    borderColor: isActive ? '#ff4500' : 'rgba(255, 255, 255, 0.1)',
                    boxShadow: isActive ? '0 0 10px rgba(255, 69, 0, 0.4)' : 'none',
                  }}
                  title={`Ganti peta dasar ke ${opt.label}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

const styles = {
  header: {
    position: 'absolute',
    top: '16px',
    left: '20px',
    right: '20px',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'rgba(255, 69, 0, 0.15)',
    border: '1px solid rgba(255, 69, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 16px rgba(255, 69, 0, 0.3)',
  },
  title: {
    fontSize: '17px',
    fontWeight: '700',
    letterSpacing: '-0.02em',
    color: '#f8fafc',
  },
  subtitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '2px',
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#10b981',
    fontWeight: '600',
  },
  dot: {
    color: '#475569',
  },
  statsSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  statPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '12px',
  },
  sourceDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  statLabel: {
    color: '#94a3b8',
  },
  statValue: {
    fontWeight: '700',
    color: '#f1f5f9',
    fontFamily: 'var(--font-mono)',
  },
  baseMapContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: '4px 6px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  baseMapLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#94a3b8',
    paddingLeft: '4px',
  },
  baseMapGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
  },
  baseMapBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
