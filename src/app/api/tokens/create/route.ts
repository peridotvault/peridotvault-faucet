import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Token creation is disabled. Tokens are managed via list_token.json.' }, { status: 410 });
}
