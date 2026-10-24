'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FastForward, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { dateOfHour, formatDay, formatWall, parseWall } from '../utils/timeUtils';
import { getColorForDate } from '../utils/colorPalette';

const MAX_BINS = 360;

export default function TimeSlider({
  minTime,
  maxTime,
  currentTime,
  onTimeChange,
  isCumulative = true,
  onToggleCumulative,
  hourly = null, // { hr0, total: number[] }
  dateColorMap = {},
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const minMs = parseWall(minTime) || 0;
  const maxMs = parseWall(maxTime) || minMs + 3600000;
  const totalHours = Math.max(1, Math.round((maxMs - minMs) / 3600000));
  const curMs = currentTime ? parseWall(currentTime) : maxMs;
  const offset = Math.min(totalHours, Math.max(0, Math.round((curMs - minMs) / 3600000)));
  const startHr = Math.floor(minMs / 3600000);

  const offRef = useRef(offset);
  offRef.current = offset;

  const setOffset = (h) => onTimeChange(formatWall(minMs + h * 3600000));

  // ---------- animasi per jam ----------
  useEffect(() => {
    if (!isPlaying) return undefined;
    const id = setInterval(() => {
      const next = offRef.current + 1 > totalHours ? 0 : offRef.current + 1;
      onTimeChange(formatWall(minMs + next * 3600000));
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [isPlaying, speed, totalHours, minMs, onTimeChange]);

  const togglePlay = () => {
    if (!isPlaying && offset >= totalHours) setOffset(0);
    setIsPlaying(!isPlaying);
  };

  // ---------- histogram jam ----------
  const bars = useMemo(() => {
    const bins = Math.min(totalHours + 1, MAX_BINS);
    const per = Math.ceil((totalHours + 1) / bins);
    const out = [];
    let max = 0;
    for (let b = 0; b < bins; b++) {
      let sum = 0;
      for (let k = 0; k < per; k++) {
        const idx = startHr + b * per + k - (hourly?.hr0 ?? 0);
        if (hourly && idx >= 0 && idx < hourly.total.length) sum += hourly.total[idx];
      }
      out.push({ sum, endHour: (b + 1) * per - 1, date: dateOfHour(startHr + b * per) });
      if (sum > max) max = sum;
    }
    return { out, max, bins, per };
  }, [hourly, startHr, totalHours]);

  // ---------- label sumbu (batas hari) ----------
  const ticks = useMemo(() => {
    const t = [];
    const firstMidnight = Math.ceil(minMs / 86400000) * 86400000;
    const days = Math.max(1, Math.floor((maxMs - firstMidnight) / 86400000) + 1);
    const step = Math.ceil(days / 7);
    let i = 0;
    for (let ms = firstMidnight; ms <= maxMs; ms += 86400000, i++) {
      if (i % step === 0) t.push({ pct: ((ms - minMs) / (maxMs - minMs)) * 100, label: formatDay(ms).slice(0, -5) });
    }
    return t;
  }, [minMs, maxMs]);

  const clock = new Date(curMs);
  const hh = String(clock.getUTCHours()).padStart(2, '0');
  const mm = String(clock.getUTCMinutes()).padStart(2, '0');
  const playheadPct = (offset / totalHours) * 100;
  const peakPerHour = hourly ? Math.max(0, ...hourly.total) : 0;

  return (
    <section className="timeline" aria-label="Timeline animasi">
      <div className="tl-left">
        <div className="tl-clock">
          <div className="d">{formatDay(curMs)}</div>
          <div className="t">{hh}:{mm}<small>WIB</small></div>
        </div>

        <div className="tl-transport">
          <button className="tl-btn" onClick={() => setOffset(Math.max(0, offset - 1))} title="Mundur 1 jam" aria-label="Mundur 1 jam">
            <SkipBack size={14} />
          </button>
          <button
            id="btn-play"
            className="tl-btn play"
            onClick={togglePlay}
            title={isPlaying ? 'Jeda' : 'Putar per jam'}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button className="tl-btn" onClick={() => setOffset(Math.min(totalHours, offset + 1))} title="Maju 1 jam" aria-label="Maju 1 jam">
            <SkipForward size={14} />
          </button>
          <button
            className="tl-btn tl-speed"
            onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 8 : 1)}
            title="Kecepatan animasi"
          >
            <FastForward size={12} />{speed}×
          </button>
        </div>
      </div>

      <div className="tl-main">
        <div className="tl-top">
          <span className="tl-cap">Hotspot per jam{peakPerHour ? <> · puncak <b>{peakPerHour.toLocaleString('id-ID')}</b></> : null}</span>
          <div className="seg" role="group" aria-label="Mode akumulasi">
            <button aria-pressed={isCumulative} onClick={() => !isCumulative && onToggleCumulative()} title="Akumulasi dari awal rentang sampai jam ini">Kumulatif</button>
            <button aria-pressed={!isCumulative} onClick={() => isCumulative && onToggleCumulative()} title="Hanya hotspot pada jam ini">Per jam</button>
          </div>
        </div>

        <div className="tl-chart">
          <svg viewBox={`0 0 ${bars.bins} 100`} preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" x2={bars.bins} y1="99.5" y2="99.5" stroke="var(--line-hi)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {bars.out.map((b, i) => {
              if (!b.sum) return null;
              const h = Math.max(3, (b.sum / bars.max) * 96);
              const past = isCumulative ? b.endHour <= offset + bars.per - 1 : Math.floor(offset / bars.per) === i;
              return (
                <rect
                  key={i}
                  x={i + 0.12}
                  y={99 - h}
                  width={0.76}
                  height={h}
                  fill={getColorForDate(b.date, dateColorMap)}
                  opacity={past ? 0.95 : 0.2}
                />
              );
            })}
          </svg>
          <div className="tl-head" style={{ left: `${playheadPct}%` }} />
          <input
            id="timeline-scrub"
            className="tl-scrub"
            type="range"
            min={0}
            max={totalHours}
            value={offset}
            onChange={(e) => setOffset(parseInt(e.target.value, 10))}
            aria-label="Geser waktu"
          />
        </div>

        <div className="tl-axis" aria-hidden="true">
          <span style={{ left: 0 }}>{formatDay(minMs).slice(0, -5)}</span>
          {ticks.map((t, i) => (
            <React.Fragment key={i}>
              <i style={{ left: `${t.pct}%` }} />
              {t.pct > 6 && t.pct < 94 && <span style={{ left: `${t.pct}%` }}>{t.label}</span>}
            </React.Fragment>
          ))}
          <span style={{ right: 0, left: 'auto', transform: 'none' }}>{formatDay(maxMs).slice(0, -5)}</span>
        </div>
      </div>
    </section>
  );
}
