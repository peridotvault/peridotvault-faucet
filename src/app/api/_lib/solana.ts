import { Connection, Keypair, PublicKey, clusterApiUrl, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, createTransferInstruction, getMint } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

const LIST_TOKEN_PATH = path.join(process.cwd(), 'data', 'list_token.json');
const CLAIMS_PATH = path.join(process.cwd(), 'data', 'claims.json');
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

function ensureDataDir() {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CLAIMS_PATH)) {
    fs.writeFileSync(CLAIMS_PATH, JSON.stringify({}));
  }
}

export function getConnection() {
  return new Connection(clusterApiUrl('devnet'), 'confirmed');
}

export function getFaucetKeypair(): Keypair {
  const secret = process.env.FAUCET_SECRET_KEY;
  if (secret) {
    return Keypair.fromSecretKey(bs58.decode(secret));
  }
  const kp = Keypair.generate();
  console.warn(
    'WARNING: FAUCET_SECRET_KEY not set. Using ephemeral keypair:',
    kp.publicKey.toBase58()
  );
  return kp;
}

export type TokenConfig = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  maxClaim: number;
};

export function getTokenList(): TokenConfig[] {
  if (!fs.existsSync(LIST_TOKEN_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(LIST_TOKEN_PATH, 'utf-8');
  return JSON.parse(raw) as TokenConfig[];
}

type ClaimRecord = {
  lastClaimAt: string;
  amount: number;
};

function getClaims(): Record<string, ClaimRecord> {
  ensureDataDir();
  if (!fs.existsSync(CLAIMS_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(CLAIMS_PATH, 'utf-8');
  return JSON.parse(raw) as Record<string, ClaimRecord>;
}

function setClaims(claims: Record<string, ClaimRecord>) {
  ensureDataDir();
  fs.writeFileSync(CLAIMS_PATH, JSON.stringify(claims, null, 2));
}

export function checkRateLimit(fingerprint: string, mint: string): { allowed: boolean; nextClaimAt?: Date; remainingMs?: number } {
  const key = `${fingerprint}_${mint}`;
  const claims = getClaims();
  const record = claims[key];
  if (!record) return { allowed: true };
  const lastTime = new Date(record.lastClaimAt).getTime();
  const now = Date.now();
  const diff = now - lastTime;
  if (diff >= EIGHT_HOURS_MS) return { allowed: true };
  return { allowed: false, nextClaimAt: new Date(lastTime + EIGHT_HOURS_MS), remainingMs: EIGHT_HOURS_MS - diff };
}

export function recordClaim(fingerprint: string, mint: string, amount: number) {
  const key = `${fingerprint}_${mint}`;
  const claims = getClaims();
  claims[key] = { lastClaimAt: new Date().toISOString(), amount };
  setClaims(claims);
}

export async function ensureFaucetSol(minSol = 0.05): Promise<void> {
  const connection = getConnection();
  const payer = getFaucetKeypair();
  const balance = await connection.getBalance(payer.publicKey);
  const minLamports = minSol * LAMPORTS_PER_SOL;
  if (balance < minLamports) {
    const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');
  }
}

export async function transferTokens(
  recipient: string,
  mintAddress: string,
  amount: number,
  fingerprint: string
): Promise<string> {
  const connection = getConnection();
  const payer = getFaucetKeypair();

  await ensureFaucetSol();
  const mintPubkey = new PublicKey(mintAddress);
  const recipientPubkey = new PublicKey(recipient);

  const rateLimit = checkRateLimit(fingerprint, mintAddress);
  if (!rateLimit.allowed) {
    const hours = Math.floor((rateLimit.remainingMs || 0) / (1000 * 60 * 60));
    const minutes = Math.ceil(((rateLimit.remainingMs || 0) % (1000 * 60 * 60)) / (1000 * 60));
    throw new Error(`Rate limit reached. Try again in ${hours}h ${minutes}m.`);
  }

  const tokens = getTokenList();
  const meta = tokens.find((t) => t.mint === mintAddress);
  if (!meta) {
    throw new Error('Token not in faucet pool');
  }

  if (amount > meta.maxClaim) {
    throw new Error(`Max claim is ${meta.maxClaim} ${meta.symbol}`);
  }

  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  let decimals = meta.decimals;
  try {
    const mintInfo = await getMint(connection, mintPubkey);
    decimals = mintInfo.decimals;
  } catch {
    // fallback to config
  }

  const amountRaw = BigInt(Math.floor(amount * Math.pow(10, decimals)));

  const senderATA = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    payer.publicKey
  );

  const recipientATA = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    recipientPubkey
  );

  const transaction = new Transaction().add(
    createTransferInstruction(
      senderATA.address,
      recipientATA.address,
      payer.publicKey,
      amountRaw
    )
  );

  const sig = await sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: 'confirmed',
  });

  recordClaim(fingerprint, mintAddress, amount);
  return sig;
}

export async function getFaucetBalances(): Promise<{ mint: string; symbol: string; balance: number }[]> {
  const connection = getConnection();
  const payer = getFaucetKeypair();
  const tokens = getTokenList();
  const balances: { mint: string; symbol: string; balance: number }[] = [];

  for (const token of tokens) {
    try {
      const mintPubkey = new PublicKey(token.mint);
      let decimals = token.decimals;
      try {
        const mintInfo = await getMint(connection, mintPubkey);
        decimals = mintInfo.decimals;
      } catch {
        // use config
      }

      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mintPubkey,
        payer.publicKey
      );

      const balance = await connection.getTokenAccountBalance(ata.address);
      balances.push({
        mint: token.mint,
        symbol: token.symbol,
        balance: Number(balance.value.amount) / Math.pow(10, decimals),
      });
    } catch {
      balances.push({
        mint: token.mint,
        symbol: token.symbol,
        balance: 0,
      });
    }
  }

  return balances;
}
