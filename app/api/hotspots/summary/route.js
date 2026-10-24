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
  const opts = {
    start,
    end,
    source: ['all', 'firms', 'sipongi'].includes(sourceParam) ? sourceParam : 'all',
  };

  try {
    const data = await cached(request.url, () => querySummary(opts));
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (error) {
    console.error('Error in /api/hotspots/summary:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
