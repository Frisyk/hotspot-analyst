'use client';

import React from 'react';
import { Calendar, Check, Filter } from 'lucide-react';
import { hexToRgba } from '../utils/colorPalette';

export default function Legend({
  dateColorMap = {},
  dateStats = {},
  selectedDate = null,
  onSelectDate,
}) {
  const dates = Object.keys(dateStats).sort();

  if (dates.length === 0) {
    return null;
  }

  return (
    <div style={styles.legendContainer} className="glass-panel">
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <Calendar size={14} color="#f97316" />
          <span>Legenda Tanggal & Warna</span>
        </div>
        {selectedDate && (
          <button
            onClick={() => onSelectDate(null)}
            style={styles.clearFilterBtn}
            title="Tampilkan semua tanggal"
          >
            Reset
          </button>
        )}
      </div>

      <div style={styles.list}>
        {dates.map((dateStr) => {
          const color = dateColorMap[dateStr] || '#FF4500';
          const count = dateStats[dateStr] || 0;
          const isSelected = selectedDate === dateStr;

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              style={{
                ...styles.item,
                background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                borderColor: isSelected ? color : 'transparent',
              }}
              title={`Klik untuk filter tanggal ${dateStr}`}
            >
              <div style={styles.swatchWrapper}>
                <div
                  style={{
                    ...styles.swatchGlow,
                    backgroundColor: hexToRgba(color, 0.4),
                  }}
                />
                <div
                  style={{
                    ...styles.swatchInner,
                    backgroundColor: color,
                  }}
                />
              </div>

              <div style={styles.itemInfo}>
                <span style={styles.dateLabel}>{dateStr}</span>
                <span style={styles.countBadge}>{count} titik</span>
              </div>

              {isSelected && (
                <div style={{ ...styles.checkBadge, color }}>
                  <Check size={12} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.footerNote}>
        Titik diberi warna berbeda sesuai tanggal kejadian untuk memudahkan tracking kronologis.
      </div>
    </div>
  );
}

const styles = {
  legendContainer: {
    position: 'absolute',
    bottom: '24px',
    right: '20px',
    zIndex: 90,
    width: '240px',
    maxHeight: '340px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#e2e8f0',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  clearFilterBtn: {
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#fca5a5',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflowY: 'auto',
    maxHeight: '220px',
    paddingRight: '4px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 8px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  swatchWrapper: {
    position: 'relative',
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchGlow: {
    position: 'absolute',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    filter: 'blur(2px)',
  },
  swatchInner: {
    position: 'relative',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    border: '1.5px solid #ffffff',
  },
  itemInfo: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#f1f5f9',
    fontFamily: 'var(--font-mono)',
  },
  countBadge: {
    fontSize: '11px',
    color: '#94a3b8',
    background: 'rgba(255, 255, 255, 0.06)',
    padding: '1px 6px',
    borderRadius: '4px',
  },
  checkBadge: {
    display: 'flex',
    alignItems: 'center',
  },
  footerNote: {
    fontSize: '10px',
    color: '#64748b',
    lineHeight: '1.4',
    paddingTop: '6px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
};
