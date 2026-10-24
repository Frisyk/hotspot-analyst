'use client';

import React from 'react';
import { EyeOff } from 'lucide-react';
import BasemapSelector from './BasemapSelector';

const LAYER_MODES = [
  { id: 'heatmap', label: 'Bara', title: 'Kepadatan: titik bertumpuk menyala dari merah ke putih' },
  { id: 'points', label: 'Titik', title: 'Titik hotspot berwarna menurut tanggal' },
  { id: 'both', label: 'Gabungan', title: 'Bara + titik' },
];

function BrandMark() {
  // garis kontur membentuk nyala api: penanda "topografi + api"
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M13 1.5c.4 5.6 7.6 7.6 7.6 14.4a7.6 7.6 0 0 1-15.2 0c0-3.4 2.4-4.9 3-8 1.6 1.2 3.2.4 4.6-6.4Z" stroke="#ff5b1f" strokeWidth="1.2" />
      <path d="M13 8.2c.3 3.4 4.4 4.8 4.4 8.6a4.4 4.4 0 0 1-8.8 0c0-1.9 1.4-2.8 1.8-4.6 1 .7 1.9.2 2.6-4Z" stroke="#ffb347" strokeWidth="1.2" />
      <rect x="11.6" y="15.6" width="2.8" height="2.8" fill="#fffbea" />
    </svg>
  );
}

function Readout({ label, value, color, className = '' }) {
  return (
    <div className={`readout ${className}`}>
      <span className="k">
        {color && <i className="sq" style={{ background: color }} />}
        {label}
      </span>
      <span className="v">{value}</span>
    </div>
  );
}

const fmt = (n) => (n ?? 0).toLocaleString('id-ID');

export default function Header({
  shown = 0,
  firms = 0,
  sipongi = 0,
  dbTotal = null,
  activeMapType = 'dark',
  onSelectMapType,
  layerMode = 'both',
  onSelectLayerMode,
  onToggleHideUI,
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark />
        <div>
          <h1 className="brand-name">TITIK API</h1>
          <div className="brand-sub">Pantau hotspot · Kalimantan</div>
        </div>
      </div>

      <div className="readouts" aria-live="polite">
        <Readout label="Ditampilkan" value={fmt(shown)} />
        <Readout label="FIRMS" value={fmt(firms)} color="var(--firms)" />
        <Readout label="SIPONGI" value={fmt(sipongi)} color="var(--sipongi)" />
        {dbTotal != null && <Readout label="Arsip DB" value={fmt(dbTotal)} className="hide-sm" />}
      </div>

      <div className="live"><i /> Live · PostGIS</div>

      <div className="topbar-right">
        <span className="tb-label">Layer</span>
        <div className="seg" role="group" aria-label="Mode layer">
          {LAYER_MODES.map((m) => (
            <button
              key={m.id}
              id={`btn-mode-${m.id}`}
              aria-pressed={layerMode === m.id}
              title={m.title}
              onClick={() => onSelectLayerMode?.(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <BasemapSelector activeMapType={activeMapType} onSelectMapType={onSelectMapType} />

        <button id="btn-hide-ui" className="btn" onClick={onToggleHideUI} title="Sembunyikan semua panel">
          <EyeOff size={13} /> Peta penuh
        </button>
      </div>
    </header>
  );
}
