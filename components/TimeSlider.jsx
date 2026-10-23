'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, FastForward, Clock } from 'lucide-react';

function parseLocalDate(str) {
  if (!str) return new Date();
  const clean = String(str).replace('T', ' ');
  const [datePart, timePart = '00:00:00'] = clean.split(' ');
  const [y, m, d] = (datePart || '2026-10-23').split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

function formatLocalYMDHMS(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export default function TimeSlider({
  minTime,
  maxTime,
  currentTime,
  onTimeChange,
  isCumulative = true,
  onToggleCumulative,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x
  const intervalRef = useRef(null);

  // Compute total hours between min and max
  const minDate = minTime ? parseLocalDate(minTime) : parseLocalDate('2026-10-21 00:00:00');
  const maxDate = maxTime ? parseLocalDate(maxTime) : parseLocalDate('2026-10-23 23:59:59');

  const totalHours = Math.max(
    1,
    Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60))
  );

  const curDate = currentTime ? parseLocalDate(currentTime) : maxDate;
  const currentHourOffset = Math.min(
    totalHours,
    Math.max(0, Math.round((curDate.getTime() - minDate.getTime()) / (1000 * 60 * 60)))
  );

  const handleSliderChange = (e) => {
    const hours = parseInt(e.target.value, 10);
    const target = new Date(minDate.getTime() + hours * 60 * 60 * 1000);
    onTimeChange(formatLocalYMDHMS(target));
  };

  // Animation loop
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        const nextHour = (currentHourOffset + 1);
        if (nextHour > totalHours) {
          // Loop back to start
          const target = new Date(minDate.getTime());
          onTimeChange(formatLocalYMDHMS(target));
        } else {
          const target = new Date(minDate.getTime() + nextHour * 60 * 60 * 1000);
          onTimeChange(formatLocalYMDHMS(target));
        }
      }, 1000 / speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentHourOffset, totalHours, speed, minDate]);

  const togglePlay = () => {
    if (!isPlaying && currentHourOffset >= totalHours) {
      onTimeChange(formatLocalYMDHMS(minDate));
    }
    setIsPlaying(!isPlaying);
  };

  const stepBack = () => {
    const prev = Math.max(0, currentHourOffset - 1);
    const target = new Date(minDate.getTime() + prev * 60 * 60 * 1000);
    onTimeChange(formatLocalYMDHMS(target));
  };

  const stepForward = () => {
    const next = Math.min(totalHours, currentHourOffset + 1);
    const target = new Date(minDate.getTime() + next * 60 * 60 * 1000);
    onTimeChange(formatLocalYMDHMS(target));
  };

  const formatDisplayTime = (d) => {
    const date = new Date(d);
    return date.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.container} className="glass-panel">
      <div style={styles.topRow}>
        <div style={styles.playControls}>
          <button onClick={stepBack} style={styles.controlBtn} title="Mundur 1 Jam">
            <SkipBack size={15} />
          </button>
          <button
            onClick={togglePlay}
            style={styles.playBtn}
            title={isPlaying ? 'Jeda Animasi' : 'Putar Animasi Per Jam'}
          >
            {isPlaying ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: '2px' }} />}
          </button>
          <button onClick={stepForward} style={styles.controlBtn} title="Maju 1 Jam">
            <SkipForward size={15} />
          </button>

          <button
            onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1)}
            style={styles.speedBtn}
            title="Ubah Kecepatan Animasi"
          >
            <FastForward size={13} />
            <span>{speed}x</span>
          </button>
        </div>

        <div style={styles.timeDisplay}>
          <Clock size={14} color="#f97316" />
          <span style={styles.timeText}>{formatDisplayTime(curDate)} WIB</span>
        </div>

        <div style={styles.modeToggle}>
          <button
            onClick={onToggleCumulative}
            style={{
              ...styles.modeBtn,
              background: isCumulative ? 'rgba(255, 69, 0, 0.25)' : 'transparent',
              borderColor: isCumulative ? '#ff4500' : 'rgba(255, 255, 255, 0.1)',
            }}
            title="Akumulasi titik api dari waktu awal hingga jam ini"
          >
            {isCumulative ? 'Kumulatif (Sampai Jam Ini)' : 'Hanya Jam Ini'}
          </button>
        </div>
      </div>

      <div style={styles.sliderRow}>
        <span style={styles.boundLabel}>{formatDisplayTime(minDate).split(',')[0]}</span>
        <input
          type="range"
          min={0}
          max={totalHours}
          value={currentHourOffset}
          onChange={handleSliderChange}
          style={styles.slider}
        />
        <span style={styles.boundLabel}>{formatDisplayTime(maxDate).split(',')[0]}</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 90,
    width: 'min(700px, calc(100% - 300px))',
    padding: '12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  playControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  controlBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  playBtn: {
    background: 'linear-gradient(135deg, #ff4500, #ff8c00)',
    border: 'none',
    color: '#ffffff',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(255, 69, 0, 0.5)',
    transition: 'all 0.2s ease',
  },
  speedBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
  },
  timeDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(15, 23, 42, 0.8)',
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  timeText: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#f8fafc',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '-0.01em',
  },
  modeToggle: {
    display: 'flex',
  },
  modeBtn: {
    border: '1px solid',
    color: '#f1f5f9',
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  boundLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap',
  },
  slider: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.15)',
    outline: 'none',
    cursor: 'pointer',
    accentColor: '#ff4500',
  },
};
