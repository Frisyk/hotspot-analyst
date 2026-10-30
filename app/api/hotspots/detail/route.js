import { NextResponse } from 'next/server';
import { cached, queryDetail } from '../../../../lib/hotspotStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hotspots/detail?lat=...&lon=...&start=...&end=...
 * Mengambil informasi baris lengkap dari database (FRP, Satelit, Day/Night, Lokasi Administrasi).
 */
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const lat = parseFloat(sp.get('lat'));
  const lon = parseFloat(sp.get('lon'));
  const radius = parseFloat(sp.get('radius') || '0.008');
  const start = sp.get('start') || null;
  const end = sp.get('end') || null;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: 'Parameter lat dan lon harus angka valid' }, { status: 400 });
  }

  try {
    const key = `detail:${lat.toFixed(4)}:${lon.toFixed(4)}:${start || ''}:${end || ''}`;
    const results = await cached(key, () => queryDetail({ lat, lon, radius, start, end }), 120);
    return NextResponse.json({ lat, lon, count: results.length, results });
  } catch (error) {
    console.error('Error in /api/hotspots/detail:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
