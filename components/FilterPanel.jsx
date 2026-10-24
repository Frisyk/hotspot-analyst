'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Search } from 'lucide-react';
import { formatInput, parseWall } from '../utils/timeUtils';

const DAY = 86400000;
const PRESETS = [
  { id: '1d', label: '24 jam', span: DAY },
  { id: '3d', label: '3 hari', span: 3 * DAY },
  { id: '7d', label: '7 hari', span: 7 * DAY },
  { id: '30d', label: '30 hari', span: 30 * DAY },
  { id: '90d', label: '90 hari', span: 90 * DAY },
  { id: 'all', label: 'Semua', span: null },
];

const SOURCES = [
  { id: 'all', label: 'Semua' },
  { id: 'firms', label: 'FIRMS', color: 'var(--firms)' },
  { id: 'sipongi', label: 'SIPONGI', color: 'var(--sipongi)' },
];

function spanLabel(ms) {
  if (!(ms > 0)) return '—';
  const d = Math.floor(ms / DAY);
  const h = Math.round((ms % DAY) / 3600000);
  return [d ? `${d} hari` : null, h ? `${h} jam` : null].filter(Boolean).join(' ') || '< 1 jam';
}

/**
 * Dock kiri: filter (sumber, rentang waktu, preset). `children` dirender di bawahnya
 * (panel tampilan / medan 3D) agar semua kontrol berada di satu rel.
 */
export default function FilterPanel({
  startTime,
  endTime,
  source,
  onApplyFilter,
  isLoading,
  minTimeBound,
  maxTimeBound,
  collapsed,
  onToggleCollapse,
  resultTotal = null,
  children,
}) {
  const [localStart, setLocalStart] = useState(startTime || '');
  const [localEnd, setLocalEnd] = useState(endTime || '');
  const [localSource, setLocalSource] = useState(source || 'all');

  useEffect(() => { if (startTime) setLocalStart(startTime); }, [startTime]);
  useEffect(() => { if (endTime) setLocalEnd(endTime); }, [endTime]);
  useEffect(() => { if (source) setLocalSource(source); }, [source]);

  const hasRange = Boolean(localStart && localEnd);
  const span = hasRange ? parseWall(localEnd) - parseWall(localStart) : 0;
  const invalid = hasRange && !(span > 0);
  const dirty = localStart !== startTime || localEnd !== endTime || localSource !== source;

  const presetRange = (p) => {
    const rawMax = maxTimeBound || endTime;
    const maxMs = parseWall(rawMax);
    if (!Number.isFinite(maxMs)) return [localStart || '', localEnd || ''];
    if (p.span == null) return [minTimeBound || localStart, maxTimeBound || localEnd];
    const s = formatInput(maxMs - p.span);
    const e = formatInput(maxMs);
    if (!s || !e) return [localStart || '', localEnd || ''];
    return [s, e];
  };

  const activePreset = useMemo(
    () => PRESETS.find((p) => {
      const [s, e] = presetRange(p);
      return s && e && s === localStart && e === localEnd;
    })?.id,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localStart, localEnd, minTimeBound, maxTimeBound]
  );

  const applyPreset = (p) => {
    const [s, e] = presetRange(p);
    if (!s || !e) return;
    setLocalStart(s);
    setLocalEnd(e);
    onApplyFilter({ start: s, end: e, source: localSource });
  };

  const submit = (e) => {
    e.preventDefault();
    if (invalid || !localStart || !localEnd) return;
    if (localStart.includes('NaN') || localEnd.includes('NaN')) return;
    onApplyFilter({ start: localStart, end: localEnd, source: localSource });
  };

  return (
    <aside className={`dock${collapsed ? ' collapsed' : ''}`} aria-label="Panel filter">
      <button className="dock-toggle" onClick={onToggleCollapse} aria-label={collapsed ? 'Buka panel' : 'Tutup panel'}>
        <span>Kontrol</span>
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      <div className="dock-scroll">
        <form onSubmit={submit}>
          <section className="sec">
            <div className="sec-head"><span className="sec-no">01</span><span className="sec-title">Sumber data</span><span className="sec-rule" /></div>
            <div className="seg block" role="group" aria-label="Sumber data">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" aria-pressed={localSource === s.id} onClick={() => setLocalSource(s.id)}>
                  {s.color && <i className="sq" style={{ background: s.color }} />}
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="sec">
            <div className="sec-head"><span className="sec-no">02</span><span className="sec-title">Rentang waktu · WIB</span><span className="sec-rule" /></div>
            <label className="field">
              <span className="field-label">Dari</span>
              <input
                id="filter-start"
                type="datetime-local"
                className={`input${invalid ? ' bad' : ''}`}
                value={localStart}
                min={minTimeBound}
                max={maxTimeBound}
                onChange={(e) => setLocalStart(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Sampai</span>
              <input
                id="filter-end"
                type="datetime-local"
                className={`input${invalid ? ' bad' : ''}`}
                value={localEnd}
                min={minTimeBound}
                max={maxTimeBound}
                onChange={(e) => setLocalEnd(e.target.value)}
              />
            </label>
            <div className={`duration${invalid ? ' bad' : ''}`}>
              {!hasRange ? 'Memuat rentang waktu…' : invalid ? 'Waktu akhir harus setelah waktu awal' : `Durasi ${spanLabel(span)}`}
            </div>
          </section>

          <section className="sec">
            <div className="sec-head"><span className="sec-no">03</span><span className="sec-title">Preset (dari data terbaru)</span><span className="sec-rule" /></div>
            <div className="chips">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className={`chip${activePreset === p.id ? ' on' : ''}`} onClick={() => applyPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section className="sec">
            <div className="apply-row">
              <button id="btn-apply-filter" type="submit" className="btn primary" disabled={isLoading || invalid}>
                {isLoading ? <RotateCw size={14} className="spin" /> : <Search size={14} />}
                {isLoading ? 'Memuat…' : 'Terapkan'}
              </button>
              {dirty && !isLoading && <span className="dirty">belum diterapkan</span>}
            </div>
          </section>
        </form>

        {resultTotal != null && (
          <div className="result">
            <span className="k">Hasil filter</span>
            <span className="v">{resultTotal.toLocaleString('id-ID')}</span>
            <span className="s">deteksi hotspot</span>
          </div>
        )}

        {children}
      </div>
    </aside>
  );
}
