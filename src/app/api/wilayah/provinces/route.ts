import { NextResponse } from 'next/server';

const BASE = 'https://wilayah.id/api';
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

export const revalidate = CACHE_TTL;

export async function GET() {
  try {
    const res = await fetch(`${BASE}/provinces.json`, {
      next: { revalidate: CACHE_TTL },
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`wilayah.id responded ${res.status}`);
    const json = await res.json();
    return NextResponse.json(json, {
      headers: { 'Cache-Control': `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=3600` },
    });
  } catch (err: any) {
    console.error('[wilayah/provinces]', err.message);
    return NextResponse.json({ error: 'Gagal memuat data provinsi.', data: [] }, { status: 502 });
  }
}
