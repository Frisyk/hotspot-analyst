import { NextResponse } from 'next/server';
import { cached, querySummary } from '../../../../lib/hotspotStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hotspots/summary?start&end&source
 * JSON kecil: total, hr0 (jam epoch pertama), hitungan per jam per sumber (dense array),
 * jumlah per tanggal, dan bbox data. Menggantikan metadata.dateStats dari GeoJSON lama.
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const sourceParam = sp.get('source') || 'all';
  const start = sp.get('start') || null;
  const end = sp.get('end') || null;
  if (start && (start.includes('NaN') || isNaN(Date.parse(start)))) {
    return NextResponse.json({ error: 'Invalid start parameter' }, { status: 400 });
  }
  if (end && (end.includes('NaN') || isNaN(Date.parse(end)))) {
    return NextResponse.json({ error: 'Invalid end parameter' }, { status: 400 });
  }
  let bbox = null;
  const bboxParam = sp.get('bbox');
  if (bboxParam) {
    const b = bboxParam.split(',').map(Number);
    if (b.length === 4 && b.every(Number.isFinite)) bbox = b;
  }
  const source = ['all', 'firms', 'sipongi'].includes(sourceParam) ? sourceParam : 'all';
  const opts = { start, end, source, bbox };

  const key = `hs-sum|${source}|${start || ''}|${end || ''}|${bbox ? bbox.join(',') : ''}`;
  const nowWallMs = Date.now() + 7 * 3600_000;
  const endMs = end ? Date.parse(end.length === 16 ? `${end}:00Z` : end) : Infinity;
  const isLive = !Number.isFinite(endMs) || endMs > nowWallMs - 3 * 3600_000;
  const ttl = isLive ? 60 : 3600;

  try {
    const data = await cached(key, () => querySummary(opts), ttl);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': isLive ? 'private, max-age=30' : 'private, max-age=3600' },
    });
  } catch (error) {
    console.error('Error in /api/hotspots/summary:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
