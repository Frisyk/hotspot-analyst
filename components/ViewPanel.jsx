'use client';

import React from 'react';

/** Panel tampilan: kepadatan "bara" + medan 3D. Dirender di dalam dock FilterPanel. */
export default function ViewPanel({
  glowRadius,
  onGlowRadius,
  glowOpacity,
  onGlowOpacity,
  terrain,
  onTerrainChange,
  layerMode,
}) {
  const glowActive = layerMode === 'both' || layerMode === 'heatmap';

  return (
    <>
      <section className="sec">
        <div className="sec-head"><span className="sec-no">04</span><span className="sec-title">Kepadatan · bara</span><span className="sec-rule" /></div>

        <label className="field">
          <span className="field-label">Radius sebar <b>{glowRadius} px</b></span>
          <input
            id="range-glow-radius" className="range" type="range" min={6} max={44}
            value={glowRadius} disabled={!glowActive}
            onChange={(e) => onGlowRadius(parseInt(e.target.value, 10))}
          />
        </label>
        <label className="field">
          <span className="field-label">Intensitas <b>{Math.round(glowOpacity * 100)}%</b></span>
          <input
            id="range-glow-opacity" className="range" type="range" min={25} max={100}
            value={Math.round(glowOpacity * 100)} disabled={!glowActive}
            onChange={(e) => onGlowOpacity(parseInt(e.target.value, 10) / 100)}
          />
        </label>

        <div
          className="ramp"
          style={{
            background: 'linear-gradient(90deg, #7F0000 0%, #E52B1E 25%, #FF6B00 50%, #FFB300 75%, #FFF033 90%, #FFFFFF 100%)',
            height: '10px',
            borderRadius: '3px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
          aria-hidden="true"
        />
        <div className="ramp-labels" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
          <span style={{ color: '#E53935' }}>Jarang (1×)</span>
          <span style={{ color: '#FB8C00' }}>Menumpuk</span>
          <span style={{ color: '#FFD54F' }}>Sering</span>
          <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Sangat Padat</span>
        </div>
        <p className="note" style={{ marginTop: 6, fontSize: '10.5px', color: 'var(--bone-faint)', lineHeight: 1.35 }}>
          Warna bara mencerminkan <b>intensitas/frekuensi kemunculan hotspot</b> di wilayah tersebut, berbeda dengan titik yang mewakili tanggal kejadian.
        </p>
      </section>

      <section className="sec">
        <div className="sec-head"><span className="sec-no">05</span><span className="sec-title">Medan 3D</span><span className="sec-rule" /></div>

        <button
          id="switch-terrain"
          type="button"
          className="switch"
          aria-pressed={terrain.enabled}
          onClick={() => onTerrainChange({ ...terrain, enabled: !terrain.enabled })}
        >
          <span className="sw-text">
            <div className="sw-title">Relief elevasi (DEM)</div>
            <div className="sw-desc">Miringkan peta & lihat hotspot di atas lereng</div>
          </span>
          <span className="sw-box" />
        </button>

        <label className="field" style={{ marginTop: 12 }}>
          <span className="field-label">Skala vertikal <b>{terrain?.exaggeration != null && Number.isFinite(terrain.exaggeration) ? terrain.exaggeration.toFixed(1) : '1.5'}×</b></span>
          <input
            id="range-exaggeration" className="range" type="range" min={10} max={40}
            value={Math.round(terrain.exaggeration * 10)} disabled={!terrain.enabled}
            onChange={(e) => onTerrainChange({ ...terrain, exaggeration: parseInt(e.target.value, 10) / 10 })}
          />
        </label>
        <p className="note">Putar & miringkan dengan klik-kanan + seret (atau Ctrl + seret). Tombol kompas mengembalikan ke utara.</p>
      </section>
    </>
  );
}
