import { NextResponse } from 'next/server';
import { encodeHotspots } from '../../../lib/hotspotCodec';
import { cached, queryGrid, queryRaw, RAW_LIMIT } from '../../../lib/hotspotStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hotspots
 *   start, end    'YYYY-MM-DDTHH:mm' (WIB)
 *   source        all | firms | sipongi
 *   tier          raw | grid
 *   bbox          west,south,east,north   (tier=raw; opsional)
 *   cell          ukuran sel derajat      (tier=grid)
 *
 * Respons: application/octet-stream, lihat lib/hotspotCodec.js
 * Ringkasan (jumlah per tanggal, histogram jam) ada di /api/hotspots/summary.
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const start = sp.get('start') || null;
  const end = sp.get('end') || null;
  if (start && (start.includes('NaN') || isNaN(Date.parse(start)))) {
    return NextResponse.json({ error: 'Invalid start parameter' }, { status: 400 });
  }
  if (end && (end.includes('NaN') || isNaN(Date.parse(end)))) {
    return NextResponse.json({ error: 'Invalid end parameter' }, { status: 400 });
  }
  const sourceParam = sp.get('source') || 'all';
  const source = ['all', 'firms', 'sipongi'].includes(sourceParam) ? sourceParam : 'all';
  const tier = sp.get('tier') === 'grid' ? 'grid' : 'raw';

  let bbox = null;
  const bboxParam = sp.get('bbox');
  if (bboxParam) {
    const b = bboxParam.split(',').map(Number);
    if (b.length === 4 && b.every(Number.isFinite)) bbox = b;
  }

  const cell = tier === 'grid'
    ? Math.min(1, Math.max(0.001, parseFloat(sp.get('cell') || '0.05')))
    : null;

  const opts = { start, end, source, bbox };

  // Kunci cache dinormalisasi (Langkah 1b) + TTL menurut kesegaran data (Langkah 5b)
  const key = `hs|${tier}|${source}|${start || ''}|${end || ''}|${bbox ? bbox.join(',') : ''}|${cell ?? ''}`;
  const nowWallMs = Date.now() + 7 * 3600_000;
  const endMs = end ? Date.parse(end.length === 16 ? `${end}:00Z` : end) : Infinity;
  const isLive = !Number.isFinite(endMs) || endMs > nowWallMs - 3 * 3600_000;
  const ttl = isLive ? 60 : 3600;

  try {
    const buf = await cached(
      key,
      async () => {
        if (tier === 'grid') {
          const { cols } = await queryGrid(opts, cell);
          return encodeHotspots(cols, { tier: 'grid', cell });
        }
        const { cols, truncated } = await queryRaw(opts, RAW_LIMIT);
        return encodeHotspots(cols, { tier: 'raw', truncated, limit: RAW_LIMIT });
      },
      ttl
    );

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': isLive ? 'private, max-age=30' : 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error in /api/hotspots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hotspots', details: error.message },
      { status: 500 }
    );
  }
}
