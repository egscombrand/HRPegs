import { NextRequest, NextResponse } from 'next/server';

const TIMEOUT_MS = 15_000;

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get('fileId');

  if (!fileId || fileId.trim() === '') {
    return new NextResponse('fileId parameter is required', { status: 400 });
  }

  const appsScriptUrl = process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL;
  const uploadSecret = process.env.GOOGLE_DRIVE_UPLOAD_SECRET;

  if (!appsScriptUrl) {
    console.error('[google-drive-image] Missing GOOGLE_DRIVE_APPS_SCRIPT_URL env var');
    return new NextResponse('Server misconfigured: Apps Script URL not set', { status: 500 });
  }
  if (!uploadSecret) {
    console.error('[google-drive-image] Missing GOOGLE_DRIVE_UPLOAD_SECRET env var');
    return new NextResponse('Server misconfigured: Upload secret not set', { status: 500 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let responseText: string;
  try {
    const params = new URLSearchParams({ action: 'image', fileId, secret: uploadSecret });
    const upstream = await fetch(`${appsScriptUrl}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!upstream.ok) {
      clearTimeout(timeout);
      console.error(`[google-drive-image] Apps Script HTTP ${upstream.status} for fileId=${fileId}`);
      return new NextResponse(`Apps Script returned ${upstream.status}`, { status: 502 });
    }

    responseText = await upstream.text();
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error(`[google-drive-image] Request timed out for fileId=${fileId}`);
      return new NextResponse('Request to Apps Script timed out', { status: 504 });
    }
    console.error(`[google-drive-image] Fetch error for fileId=${fileId}:`, err.message);
    return new NextResponse('Failed to reach Apps Script', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!responseText || responseText.trim() === '') {
    console.error(`[google-drive-image] Empty response from Apps Script for fileId=${fileId}`);
    return new NextResponse('Empty response from Apps Script', { status: 502 });
  }

  // Parse JSON or treat as raw base64
  let base64: string;
  let mimeType = 'image/png';

  let payload: any = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (payload !== null) {
    if (!payload.success) {
      const errMsg = payload.error || 'Apps Script reported failure';
      console.error(`[google-drive-image] Apps Script error for fileId=${fileId}:`, errMsg);
      return new NextResponse(errMsg, { status: 404 });
    }
    if (!payload.base64) {
      console.error(`[google-drive-image] Missing base64 in Apps Script response for fileId=${fileId}`);
      return new NextResponse('Image data missing from Apps Script response', { status: 502 });
    }
    base64 = payload.base64 as string;
    mimeType = payload.mimeType || 'image/png';
  } else {
    // Raw base64 text
    base64 = responseText.trim();
  }

  // Strip data URL prefix if present
  if (base64.includes(',')) {
    base64 = base64.split(',')[1];
  }

  // Validate it looks like base64
  if (!/^[A-Za-z0-9+/=]+$/.test(base64.replace(/\s/g, ''))) {
    console.error(`[google-drive-image] Invalid base64 data for fileId=${fileId}`);
    return new NextResponse('Invalid image data received', { status: 502 });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      return new NextResponse('Image buffer is empty', { status: 502 });
    }
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err: any) {
    console.error(`[google-drive-image] Buffer conversion error for fileId=${fileId}:`, err.message);
    return new NextResponse('Failed to process image data', { status: 500 });
  }
}
