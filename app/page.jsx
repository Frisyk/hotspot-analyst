'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import MapView from '../components/MapView';
import FilterPanel from '../components/FilterPanel';
import TimeSlider from '../components/TimeSlider';
import Legend from '../components/Legend';
import { Eye } from 'lucide-react';
import { generateDateColorMap } from '../utils/colorPalette';

export default function HomePage() {
  // Database stats bounds
  const [minTimeBound, setMinTimeBound] = useState('2024-01-01T00:00');
  const [maxTimeBound, setMaxTimeBound] = useState('2026-10-23T23:59');
  const [dbStats, setDbStats] = useState(null);

  // Active filter states - default to latest October 2026 data
  const [startTime, setStartTime] = useState('2026-10-22T00:00');
  const [endTime, setEndTime] = useState('2026-10-23T23:59');
  const [source, setSource] = useState('all');

  // Interactive UI states (osm, hitam, topografi)
  const [activeMapType, setActiveMapType] = useState('hitam');
  // Visual layer mode: 'both' (Gabungan), 'heatmap' (Densitas), 'points' (Titik Api)
  const [layerMode, setLayerMode] = useState('both');
  // Hide UI / Clean full screen map mode
  const [hideUI, setHideUI] = useState(false);
  const [selectedLegendDate, setSelectedLegendDate] = useState(null);
  const [currentTimeCursor, setCurrentTimeCursor] = useState('2026-10-23 23:59:00');
  const [isCumulative, setIsCumulative] = useState(true);

  // Toggle clean full screen map mode
  const handleToggleHideUI = useCallback(() => {
    setHideUI((prev) => {
      const next = !prev;
      if (next) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  // Listen to fullscreen changes and Escape key
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setHideUI(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setHideUI(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Data states
  const [rawHotspots, setRawHotspots] = useState([]);
  const [dateStats, setDateStats] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // 2. Fetch Hotspots from API
  const fetchHotspots = useCallback(async (start, end, src) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      if (src && src !== 'all') params.set('source', src);

      const res = await fetch(`/api/hotspots?${params.toString()}`);
      const data = await res.json();

      if (data && data.features) {
        setRawHotspots(data.features);
        setDateStats(data.metadata?.dateStats || {});
      }
    } catch (err) {
      console.error('Failed to fetch hotspots:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 1. Fetch initial DB bounds and load recent 2026 data
  useEffect(() => {
    async function fetchBounds() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setDbStats(data);
        if (data && data.min_time && data.max_time) {
          setMinTimeBound(data.min_time);
          setMaxTimeBound(data.max_time);

          // Default ke 2 hari data terbaru (Oktober 2026)
          const endIso = data.max_time.slice(0, 16);
          const [dPart] = endIso.split('T');
          const [y, m, d] = dPart.split('-').map(Number);
          const maxDate = new Date(y, m - 1, d);
          const prevDate = new Date(maxDate.getTime() - 2 * 24 * 60 * 60 * 1000);
          
          const pad = (n) => String(n).padStart(2, '0');
          const startIso = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}T00:00`;

          setStartTime(startIso);
          setEndTime(endIso);
          setCurrentTimeCursor(endIso.replace('T', ' ') + ':00');
          fetchHotspots(startIso, endIso, 'all');
        } else {
          fetchHotspots('2026-10-22T00:00', '2026-10-23T23:59', 'all');
        }
      } catch (err) {
        console.error('Failed to load DB stats:', err);
        fetchHotspots('2026-10-22T00:00', '2026-10-23T23:59', 'all');
      }
    }
    fetchBounds();
  }, [fetchHotspots]);

  // Handle filter submission from FilterPanel
  const handleApplyFilter = ({ start, end, source: newSource }) => {
    setStartTime(start);
    setEndTime(end);
    setSource(newSource);
    setCurrentTimeCursor(end ? end.replace('T', ' ') + ':00' : null);
    fetchHotspots(start, end, newSource);
  };

  // Toggle base map type
  const handleToggleMapType = () => {
    const types = ['dark', 'satellite', 'osm'];
    const nextIdx = (types.indexOf(activeMapType) + 1) % types.length;
    setActiveMapType(types[nextIdx]);
  };

  // 3. Generate dynamic colors per unique date
  const uniqueDates = useMemo(() => {
    return Object.keys(dateStats).sort();
  }, [dateStats]);

  const dateColorMap = useMemo(() => {
    return generateDateColorMap(uniqueDates);
  }, [uniqueDates]);

  // 4. Filter hotspots for display (considering timeline cursor and legend filter)
  const displayedHotspots = useMemo(() => {
    return rawHotspots.filter((h) => {
      const props = h.properties || {};

      // Filter by selected legend date (if user clicked a date in the legend)
      if (selectedLegendDate && props.date !== selectedLegendDate) {
        return false;
      }

      // Filter by animation/timeline cursor (hour precision)
      if (currentTimeCursor) {
        const itemTime = props.datetm_loc;
        if (!itemTime) return true;

        if (isCumulative) {
          // Cumulative: points occurred up to current cursor time
          return itemTime <= currentTimeCursor;
        } else {
          // Window mode: points within the same hour
          const cursorHour = currentTimeCursor.slice(0, 13); // 'YYYY-MM-DD HH'
          const itemHour = itemTime.slice(0, 13);
          return itemHour === cursorHour;
        }
      }

      return true;
    });
  }, [rawHotspots, selectedLegendDate, currentTimeCursor, isCumulative]);

  // Counts by source
  const firmsCount = useMemo(() => {
    return displayedHotspots.filter((h) => h.properties?.source === 'firms').length;
  }, [displayedHotspots]);

  const sipongiCount = useMemo(() => {
    return displayedHotspots.filter((h) => h.properties?.source === 'sipongi').length;
  }, [displayedHotspots]);

  return (
    <main style={styles.main}>
      {/* Floating Restore UI Button (saat mode Peta Penuh / hideUI) */}
      {hideUI && (
        <button
          id="btn-restore-ui"
          onClick={handleToggleHideUI}
          style={styles.restoreUiBtn}
          className="glass-panel"
          title="Tampilkan Kembali Semua Panel (Esc)"
        >
          <Eye size={15} color="#ff4500" />
          <span>Tampilkan Panel Antarmuka</span>
        </button>
      )}

      {/* Top Header with Layer Mode Selector & Fullscreen Toggle */}
      {!hideUI && (
        <Header
          totalHotspots={displayedHotspots.length}
          firmsCount={firmsCount}
          sipongiCount={sipongiCount}
          activeMapType={activeMapType}
          onSelectMapType={setActiveMapType}
          layerMode={layerMode}
          onSelectLayerMode={setLayerMode}
          onToggleHideUI={handleToggleHideUI}
          dbStats={dbStats}
        />
      )}

      {/* Main OpenLayers Map Canvas with Heatmap Density Layer */}
      <MapView
        hotspots={displayedHotspots}
        dateColorMap={dateColorMap}
        activeMapType={activeMapType}
        layerMode={layerMode}
        onSelectLayerMode={setLayerMode}
        hideUI={hideUI}
      />

      {/* Left Filter Panel (Date & Hour Filter) */}
      {!hideUI && (
        <FilterPanel
          startTime={startTime}
          endTime={endTime}
          source={source}
          onApplyFilter={handleApplyFilter}
          isLoading={isLoading}
          minTimeBound={minTimeBound}
          maxTimeBound={maxTimeBound}
        />
      )}

      {/* Bottom Timeline Animation Slider */}
      {!hideUI && (
        <TimeSlider
          minTime={startTime || minTimeBound}
          maxTime={endTime || maxTimeBound}
          currentTime={currentTimeCursor}
          onTimeChange={setCurrentTimeCursor}
          isCumulative={isCumulative}
          onToggleCumulative={() => setIsCumulative(!isCumulative)}
        />
      )}

      {/* Bottom-Right Date & Color Legend + Density Scale */}
      {!hideUI && (
        <Legend
          dateColorMap={dateColorMap}
          dateStats={dateStats}
          selectedDate={selectedLegendDate}
          onSelectDate={setSelectedLegendDate}
          layerMode={layerMode}
        />
      )}
    </main>
  );
}

const styles = {
  main: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#0b0f19',
  },
  restoreUiBtn: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '30px',
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 69, 0, 0.35)',
    border: '1px solid rgba(255, 69, 0, 0.5)',
    background: 'rgba(15, 23, 42, 0.92)',
    backdropFilter: 'blur(16px)',
    transition: 'all 0.2s ease',
  },
};
