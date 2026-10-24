'use client';

import React from 'react';
import { getColorForDate } from '../utils/colorPalette';

export default function Legend({
  dateColorMap = {},
  dateStats = {},
  selectedDate = null,
  onSelectDate,
}) {
  const dates = Object.keys(dateStats).sort();
  if (dates.length === 0) return null;
  const max = Math.max(...dates.map((d) => dateStats[d]), 1);

  return (
    <aside className="legend" aria-label="Legenda tanggal">
      <div className="legend-head">
        <span className="legend-title">Tanggal · {dates.length}</span>
        {selectedDate && (
          <button className="legend-reset" onClick={() => onSelectDate(null)}>Semua</button>
        )}
      </div>

      <div className="legend-list">
        {dates.map((d) => {
          const color = getColorForDate(d, dateColorMap);
          const on = selectedDate === d;
          return (
            <button
              key={d}
              className={`legend-row${selectedDate && !on ? ' dim' : ''}`}
              aria-pressed={on}
              onClick={() => onSelectDate(on ? null : d)}
              title={`Isolasi ${d}`}
            >
              <span className="legend-sw" style={{ background: color }} />
              <span className="legend-date">{d}</span>
              <span className="legend-n">{dateStats[d].toLocaleString('id-ID')}</span>
              <span className="legend-bar" style={{ background: color, width: `${(dateStats[d] / max) * 100}%` }} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
