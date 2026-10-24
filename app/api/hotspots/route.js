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

  const opts = { start, end, source, bbox };

  try {
    const key = request.url;
    const buf = await cached(key, async () => {
      if (tier === 'grid') {
        const cell = Math.min(1, Math.max(0.001, parseFloat(sp.get('cell') || '0.05')));
        const { cols } = await queryGrid(opts, cell);
        return encodeHotspots(cols, { tier: 'grid', cell });
      }
      const { cols, truncated } = await queryRaw(opts, RAW_LIMIT);
      return encodeHotspots(cols, { tier: 'raw', truncated, limit: RAW_LIMIT });
    });

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'private, max-age=30',
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
