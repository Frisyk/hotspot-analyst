'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Eye } from 'lucide-react';
import Header from '../components/Header';
import FilterPanel from '../components/FilterPanel';
import ViewPanel from '../components/ViewPanel';
import TimeSlider from '../components/TimeSlider';
import Legend from '../components/Legend';
import { generateDateColorMap } from '../utils/colorPalette';
import { dateOfHour, formatInput, parseWall } from '../utils/timeUtils';

// MapLibre/deck.gl butuh WebGL + window: render hanya di klien
const MapView = dynamic(() => import('../components/MapView'), {
  ssr: false,
  loading: () => <div className="map-root" aria-busy="true" />,
});

const EMPTY_SUMMARY = { total: 0, hr0: 0, firms: [], sipongi: [], dateStats: {}, bbox: null };

export default function HomePage() {
  // batas data di database
  const [minTimeBound, setMinTimeBound] = useState(null);
  const [maxTimeBound, setMaxTimeBound] = useState(null);
  const [dbStats, setDbStats] = useState(null);

  // filter yang SUDAH diterapkan (null sampai batas data diketahui)
  const [filter, setFilter] = useState(null);

  // tampilan
  const [activeMapType, setActiveMapType] = useState('dark');
  const [layerMode, setLayerMode] = useState('both'); // 'both' | 'heatmap' | 'points'
  const [glowRadius, setGlowRadius] = useState(16);
  const [glowOpacity, setGlowOpacity] = useState(0.9);
  const [terrain, setTerrain] = useState({ enabled: false, exaggeration: 1.6 });
  const [hideUI, setHideUI] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // timeline
  const [selectedLegendDate, setSelectedLegendDate] = useState(null);
  const [currentTimeCursor, setCurrentTimeCursor] = useState(null);
  const [isCumulative, setIsCumulative] = useState(true);

  // data ringkas (legenda, header, histogram) — titik sendiri diambil MapView
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [mapLoading, setMapLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ---------- peta penuh / fullscreen ----------
  const handleToggleHideUI = useCallback(() => {
    setHideUI((prev) => {
      const next = !prev;
      if (next) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setHideUI(false); };
    const onKey = (e) => { if (e.key === 'Escape') setHideUI(false); };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // ---------- ringkasan untuk filter ----------
  const fetchSummary = useCallback(async (f) => {
    setSummaryLoading(true);
    try {
      const p = new URLSearchParams();
      if (f.start) p.set('start', f.start);
      if (f.end) p.set('end', f.end);
      if (f.source && f.source !== 'all') p.set('source', f.source);
      const res = await fetch(`/api/hotspots/summary?${p.toString()}`);
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch (err) {
      console.error('Gagal memuat ringkasan:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const applyFilter = useCallback((f) => {
    setFilter(f);
    setCurrentTimeCursor(f.end ? `${f.end.replace('T', ' ')}:00` : null);
    setSelectedLegendDate(null);
    fetchSummary(f);
  }, [fetchSummary]);

  // ---------- awal: batas DB -> default 2 hari terakhir ----------
  useEffect(() => {
    (async () => {
      let minB = '2024-01-01T00:00';
      let maxB = '2026-10-23T23:59';
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setDbStats(data);
        if (data?.min_time && data?.max_time) {
          minB = data.min_time.slice(0, 16);
          maxB = data.max_time.slice(0, 16);
        }
      } catch (err) {
        console.error('Gagal memuat statistik DB:', err);
      }
      setMinTimeBound(minB);
      setMaxTimeBound(maxB);
      const endMs = parseWall(maxB);
      const startDay = new Date(endMs - 2 * 86400000);
      startDay.setUTCHours(0, 0, 0, 0);
      applyFilter({ start: formatInput(startDay.getTime()), end: maxB, source: 'all' });
    })();
  }, [applyFilter]);

  // ---------- warna per tanggal ----------
  const uniqueDates = useMemo(() => Object.keys(summary.dateStats || {}).sort(), [summary.dateStats]);
  const dateColorMap = useMemo(() => generateDateColorMap(uniqueDates), [uniqueDates]);

  // ---------- jumlah ditampilkan = dari ringkasan per jam, mengikuti kursor (tanpa menghitung titik) ----------
  const stats = useMemo(() => {
    const { hr0, firms, sipongi } = summary;
    if (!firms.length || !currentTimeCursor) return { shown: 0, firms: 0, sipongi: 0 };
    const curHr = Math.floor(parseWall(currentTimeCursor) / 3600000);
    let f = 0;
    let s = 0;
    for (let i = 0; i < firms.length; i++) {
      const hr = hr0 + i;
      if (hr > curHr) break;
      if (!isCumulative && hr !== curHr) continue;
      if (selectedLegendDate && dateOfHour(hr) !== selectedLegendDate) continue;
      f += firms[i];
      s += sipongi[i];
    }
    return { shown: f + s, firms: f, sipongi: s };
  }, [summary, currentTimeCursor, isCumulative, selectedLegendDate]);

  const hourly = useMemo(() => {
    if (!summary.firms.length) return null;
    return { hr0: summary.hr0, total: summary.firms.map((v, i) => v + summary.sipongi[i]) };
  }, [summary]);

  const toggleTerrain = useCallback(() => setTerrain((t) => ({ ...t, enabled: !t.enabled })), []);

  return (
    <main
      className={`app${hideUI ? ' full' : ''}`}
      style={{ '--dock-w': hideUI ? '0px' : dockCollapsed ? '44px' : '312px' }}
    >
      <MapView
        filter={filter}
        cursor={currentTimeCursor}
        isCumulative={isCumulative}
        selectedDate={selectedLegendDate}
        dateColorMap={dateColorMap}
        activeMapType={activeMapType}
        layerMode={layerMode}
        glowRadius={glowRadius}
        glowOpacity={glowOpacity}
        terrain={terrain}
        bbox={summary.bbox}
        hideUI={hideUI}
        onToggleTerrain={toggleTerrain}
        onLoadingChange={setMapLoading}
      />

      {hideUI && (
        <button id="btn-restore-ui" className="btn restore" onClick={handleToggleHideUI} title="Tampilkan kembali panel (Esc)">
          <Eye size={14} /> Tampilkan panel
        </button>
      )}

      {!hideUI && (
        <>
          <Header
            shown={stats.shown}
            firms={stats.firms}
            sipongi={stats.sipongi}
            dbTotal={dbStats?.total ?? null}
            activeMapType={activeMapType}
            onSelectMapType={setActiveMapType}
            layerMode={layerMode}
            onSelectLayerMode={setLayerMode}
            onToggleHideUI={handleToggleHideUI}
          />

          <FilterPanel
            startTime={filter?.start}
            endTime={filter?.end}
            source={filter?.source}
            onApplyFilter={applyFilter}
            isLoading={mapLoading || summaryLoading}
            minTimeBound={minTimeBound}
            maxTimeBound={maxTimeBound}
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            resultTotal={filter ? summary.total : null}
          >
            <ViewPanel
              glowRadius={glowRadius}
              onGlowRadius={setGlowRadius}
              glowOpacity={glowOpacity}
              onGlowOpacity={setGlowOpacity}
              terrain={terrain}
              onTerrainChange={setTerrain}
              layerMode={layerMode}
            />
          </FilterPanel>

          {filter && (
            <TimeSlider
              minTime={filter.start}
              maxTime={filter.end}
              currentTime={currentTimeCursor}
              onTimeChange={setCurrentTimeCursor}
              isCumulative={isCumulative}
              onToggleCumulative={() => setIsCumulative((v) => !v)}
              hourly={hourly}
              dateColorMap={dateColorMap}
            />
          )}

          <Legend
            dateColorMap={dateColorMap}
            dateStats={summary.dateStats}
            selectedDate={selectedLegendDate}
            onSelectDate={setSelectedLegendDate}
          />
        </>
      )}
    </main>
  );
}
