'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Flame,
  ShieldCheck,
  Mountain,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Crosshair,
  Calendar,
  Clock,
  Radio,
  Layers,
  MapPin,
} from 'lucide-react';
import { formatWall, formatDay, formatShort, formatInput } from '../utils/timeUtils';

export function formatBrightness(k) {
  if (!k || k <= 0) return null;
  const c = Math.round(k - 273.15);
  return {
    kelvin: `${Math.round(k)} K`,
    celsius: `${c > 0 ? '+' : ''}${c}°C`,
    full: `${Math.round(k)} K (${c > 0 ? '+' : ''}${c}°C)`,
  };
}

export function formatConfidence(conf) {
  if (!conf || conf === '-') return { label: 'Tersedia', level: 'mid' };
  const c = String(conf).toLowerCase().trim();
  if (c === 'h' || c === 'high' || c === 'tinggi' || (Number(c) >= 80)) {
    return { label: `Tinggi (${conf})`, level: 'high' };
  }
  if (c === 'n' || c === 'nominal' || c === 'sedang' || (Number(c) >= 50 && Number(c) < 80)) {
    return { label: `Nominal (${conf})`, level: 'nominal' };
  }
  if (c === 'l' || c === 'low' || c === 'rendah' || (Number(c) < 50)) {
    return { label: `Rendah (${conf})`, level: 'low' };
  }
  return { label: String(conf), level: 'mid' };
}

