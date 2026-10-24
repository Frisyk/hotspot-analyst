'use client';

import React from 'react';
import { parseWall } from '../utils/timeUtils';
import { getColorForHour, RECENCY_STOPS } from '../utils/colorPalette';

export default function Legend({
  minTime,
  maxTime,
  dateStats = {},
  selectedDate = null,
  onSelectDate,
}) {
  const dates = Object.keys(dateStats || {}).sort().reverse();
  if (dates.length === 0) return null;

  const minMs = parseWall(minTime) || 0;
  const maxMs = parseWall(maxTime) || minMs + 3600000;
  const minHour = Math.floor(minMs / 3600000);
  const maxHour = Math.floor(maxMs / 3600000);
  const maxCount = Math.max(...dates.map((d) => dateStats[d] || 0), 1);

  return (
    <aside className="legend" aria-label="Legenda spektrum waktu titik api">
      <div className="legend-head">
        <div className="legend-head-text">
          <span className="legend-title">Spektrum Waktu (Per Jam)</span>
          <div className="legend-sub">
            {selectedDate ? (
              <span className="legend-active-date">Isolasi {selectedDate} (24 Jam)</span>
            ) : (
              'Terbaru (Merah) → Lama (Biru)'
            )}
          </div>
        </div>
        {selectedDate && (
          <button
            id="btn-legend-reset"
            className="legend-reset"
            onClick={() => onSelectDate(null)}
            title="Tampilkan semua tanggal"
          >
            Semua
          </button>
        )}
      </div>

      <div className="legend-spectrum">
        <div
          className="legend-ramp"
          style={{
            background:
              'linear-gradient(to right, #0091FF 0%, #10B981 25%, #FFD200 50%, #FF7A00 75%, #FF2222 100%)',
          }}
        />
        <div className="legend-ramp-labels">
          <span className="ramp-lbl-old">Terdahulu</span>
          <span className="ramp-lbl-mid">Menengah</span>
          <span className="ramp-lbl-new">Terbaru</span>
        </div>
        <div className="legend-stops">
          {RECENCY_STOPS.map((st) => (
            <span key={st.hex} className="legend-stop-tag" title={st.label}>
              <i style={{ background: st.hex }} />
              <small>{st.label.split(' ')[0]}</small>
            </span>
          ))}
        </div>
      </div>

      <div className="legend-dates-header">
        <span>Rincian Tanggal</span>
        <small className="mono">{dates.length} hari</small>
      </div>

      <div className="legend-list">
        {dates.map((d, idx) => {
          const dMinH = Math.floor(parseWall(`${d} 00:00`) / 3600000);
          const dMaxH = Math.floor(parseWall(`${d} 23:59`) / 3600000);
          const colorStart = getColorForHour(dMinH, minHour, maxHour);
          const colorEnd = getColorForHour(dMaxH, minHour, maxHour);
          const isSingleNewest = idx === 0 && !selectedDate;
          const isSingleOldest = idx === dates.length - 1 && !selectedDate && dates.length > 1;
          const on = selectedDate === d;
          const count = dateStats[d] || 0;

          return (
            <button
              key={d}
              className={`legend-row${selectedDate && !on ? ' dim' : ''}${on ? ' active' : ''}`}
              aria-pressed={on}
              onClick={() => onSelectDate(on ? null : d)}
              title={on ? 'Hapus isolasi tanggal' : `Isolasi tanggal ${d}`}
            >
              <span
                className="legend-sw"
                style={{
                  background: `linear-gradient(135deg, ${colorStart}, ${colorEnd})`,
                }}
              />
              <div className="legend-info">
                <span className="legend-date">
                  {d}
                  {isSingleNewest && <span className="legend-tag new">Terbaru</span>}
                  {isSingleOldest && <span className="legend-tag old">Lama</span>}
                </span>
                <span className="legend-n">{count.toLocaleString('id-ID')} titik</span>
              </div>
              <span
                className="legend-bar"
                style={{
                  background: `linear-gradient(to right, ${colorStart}, ${colorEnd})`,
                  width: `${(count / maxCount) * 100}%`,
                }}
              />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
