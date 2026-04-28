'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getDeviceFingerprint } from '../lib/fingerprint';

type Token = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  maxClaim: number;
};

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'peridot_faucet_claim_';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getLocalClaimTs(mint: string): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY_PREFIX + mint);
  if (!raw) return null;
  try {
    const ts = new Date(raw).getTime();
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

function setLocalClaimTs(mint: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_PREFIX + mint, new Date().toISOString());
}

export default function FaucetPage() {
  const { publicKey, connected } = useWallet();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedMint, setSelectedMint] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [txSig, setTxSig] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [serverNextClaimAt, setServerNextClaimAt] = useState<string | null>(null);
  const [localTick, setLocalTick] = useState(0);

  const fingerprint = useMemo(() => getDeviceFingerprint(), []);

  // Token list
  useEffect(() => {
    let cancelled = false;
    async function loadTokens() {
      try {
        const res = await fetch('/api/tokens/list');
        const data = await res.json();
        const list: Token[] = data.tokens || [];
        if (!cancelled) {
          setTokens(list);
          if (list.length > 0) {
            setSelectedMint(list[0].mint);
          }
        }
      } catch {
        if (!cancelled) setTokens([]);
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    loadTokens();
    return () => { cancelled = true; };
  }, []);

  // Clock tick
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check server rate limit
  useEffect(() => {
    if (!selectedMint || !fingerprint) return;
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(
          `/api/faucet/status?fingerprint=${encodeURIComponent(fingerprint)}&mint=${selectedMint}`
        );
        const data = await res.json();
        if (!cancelled) {
          setServerNextClaimAt(!data.allowed && data.nextClaimAt ? data.nextClaimAt : null);
        }
      } catch {
        if (!cancelled) setServerNextClaimAt(null);
      }
    }
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedMint, fingerprint]);

  // Combine server and local rate limit (use whichever is stricter)
  const remainingMs = useMemo(() => {
    const localTs = getLocalClaimTs(selectedMint);
    const localRemaining = localTs ? Math.max(0, EIGHT_HOURS_MS - (now - localTs)) : 0;
    const serverRemaining = serverNextClaimAt
      ? Math.max(0, new Date(serverNextClaimAt).getTime() - now)
      : 0;
    return Math.max(localRemaining, serverRemaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMint, now, serverNextClaimAt, localTick]);

  const isLimited = remainingMs > 0;
  const countdown = isLimited ? formatCountdown(remainingMs) : '';
  const selectedToken = tokens.find((t) => t.mint === selectedMint);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*\.?\d*$/.test(val)) setAmount(val);
  };

  const setMaxAmount = () => {
    if (selectedToken) setAmount(String(selectedToken.maxClaim));
  };

  const handleSelectToken = (mint: string) => {
    setSelectedMint(mint);
    setAmount('');
    setStatus('idle');
    setLocalTick((t) => t + 1);
  };

  const handleClaim = async () => {
    if (!connected || !publicKey) {
      setStatus('error');
      setMessage('Please connect your wallet first.');
      return;
    }
    if (!selectedMint) {
      setStatus('error');
      setMessage('Please select a token.');
      return;
    }
    if (isLimited) {
      setStatus('error');
      setMessage(`You can claim again in ${countdown}.`);
      return;
    }
    const num = parseFloat(amount);
    if (!amount || Number.isNaN(num) || num <= 0) {
      setStatus('error');
      setMessage('Please enter a valid amount greater than 0.');
      return;
    }
    if (selectedToken && num > selectedToken.maxClaim) {
      setStatus('error');
      setMessage(`Max claim is ${selectedToken.maxClaim.toLocaleString()} ${selectedToken.symbol} per 8 hours.`);
      return;
    }

    setStatus('loading');
    setMessage('');
    setTxSig(null);

    try {
      const res = await fetch('/api/faucet/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: publicKey.toBase58(),
          mint: selectedMint,
          amount: num,
          fingerprint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Claim failed');

      setLocalClaimTs(selectedMint);
      setLocalTick((t) => t + 1);
      setServerNextClaimAt(new Date(Date.now() + EIGHT_HOURS_MS).toISOString());

      setStatus('success');
      setMessage(`Successfully claimed ${num.toLocaleString()} ${selectedToken?.symbol || 'tokens'}.`);
      setTxSig(data.signature);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center px-6 py-12">
      {/* Top right admin link */}
      <div className="fixed top-6 right-6 z-50">
        <Link
          href="/admin"
          className="text-xs font-medium text-white/40 hover:text-white transition-colors tracking-widest uppercase"
        >
          Admin
        </Link>
      </div>

      <div className="w-full max-w-lg flex flex-col items-center text-center">
        {/* Brand */}
        <div className="mb-10">
          <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white mb-3">
            Peridot Faucet
          </h1>
          <p className="text-sm text-white/40 tracking-wide">
            Claim free SPL tokens on Solana Devnet
          </p>
        </div>

        {/* Rate limit */}
        {isLimited && (
          <div className="w-full mb-8 border border-white/10 rounded-lg px-5 py-4 bg-white/[0.02]">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Next claim available in</p>
            <p className="text-2xl font-mono font-light text-white tracking-wider">{countdown}</p>
          </div>
        )}

        {/* Token Select */}
        <div className="w-full mb-6">
          <label className="block text-left text-[10px] font-medium text-white/30 uppercase tracking-[0.15em] mb-3">
            Select Token
          </label>
          <div className="grid grid-cols-2 gap-3">
            {tokens.map((t) => (
              <button
                key={t.mint}
                onClick={() => handleSelectToken(t.mint)}
                className={[
                  'relative rounded-lg px-4 py-4 text-left border transition-all duration-200',
                  selectedMint === t.mint
                    ? 'border-white/20 bg-white/[0.04]'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{t.symbol}</span>
                  {selectedMint === t.mint && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#349b65]" />
                  )}
                </div>
                <p className="text-[10px] text-white/30 mt-1">Max {t.maxClaim.toLocaleString()} / 8h</p>
              </button>
            ))}
            {fetching && (
              <>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-4 animate-pulse">
                  <div className="h-4 w-12 bg-white/10 rounded" />
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-4 animate-pulse">
                  <div className="h-4 w-12 bg-white/10 rounded" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className="w-full mb-6">
          <label className="block text-left text-[10px] font-medium text-white/30 uppercase tracking-[0.15em] mb-3">
            Amount
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={handleAmountChange}
              disabled={isLimited}
              className="w-full bg-transparent text-4xl font-light text-white placeholder:text-white/10 outline-none border-b border-white/10 focus:border-white/30 pb-3 transition-colors disabled:opacity-30"
            />
            <div className="absolute right-0 bottom-3 flex items-center gap-3">
              <button
                type="button"
                onClick={setMaxAmount}
                disabled={!selectedToken || isLimited}
                className="text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-white transition-colors disabled:opacity-30"
              >
                Max
              </button>
              <span className="text-xs text-white/20 font-medium">
                {selectedToken?.symbol || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Wallet */}
        <div className="w-full mb-8">
          <label className="block text-left text-[10px] font-medium text-white/30 uppercase tracking-[0.15em] mb-3">
            Wallet
          </label>
          <div className="flex items-center justify-between">
            <WalletMultiButton
              style={{
                background: 'transparent',
                color: 'white',
                fontFamily: 'inherit',
                fontWeight: 500,
                borderRadius: '8px',
                height: '44px',
                fontSize: '0.8rem',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0 20px',
              }}
            />
            {connected && publicKey && (
              <span className="text-xs font-mono text-white/30">
                {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-4)}
              </span>
            )}
          </div>
        </div>

        {/* Claim Button */}
        <button
          onClick={handleClaim}
          disabled={status === 'loading' || isLimited}
          className={[
            'w-full py-4 rounded-lg text-sm font-medium tracking-wide transition-all duration-300',
            'bg-white text-black hover:bg-white/90',
            (status === 'loading' || isLimited) ? 'opacity-40 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {status === 'loading' ? 'Processing...' : isLimited ? 'Limit Reached' : 'Claim Tokens'}
        </button>

        {/* Status */}
        {status !== 'idle' && status !== 'loading' && (
          <div className={[
            'w-full mt-6 rounded-lg px-5 py-4 text-sm text-left border',
            status === 'success'
              ? 'border-[#349b65]/30 bg-[#349b65]/[0.04] text-[#87ee83]'
              : 'border-red-500/30 bg-red-500/[0.04] text-red-400',
          ].join(' ')}>
            <p className="text-xs font-medium uppercase tracking-widest mb-1 opacity-60">
              {status === 'success' ? 'Success' : 'Error'}
            </p>
            <p className="text-sm">{message}</p>
            {txSig && (
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline underline-offset-4 mt-2 inline-block opacity-60 hover:opacity-100 transition-opacity"
              >
                View on Solana Explorer
              </a>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-6 left-0 right-0 text-center">
        <p className="text-[10px] text-white/20 tracking-widest uppercase">Solana Devnet</p>
      </div>
    </div>
  );
}
