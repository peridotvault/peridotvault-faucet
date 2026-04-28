import { NextResponse } from 'next/server';
import { getTokenList } from '../../_lib/solana';

export async function GET() {
  try {
    const tokens = getTokenList();
    return NextResponse.json({ tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
