'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import MapView from '../components/MapView';
import FilterPanel from '../components/FilterPanel';
import TimeSlider from '../components/TimeSlider';
import Legend from '../components/Legend';
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
  const [selectedLegendDate, setSelectedLegendDate] = useState(null);
  const [currentTimeCursor, setCurrentTimeCursor] = useState('2026-10-23 23:59:00');
  const [isCumulative, setIsCumulative] = useState(true);

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
      {/* Top Header */}
      <Header
        totalHotspots={displayedHotspots.length}
        firmsCount={firmsCount}
        sipongiCount={sipongiCount}
        activeMapType={activeMapType}
        onSelectMapType={setActiveMapType}
        dbStats={dbStats}
      />

      {/* Main OpenLayers Map Canvas */}
      <MapView
        hotspots={displayedHotspots}
        dateColorMap={dateColorMap}
        activeMapType={activeMapType}
      />

      {/* Left Filter Panel (Date & Hour Filter) */}
      <FilterPanel
        startTime={startTime}
        endTime={endTime}
        source={source}
        onApplyFilter={handleApplyFilter}
        isLoading={isLoading}
        minTimeBound={minTimeBound}
        maxTimeBound={maxTimeBound}
      />

      {/* Bottom Timeline Animation Slider */}
      <TimeSlider
        minTime={startTime || minTimeBound}
        maxTime={endTime || maxTimeBound}
        currentTime={currentTimeCursor}
        onTimeChange={setCurrentTimeCursor}
        isCumulative={isCumulative}
        onToggleCumulative={() => setIsCumulative(!isCumulative)}
      />

      {/* Bottom-Right Date & Color Legend */}
      <Legend
        dateColorMap={dateColorMap}
        dateStats={dateStats}
        selectedDate={selectedLegendDate}
        onSelectDate={setSelectedLegendDate}
      />
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
};
