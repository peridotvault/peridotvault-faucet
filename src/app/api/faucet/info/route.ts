import { NextResponse } from 'next/server';
import { getConnection, getFaucetKeypair, getFaucetBalances } from '../../_lib/solana';

export async function GET() {
  try {
    const connection = getConnection();
    const kp = getFaucetKeypair();
    const [balances, lamports] = await Promise.all([
      getFaucetBalances(),
      connection.getBalance(kp.publicKey),
    ]);
    return NextResponse.json({
      pubkey: kp.publicKey.toBase58(),
      balances,
      solBalance: lamports / 1_000_000_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
