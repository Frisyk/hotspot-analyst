'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BASEMAPS, getBasemapConfig } from '../utils/basemaps';

const TABS = [
  { id: 'all', label: 'Semua' },
  { id: 'satellite', label: 'Satelit' },
  { id: 'relief', label: 'Relief' },
  { id: 'dark', label: 'Gelap' },
  { id: 'streets', label: 'Jalan' },
];

function matches(tab, b) {
  if (tab === 'all') return true;
  if (tab === 'dark') return b.category === 'monochrome';
  if (tab === 'streets') return b.category === 'streets' || b.category === 'topo';
  return b.category === tab;
}

export default function BasemapSelector({ activeMapType = 'dark', onSelectMapType }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const ref = useRef(null);
  const current = getBasemapConfig(activeMapType);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="bm" ref={ref}>
      <button
        id="btn-basemap-dropdown"
        className="bm-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        title="Ganti peta dasar"
      >
        <img className="bm-thumb" src={current.thumbnail} alt="" />
        <span className="bm-name">{current.name}</span>
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div className="bm-pop">
          <div className="bm-tabs">
            {TABS.map((t) => (
              <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="bm-grid">
            {BASEMAPS.filter((b) => matches(tab, b)).map((b) => (
              <button
                key={b.id}
                id={`basemap-option-${b.id}`}
                className="bm-card"
                aria-pressed={current.id === b.id}
                onClick={() => { onSelectMapType?.(b.id); setOpen(false); }}
                title={b.name}
              >
                <img src={b.thumbnail} alt="" loading="lazy" />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
