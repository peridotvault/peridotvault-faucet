import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../_lib/solana';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fingerprint = searchParams.get('fingerprint');
    const mint = searchParams.get('mint');

    if (!fingerprint || !mint) {
      return NextResponse.json({ error: 'Missing fingerprint or mint' }, { status: 400 });
    }

    const result = checkRateLimit(fingerprint, mint);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