export default function HotspotDetailPopup({
  hotspot,
  onClose,
  onFocus,
  onZoomIn,
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [extraData, setExtraData] = useState(null);
  const [extraLoading, setExtraLoading] = useState(false);

  useEffect(() => {
    setActiveIdx(0);
    setCopied(false);
    setExtraData(null);

    if (!hotspot || hotspot.isGrid) return;

    // Ambil detail tambahan dari PostgreSQL jika titik mentah (dibatasi jendela waktu deteksi agar instan)
    let cancelled = false;
    setExtraLoading(true);
    const params = new URLSearchParams({
      lat: String(hotspot.lat),
      lon: String(hotspot.lon),
    });
    const mins = (hotspot.rows || [])
      .map((r) => r.min)
      .filter((m) => typeof m === 'number' && Number.isFinite(m) && m > 0);
    if (mins.length > 0) {
      const minMs = (Math.min(...mins) - 180) * 60000;
      const maxMs = (Math.max(...mins) + 180) * 60000;
      params.set('start', formatInput(minMs));
      params.set('end', formatInput(maxMs));
    }

    fetch(`/api/hotspots/detail?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.results && data.results.length) {
          setExtraData(data.results);
        }
      })
      .catch(() => { })
      .finally(() => {
        if (!cancelled) setExtraLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hotspot]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (
    !hotspot ||
    typeof hotspot.lat !== 'number' ||
    typeof hotspot.lon !== 'number' ||
    !Number.isFinite(hotspot.lat) ||
    !Number.isFinite(hotspot.lon)
  ) {
    return null;
  }

  const { lon, lat, isGrid, rows = [], totalCnt, maxBright, elevation, color } = hotspot;
  const current = rows[activeIdx] || rows[0] || {};
  const currentExtra = extraData && extraData[activeIdx] ? extraData[activeIdx] : null;

  const brightInfo = formatBrightness(current.bright || maxBright);
  const confInfo = formatConfidence(currentExtra?.conf || current.conf);
  const frp = typeof currentExtra?.frp === 'number' && Number.isFinite(currentExtra.frp)
    ? `${currentExtra.frp.toFixed(1)} MW`
    : null;
  const dayNight = currentExtra?.daynight === 'D' ? 'Siang (Day pass)' : currentExtra?.daynight === 'N' ? 'Malam (Night pass)' : null;

  const copyCoords = () => {
    const text = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const gmapsUrl = `https://www.google.com/maps?q=${lat.toFixed(5)},${lon.toFixed(5)}`;

  return (
    <div className="hp-popup" role="dialog" aria-modal="true" aria-label="Detail Titik Api">
      {/* Header Pop-up */}
      <div className="hp-header">
        <div className="hp-header-left">
          <span
            className="hp-dot-pulse"
            style={{
              background: color || '#FF2222',
              boxShadow: `0 0 10px ${color || '#FF2222'}`,
            }}
          />
          <div className="hp-header-titles">
            <div className="hp-kind">
              {isGrid ? (
                <span className="hp-badge grid">Sel Agregat ({totalCnt || rows.length} Titik)</span>
              ) : (
                <span className="hp-badge raw">
                  {current.kind === 1 ? 'KLHK SIPONGI' : 'NASA FIRMS'}
                </span>
              )}
              {current.isNewest && <span className="hp-badge newest">Terbaru</span>}
            </div>
            <h3 className="hp-title">
              {isGrid ? 'Area Kluster Titik Api' : `Titik Api · ${current.sensorName || 'Satelit'}`}
            </h3>
          </div>
        </div>

        <button
          className="hp-close"
          onClick={onClose}
          aria-label="Tutup detail (Esc)"
          title="Tutup (Esc)"
        >
          <X size={15} />
        </button>
      </div>

      {/* Jika terdapat multi-deteksi pada koordinat ini (raw mode) */}
      {!isGrid && rows.length > 1 && (
        <div className="hp-tabs" role="tablist" aria-label="Daftar deteksi pada titik ini">
          <span className="hp-tabs-label">Deteksi ({rows.length}):</span>
          <div className="hp-tabs-scroll">
            {rows.map((r, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={activeIdx === i}
                className={`hp-tab-btn${activeIdx === i ? ' on' : ''}`}
                onClick={() => setActiveIdx(i)}
                style={activeIdx === i && r.color ? { borderColor: r.color } : {}}
              >
                <i style={{ background: r.color || '#FF2222' }} />
                <span>{formatShort(r.min * 60000)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ringkasan Indikator Kunci */}
      <div className="hp-stat-grid">
        {brightInfo ? (
          <div className="hp-stat-card">
            <div className="hp-stat-k">
              <Flame size={12} className="text-ember" />
              <span>Suhu Bara</span>
            </div>
            <div className="hp-stat-v">{brightInfo.kelvin}</div>
            <div className="hp-stat-sub">{brightInfo.celsius}</div>
          </div>
        ) : (
          <div className="hp-stat-card">
            <div className="hp-stat-k">
              <Layers size={12} />
              <span>Deteksi</span>
            </div>
            <div className="hp-stat-v">{totalCnt || rows.length}×</div>
            <div className="hp-stat-sub">Terdata</div>
          </div>
        )}

        <div className="hp-stat-card">
          <div className="hp-stat-k">
            <ShieldCheck size={12} />
            <span>Keyakinan</span>
          </div>
          <div className={`hp-stat-v conf-${confInfo.level}`}>{confInfo.label.split(' ')[0]}</div>
          <div className="hp-stat-sub">{confInfo.label}</div>
        </div>

        {elevation != null ? (
          <div className="hp-stat-card">
            <div className="hp-stat-k">
              <Mountain size={12} />
              <span>Elevasi</span>
            </div>
            <div className="hp-stat-v">{Math.round(elevation)} m</div>
            <div className="hp-stat-sub">Diatas laut (dpl)</div>
          </div>
        ) : frp ? (
          <div className="hp-stat-card">
            <div className="hp-stat-k">
              <Zap size={12} />
              <span>Radiasi Api</span>
            </div>
            <div className="hp-stat-v">{frp}</div>
            <div className="hp-stat-sub">Energi Termal (MW)</div>
          </div>
        ) : (
          <div className="hp-stat-card">
            <div className="hp-stat-k">
              <Radio size={12} />
              <span>Sensor</span>
            </div>
            <div className="hp-stat-v" style={{ fontSize: '12px' }}>
              {current.sensorName || 'FIRMS'}
            </div>
            <div className="hp-stat-sub">Thermal Infrared</div>
          </div>
        )}
      </div>

      {/* Tabel Data Detil */}
      <div className="hp-detail-table">
        <div className="hp-row">
          <span className="hp-row-k">
            <Calendar size={12} /> Waktu Deteksi (WIB)
          </span>
          <span className="hp-row-v mono">
            {current.min ? `${formatWall(current.min * 60000)} WIB` : '—'}
          </span>
        </div>

        <div className="hp-row">
          <span className="hp-row-k">
            <MapPin size={12} /> Koordinat Geografis
          </span>
          <span className="hp-row-v mono coord">
            {lat.toFixed(5)}°, {lon.toFixed(5)}°
          </span>
        </div>

        <div className="hp-row">
          <span className="hp-row-k">
            <Radio size={12} /> Sumber & Sensor
          </span>
          <span className="hp-row-v">
            {currentExtra?.satellite && currentExtra.satellite !== '-'
              ? `${currentExtra.sensor} · ${currentExtra.satellite}`
              : current.sensorName || 'Satelit Pengamat Bumi'}
          </span>
        </div>

        {dayNight && (
          <div className="hp-row">
            <span className="hp-row-k">
              <Clock size={12} /> Lintasan Orbit
            </span>
            <span className="hp-row-v">{dayNight}</span>
          </div>
        )}

        {currentExtra?.nama_kabupaten && (
          <div className="hp-row">
            <span className="hp-row-k">
              <MapPin size={12} /> Wilayah
            </span>
            <span className="hp-row-v">
              {currentExtra.nama_kabupaten}
              {currentExtra.nama_provinsi ? `, ${currentExtra.nama_provinsi}` : ''}
            </span>
          </div>
        )}

        {currentExtra?.uid && (
          <div className="hp-row">
            <span className="hp-row-k">UID Alert</span>
            <span className="hp-row-v mono uid">{currentExtra.uid}</span>
          </div>
        )}

        {isGrid && (
          <div className="hp-notice-grid">
            <Layers size={13} />
            <span>
              Titik ini merupakan agregasi sel seluas <b>{hotspot.cell || 0.05}°</b> (~
              {Math.round((hotspot.cell || 0.05) * 111)} km) untuk performa rendering ribuan titik.
            </span>
          </div>
        )}
      </div>

      {/* Tombol Aksi */}
      <div className="hp-actions">
        <button
          className={`hp-btn-copy${copied ? ' copied' : ''}`}
          onClick={copyCoords}
          title="Salin Latitude dan Longitude"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? 'Tersalin!' : 'Salin Koordinat'}</span>
        </button>

        {isGrid && onZoomIn ? (
          <button
            className="hp-btn-zoom"
            onClick={() => onZoomIn(lon, lat)}
            title="Perbesar peta untuk melihat titik mentah"
          >
            <Crosshair size={13} />
            <span>Perbesar ke Titik Mentah</span>
          </button>
        ) : onFocus ? (
          <button
            className="hp-btn-focus"
            onClick={() => onFocus(lon, lat)}
            title="Pusatkan peta ke titik ini"
          >
            <Crosshair size={13} />
            <span>Pusatkan</span>
          </button>
        ) : null}

        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hp-btn-ext"
          title="Buka titik koordinat di Google Maps"
        >
          <ExternalLink size={13} />
          <span>Maps</span>
        </a>
      </div>
    </div>
  );
}
