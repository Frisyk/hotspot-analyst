'use client';

import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import Overlay from 'ol/Overlay';
import { Maximize2, Flame, MapPin, Eye } from 'lucide-react';
import { hexToRgba, getColorForDate } from '../utils/colorPalette';

const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY || 'cb1_4rl4_1_b877170eaa644026e39b00c0';

const BASE_MAP_URLS = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  hitam: {
    url: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  topografi: {
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17,
  },
};

export default function MapView({
  hotspots = [],
  dateColorMap = {},
  activeMapType = 'dark',
  onSelectHotspot,
}) {
  const mapElementRef = useRef(null);
  const popupElementRef = useRef(null);
  const mapRef = useRef(null);
  const vectorSourceRef = useRef(null);
  const baseLayerRef = useRef(null);
  const popupOverlayRef = useRef(null);

  const [hoveredFeature, setHoveredFeature] = useState(null);

  // Initialize Map
  useEffect(() => {
    if (!mapElementRef.current) return;

    // 1. Vector source for fire points
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    // 2. Vector layer with style function
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        const dateStr = feature.get('date');
        const color = getColorForDate(dateStr, dateColorMap);

        return [
          // Outer glow circle
          new Style({
            image: new CircleStyle({
              radius: 9,
              fill: new Fill({
                color: hexToRgba(color, 0.35),
              }),
            }),
          }),
          // Inner core hotspot point
          new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color }),
              stroke: new Stroke({
                color: '#ffffff',
                width: 1.5,
              }),
            }),
          }),
        ];
      },
    });

    // 3. Base tile layer (OSM, Hitam, Topografi)
    const initKey = activeMapType === 'dark' ? 'hitam' : (activeMapType || 'hitam');
    const baseLayer = new TileLayer({
      source: new XYZ(BASE_MAP_URLS[initKey] || BASE_MAP_URLS.hitam),
    });
    baseLayerRef.current = baseLayer;

    // 4. Popup Overlay
    const popupOverlay = new Overlay({
      element: popupElementRef.current,
      positioning: 'bottom-center',
      stopEvent: false,
      offset: [0, -10],
    });
    popupOverlayRef.current = popupOverlay;

    // 5. Create Map centered on Kalimantan
    const map = new Map({
      target: mapElementRef.current,
      layers: [baseLayer, vectorLayer],
      overlays: [popupOverlay],
      view: new View({
        center: fromLonLat([114.0, 0.0]), // Center of Kalimantan
        zoom: 6,
        minZoom: 4,
        maxZoom: 18,
      }),
      controls: [], // default controls handled cleanly
    });

    // Hover tooltip interaction
    map.on('pointermove', (evt) => {
      if (evt.dragging) {
        popupOverlay.setPosition(undefined);
        return;
      }

      const pixel = map.getEventPixel(evt.originalEvent);
      const hit = map.forEachFeatureAtPixel(pixel, (feature) => feature);

      if (hit) {
        const coordinates = hit.getGeometry().getCoordinates();
        popupOverlay.setPosition(coordinates);
        setHoveredFeature(hit.getProperties());
        map.getTargetElement().style.cursor = 'pointer';
      } else {
        popupOverlay.setPosition(undefined);
        setHoveredFeature(null);
        map.getTargetElement().style.cursor = '';
      }
    });

    // Click handler
    map.on('singleclick', (evt) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (feature) => feature);
      if (hit && onSelectHotspot) {
        onSelectHotspot(hit.getProperties());
      }
    });

    mapRef.current = map;

    return () => {
      map.setTarget(null);
    };
  }, []);

  // Update Base Layer when activeMapType changes (osm, hitam, topografi)
  useEffect(() => {
    if (!baseLayerRef.current) return;
    const key = activeMapType === 'dark' ? 'hitam' : (activeMapType || 'hitam');
    const cfg = BASE_MAP_URLS[key] || BASE_MAP_URLS.hitam;
    baseLayerRef.current.setSource(new XYZ(cfg));
  }, [activeMapType]);

  // Update Hotspot Points
  useEffect(() => {
    if (!vectorSourceRef.current) return;

    const source = vectorSourceRef.current;
    source.clear();

    if (!hotspots || hotspots.length === 0) return;

    const features = [];
    hotspots.forEach((h) => {
      const lon = h.geometry?.coordinates?.[0] ?? h.properties?.longitude;
      const lat = h.geometry?.coordinates?.[1] ?? h.properties?.latitude;

      if (lon !== undefined && lat !== undefined && !isNaN(lon) && !isNaN(lat)) {
        const feature = new Feature({
          geometry: new Point(fromLonLat([parseFloat(lon), parseFloat(lat)])),
          ...h.properties,
        });
        features.push(feature);
      }
    });

    source.addFeatures(features);
  }, [hotspots, dateColorMap]);

  // Fit to features helper
  const handleFitExtent = () => {
    if (!mapRef.current || !vectorSourceRef.current) return;
    const extent = vectorSourceRef.current.getExtent();
    if (extent && isFinite(extent[0])) {
      mapRef.current.getView().fit(extent, {
        padding: [100, 100, 100, 100],
        duration: 800,
        maxZoom: 13,
      });
    } else {
      // Fallback reset to Kalimantan
      mapRef.current.getView().animate({
        center: fromLonLat([114.0, 0.0]),
        zoom: 6,
        duration: 800,
      });
    }
  };

  return (
    <div style={styles.container}>
      {/* Map Target Element */}
      <div ref={mapElementRef} style={styles.mapElement} />

      {/* Floating Map Controls */}
      <div style={styles.mapControls}>
        <button
          onClick={handleFitExtent}
          style={styles.fitBtn}
          title="Fokuskan Peta ke Seluruh Titik Api"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Hover / Click Popup Tooltip Overlay */}
      <div ref={popupElementRef} className="ol-popup">
        {hoveredFeature && (
          <div style={styles.popupContent}>
            <div style={styles.popupHeader}>
              <div
                style={{
                  ...styles.sourceBadge,
                  backgroundColor:
                    hoveredFeature.source === 'firms' ? 'rgba(255, 159, 26, 0.2)' : 'rgba(0, 240, 255, 0.2)',
                  borderColor:
                    hoveredFeature.source === 'firms' ? '#FF9F1A' : '#00F0FF',
                  color:
                    hoveredFeature.source === 'firms' ? '#FFB042' : '#38E1FF',
                }}
              >
                <Flame size={11} />
                <span>{hoveredFeature.sensor ? `${hoveredFeature.source?.toUpperCase()} (${hoveredFeature.sensor})` : hoveredFeature.source?.toUpperCase()}</span>
              </div>
              <span style={styles.popupTime}>
                {hoveredFeature.datetm_loc?.split(' ')[1]?.slice(0, 5)} WIB
              </span>
            </div>

            <div style={styles.popupBody}>
              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Tanggal:</span>
                <span
                  style={{
                    ...styles.popupVal,
                    color: getColorForDate(hoveredFeature.date, dateColorMap),
                    fontWeight: '700',
                  }}
                >
                  {hoveredFeature.date}
                </span>
              </div>

              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Koordinat:</span>
                <span style={styles.popupVal}>
                  {Number(hoveredFeature.latitude).toFixed(4)}, {Number(hoveredFeature.longitude).toFixed(4)}
                </span>
              </div>

              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Keyakinan:</span>
                <span style={styles.popupVal}>{hoveredFeature.confidence || '-'}</span>
              </div>

              {hoveredFeature.brightness > 0 && (
                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>Kecerahan:</span>
                  <span style={styles.popupVal}>{hoveredFeature.brightness} K</span>
                </div>
              )}

              {hoveredFeature.province && (
                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>Provinsi:</span>
                  <span style={styles.popupVal}>{hoveredFeature.province}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  mapElement: {
    width: '100%',
    height: '100%',
  },
  mapControls: {
    position: 'absolute',
    top: '180px',
    left: '20px',
    zIndex: 80,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fitBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'rgba(18, 24, 38, 0.85)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  popupContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '12px',
  },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '6px',
  },
  sourceBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid',
    fontSize: '10px',
    fontWeight: '700',
    fontFamily: 'var(--font-mono)',
  },
  popupTime: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontFamily: 'var(--font-mono)',
  },
  popupBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
  },
  popupLabel: {
    color: '#94a3b8',
  },
  popupVal: {
    color: '#f8fafc',
    fontFamily: 'var(--font-mono)',
  },
};
