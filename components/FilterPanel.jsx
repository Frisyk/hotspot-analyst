'use client';

import React, { useState } from 'react';
import { Filter, Clock, RotateCcw, ChevronLeft, ChevronRight, Search, Flame } from 'lucide-react';

export default function FilterPanel({
  startTime,
  endTime,
  source,
  onApplyFilter,
  isLoading,
  minTimeBound,
  maxTimeBound,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [localStart, setLocalStart] = useState(startTime || '2026-10-22T00:00');
  const [localEnd, setLocalEnd] = useState(endTime || '2026-10-23T23:59');
  const [localSource, setLocalSource] = useState(source || 'all');

  // Update local state when prop defaults load
  React.useEffect(() => {
    if (startTime) setLocalStart(startTime);
    if (endTime) setLocalEnd(endTime);
  }, [startTime, endTime]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    onApplyFilter({
      start: localStart,
      end: localEnd,
      source: localSource,
    });
  };

  const handlePreset = (type) => {
    const maxBound = maxTimeBound || '2026-10-23T23:59';
    const [dPart, tPart] = maxBound.split('T');
    const [y, m, d] = (dPart || '2026-10-23').split('-').map(Number);
    const [hh, mm] = (tPart || '23:59').split(':').map(Number);
    const maxDate = new Date(y, m - 1, d, hh, mm);

    const pad = (n) => String(n).padStart(2, '0');
    const toStr = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

    if (type === 'all') {
      const s = minTimeBound || '2024-01-01T00:00';
      setLocalStart(s);
      setLocalEnd(maxBound);
      onApplyFilter({ start: s, end: maxBound, source: localSource });
    } else if (type === '3days') {
      const start = toStr(new Date(maxDate.getTime() - 3 * 24 * 60 * 60 * 1000));
      setLocalStart(start);
      setLocalEnd(maxBound);
      onApplyFilter({ start, end: maxBound, source: localSource });
    } else if (type === 'today') {
      const start = toStr(new Date(maxDate.getTime() - 24 * 60 * 60 * 1000));
      setLocalStart(start);
      setLocalEnd(maxBound);
      onApplyFilter({ start, end: maxBound, source: localSource });
    } else if (type === '7days') {
      const start = toStr(new Date(maxDate.getTime() - 7 * 24 * 60 * 60 * 1000));
      setLocalStart(start);
      setLocalEnd(maxBound);
      onApplyFilter({ start, end: maxBound, source: localSource });
    } else if (type === 'oct2026') {
      setLocalStart('2026-10-01T00:00');
      setLocalEnd('2026-10-23T23:59');
      onApplyFilter({ start: '2026-10-01T00:00', end: '2026-10-23T23:59', source: localSource });
    } else if (type === 'sep2026') {
      setLocalStart('2026-09-01T00:00');
      setLocalEnd('2026-09-30T23:59');
      onApplyFilter({ start: '2026-09-01T00:00', end: '2026-09-30T23:59', source: localSource });
    } else if (type === 'sipongi2024') {
      setLocalStart('2024-01-01T00:00');
      setLocalEnd('2024-01-03T23:59');
      setLocalSource('sipongi');
      onApplyFilter({ start: '2024-01-01T00:00', end: '2024-01-03T23:59', source: 'sipongi' });
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={styles.expandBtn}
        className="glass-panel"
        title="Buka Filter Panel"
      >
        <Filter size={18} color="#FF4500" />
        <span style={{ fontSize: '12px', fontWeight: '600' }}>Filter Waktu & Sumber</span>
        <ChevronRight size={16} />
      </button>
    );
  }

  return (
    <div style={styles.container} className="glass-panel">
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <Filter size={16} color="#FF4500" />
          <span>Filter Hotspot (Jam & Tanggal)</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={styles.collapseBtn}
          title="Tutup Panel"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Source Filter */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Sumber Data Hotspot:</label>
          <div style={styles.sourceSelector}>
            {[
              { id: 'all', label: 'Semua' },
              { id: 'firms', label: 'NASA FIRMS' },
              { id: 'sipongi', label: 'KLHK SIPONGI' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setLocalSource(s.id)}
                style={{
                  ...styles.sourceBtn,
                  background: localSource === s.id ? '#FF4500' : 'rgba(255, 255, 255, 0.05)',
                  color: localSource === s.id ? '#ffffff' : '#94a3b8',
                  borderColor: localSource === s.id ? '#FF4500' : 'rgba(255, 255, 255, 0.08)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date-Time Range Pickers (with Hour granularity) */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            <Clock size={12} style={{ marginRight: '4px' }} />
            Waktu Awal (WIB, sampai jam):
          </label>
          <input
            type="datetime-local"
            value={localStart}
            onChange={(e) => setLocalStart(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>
            <Clock size={12} style={{ marginRight: '4px' }} />
            Waktu Akhir (WIB, sampai jam):
          </label>
          <input
            type="datetime-local"
            value={localEnd}
            onChange={(e) => setLocalEnd(e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Quick Presets */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Preset Cepat:</label>
          <div style={styles.presetGrid}>
            <button
              type="button"
              onClick={() => handlePreset('3days')}
              style={styles.presetBtn}
              title="3 Hari Terakhir (20-23 Okt 2026)"
            >
              3 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => handlePreset('today')}
              style={styles.presetBtn}
              title="24 Jam Terakhir"
            >
              24 Jam Terakhir
            </button>
            <button
              type="button"
              onClick={() => handlePreset('7days')}
              style={styles.presetBtn}
              title="7 Hari Terakhir"
            >
              7 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => handlePreset('oct2026')}
              style={styles.presetBtn}
              title="Oktober 2026"
            >
              Bulan Okt 2026
            </button>
            <button
              type="button"
              onClick={() => handlePreset('sep2026')}
              style={styles.presetBtn}
              title="September 2026"
            >
              Bulan Sep 2026
            </button>
            <button
              type="button"
              onClick={() => handlePreset('sipongi2024')}
              style={styles.presetBtn}
              title="Data Sipongi 1-3 Jan 2024"
            >
              Jan 2024 (Sipongi)
            </button>
            <button
              type="button"
              onClick={() => handlePreset('all')}
              style={styles.presetBtn}
              title="Seluruh Data Tersimpan (2024 - 2026)"
            >
              Semua Data
            </button>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            ...styles.submitBtn,
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? (
            <RotateCcw size={16} className="spin-icon" />
          ) : (
            <Search size={16} />
          )}
          <span>{isLoading ? 'Memuat Data...' : 'Terapkan Filter'}</span>
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    top: '90px',
    left: '20px',
    zIndex: 90,
    width: '300px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  expandBtn: {
    position: 'absolute',
    top: '90px',
    left: '20px',
    zIndex: 90,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    color: '#f1f5f9',
    cursor: 'pointer',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  collapseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  sourceSelector: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px',
  },
  sourceBtn: {
    padding: '6px 4px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  input: {
    padding: '8px 10px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#f8fafc',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '6px',
  },
  presetBtn: {
    padding: '5px 8px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#cbd5e1',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #ff4500, #ff7a00)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(255, 69, 0, 0.35)',
    transition: 'all 0.2s ease',
  },
};
