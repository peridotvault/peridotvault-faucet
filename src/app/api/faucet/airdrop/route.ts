import { NextResponse } from 'next/server';
import { ensureFaucetSol, getFaucetKeypair } from '../../_lib/solana';

export async function POST() {
  try {
    const kp = getFaucetKeypair();
    await ensureFaucetSol(0.05);
    return NextResponse.json({ success: true, pubkey: kp.publicKey.toBase58() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
