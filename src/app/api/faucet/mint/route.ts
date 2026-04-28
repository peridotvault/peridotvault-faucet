import { NextResponse } from 'next/server';
import { transferTokens } from '../../_lib/solana';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recipient, mint, amount, fingerprint } = body;

    if (!recipient || typeof recipient !== 'string') {
      return NextResponse.json({ error: 'Recipient address is required' }, { status: 400 });
    }
    if (!mint || typeof mint !== 'string') {
      return NextResponse.json({ error: 'Mint address is required' }, { status: 400 });
    }
    if (typeof amount !== 'number' || amount <= 0 || !Number.isFinite(amount)) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }
    if (!fingerprint || typeof fingerprint !== 'string') {
      return NextResponse.json({ error: 'Fingerprint is required' }, { status: 400 });
    }

    const signature = await transferTokens(recipient, mint, amount, fingerprint);
    return NextResponse.json({ signature });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
