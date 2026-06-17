import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://wilayah.id/api';
const CACHE_TTL = 12 * 60 * 60; // villages change less

export async function GET(req: NextRequest) {
  const districtCode = req.nextUrl.searchParams.get('districtCode');
  if (!districtCode) {
    return NextResponse.json({ error: 'districtCode diperlukan.', data: [] }, { status: 400 });
  }
  try {
    const res = await fetch(`${BASE}/villages/${districtCode}.json`, {
      next: { revalidate: CACHE_TTL },
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`wilayah.id responded ${res.status}`);
    const json = await res.json();
    return NextResponse.json(json, {
      headers: { 'Cache-Control': `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=3600` },
    });
  } catch (err: any) {
    console.error('[wilayah/villages]', err.message);
    return NextResponse.json({ error: 'Gagal memuat data kelurahan/desa.', data: [] }, { status: 502 });
  }
}
