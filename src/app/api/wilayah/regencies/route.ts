import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://wilayah.id/api';
const CACHE_TTL = 24 * 60 * 60;

export async function GET(req: NextRequest) {
  const provinceCode = req.nextUrl.searchParams.get('provinceCode');
  if (!provinceCode) {
    return NextResponse.json({ error: 'provinceCode diperlukan.', data: [] }, { status: 400 });
  }
  try {
    const res = await fetch(`${BASE}/regencies/${provinceCode}.json`, {
      next: { revalidate: CACHE_TTL },
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`wilayah.id responded ${res.status}`);
    const json = await res.json();
    return NextResponse.json(json, {
      headers: { 'Cache-Control': `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=3600` },
    });
  } catch (err: any) {
    console.error('[wilayah/regencies]', err.message);
    return NextResponse.json({ error: 'Gagal memuat data kota/kabupaten.', data: [] }, { status: 502 });
  }
}
