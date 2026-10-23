'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Layers, ChevronDown, Check, Mountain, X, Sparkles } from 'lucide-react';
import { BASEMAPS, getBasemapConfig } from '../utils/basemaps';

export default function BasemapSelector({
  activeMapType = 'dark',
  onSelectMapType,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const dropdownRef = useRef(null);

  const currentBasemap = getBasemapConfig(activeMapType);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Categories definition
  const categories = [
    { id: 'all', label: 'Semua', count: BASEMAPS.length },
    {
      id: '3d',
      label: '🏔️ 3D & Relief',
      count: BASEMAPS.filter((b) => b.is3D).length,
    },
    {
      id: 'satellite',
      label: '🛰️ Satelit',
      count: BASEMAPS.filter((b) => b.category === 'satellite').length,
    },
    {
      id: 'streets_topo',
      label: '🗺️ Jalan & Topo',
      count: BASEMAPS.filter((b) => b.category === 'streets' || b.category === 'topo').length,
    },
    {
      id: 'monochrome',
      label: '🌙 Gelap / Terang',
      count: BASEMAPS.filter((b) => b.category === 'monochrome').length,
    },
  ];

  // Filtered basemaps based on selected category tab
  const filteredBasemaps = BASEMAPS.filter((b) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === '3d') return b.is3D;
    if (activeCategory === 'satellite') return b.category === 'satellite';
    if (activeCategory === 'streets_topo') return b.category === 'streets' || b.category === 'topo';
    if (activeCategory === 'monochrome') return b.category === 'monochrome';
    return true;
  });

  const handleSelect = (id) => {
    if (onSelectMapType) {
      onSelectMapType(id);
    }
    setIsOpen(false);
  };

  return (
    <div style={styles.container} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        id="btn-basemap-dropdown"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...styles.triggerBtn,
          borderColor: isOpen ? '#ff4500' : 'rgba(255, 255, 255, 0.12)',
          boxShadow: isOpen ? '0 0 14px rgba(255, 69, 0, 0.35)' : 'none',
        }}
        title="Ganti Basemap / Peta 3D Relief"
      >
        <div style={styles.thumbnailWrapper}>
          <img
            src={currentBasemap.thumbnail}
            alt={currentBasemap.name}
            style={styles.thumbnailMini}
          />
        </div>

        <div style={styles.triggerInfo}>
          <span style={styles.triggerLabel}>Peta:</span>
          <span style={styles.triggerName}>{currentBasemap.name}</span>
          {currentBasemap.is3D && (
            <span style={styles.badge3D}>
              <Mountain size={10} /> 3D
            </span>
          )}
        </div>

        <ChevronDown
          size={13}
          color="#94a3b8"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div style={styles.popover} className="glass-panel">
          {/* Popover Header */}
          <div style={styles.popoverHeader}>
            <div style={styles.headerTitleRow}>
              <div style={styles.headerIcon}>
                <Layers size={14} color="#ff4500" />
              </div>
              <span style={styles.headerTitle}>Pilih Basemap & Elevation 3D</span>
              <span style={styles.countBadge}>{BASEMAPS.length} Opsi</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={styles.closeBtn}
              title="Tutup"
            >
              <X size={14} />
            </button>
          </div>

          {/* Category Tabs */}
          <div style={styles.categoryTabs}>
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    ...styles.tabBtn,
                    background: isActive ? 'linear-gradient(135deg, #ff4500, #ff7a00)' : 'rgba(255, 255, 255, 0.05)',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    borderColor: isActive ? '#ff4500' : 'rgba(255, 255, 255, 0.08)',
                    boxShadow: isActive ? '0 0 10px rgba(255, 69, 0, 0.4)' : 'none',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Grid of Basemaps */}
          <div style={styles.grid}>
            {filteredBasemaps.map((b) => {
              const isSelected =
                activeMapType === b.id ||
                (b.id === 'dark' && activeMapType === 'hitam') ||
                (b.id === 'opentopomap' && activeMapType === 'topografi');

              return (
                <div
                  key={b.id}
                  id={`basemap-option-${b.id}`}
                  onClick={() => handleSelect(b.id)}
                  style={{
                    ...styles.card,
                    borderColor: isSelected ? '#ff4500' : 'rgba(255, 255, 255, 0.1)',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(255, 69, 0, 0.18), rgba(15, 23, 42, 0.95))'
                      : 'rgba(15, 23, 42, 0.75)',
                    boxShadow: isSelected ? '0 0 16px rgba(255, 69, 0, 0.35)' : 'none',
                  }}
                  title={b.name}
                >
                  <div style={styles.cardThumbContainer}>
                    <img
                      src={b.thumbnail}
                      alt={b.name}
                      style={styles.cardThumbImg}
                      loading="lazy"
                    />
                    {b.is3D && (
                      <div style={styles.card3DBadge}>
                        <Mountain size={9} /> 3D Relief
                      </div>
                    )}
                    {isSelected && (
                      <div style={styles.activeCheckmark}>
                        <Check size={12} color="#ffffff" strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  <div style={styles.cardDetails}>
                    <div style={styles.cardTitleRow}>
                      <span
                        style={{
                          ...styles.cardTitle,
                          color: isSelected ? '#ff9f43' : '#f8fafc',
                        }}
                      >
                        {b.name}
                      </span>
                    </div>
                    <span style={styles.cardAttr}>
                      {b.attributions ? b.attributions.replace(/<[^>]+>/g, '').slice(0, 32) : 'Tile Layer'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer tip */}
          <div style={styles.popoverFooter}>
            <Sparkles size={11} color="#ff4500" />
            <span>Peta 3D (Google Terrain, OpenTopo, Esri Hillshade) menampilkan kontur elevasi bumi.</span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  triggerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px 4px 6px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    cursor: 'pointer',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: '600',
    transition: 'all 0.15s ease',
  },
  thumbnailWrapper: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    flexShrink: 0,
  },
  thumbnailMini: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  triggerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  triggerLabel: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  triggerName: {
    color: '#f8fafc',
    fontSize: '11px',
    fontWeight: '700',
    maxWidth: '120px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  badge3D: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '9px',
    fontWeight: '800',
    padding: '1px 5px',
    borderRadius: '4px',
    background: 'linear-gradient(135deg, #ff4500, #ff8c00)',
    color: '#ffffff',
    boxShadow: '0 0 6px rgba(255, 69, 0, 0.6)',
  },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: '380px',
    maxHeight: '520px',
    background: 'rgba(11, 15, 25, 0.96)',
    backdropFilter: 'blur(20px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 69, 0, 0.15)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'fadeIn 0.15s ease',
  },
  popoverHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    background: 'rgba(255, 69, 0, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  countBadge: {
    fontSize: '10px',
    color: '#94a3b8',
    background: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTabs: {
    display: 'flex',
    gap: '4px',
    padding: '8px 12px',
    overflowX: 'auto',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tabBtn: {
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    padding: '12px',
    overflowY: 'auto',
    maxHeight: '340px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '8px',
    border: '1px solid',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'all 0.15s ease',
  },
  cardThumbContainer: {
    position: 'relative',
    width: '100%',
    height: '64px',
    background: '#1e293b',
    overflow: 'hidden',
  },
  cardThumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transition: 'transform 0.25s ease',
  },
  card3DBadge: {
    position: 'absolute',
    top: '4px',
    left: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    background: 'rgba(255, 69, 0, 0.9)',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: '800',
    padding: '2px 5px',
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
  },
  activeCheckmark: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#ff4500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
  },
  cardDetails: {
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: '11px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardAttr: {
    fontSize: '9px',
    color: '#64748b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  popoverFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    background: 'rgba(0, 0, 0, 0.2)',
    fontSize: '10px',
    color: '#94a3b8',
  },
};
