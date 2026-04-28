'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type TokenConfig = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  maxClaim: number;
};

type BalanceInfo = {
  mint: string;
  symbol: string;
  balance: number;
};

export default function AdminPanel() {
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [balances, setBalances] = useState<BalanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [faucetPubkey, setFaucetPubkey] = useState('');
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [listRes, infoRes] = await Promise.all([
          fetch('/api/tokens/list'),
          fetch('/api/faucet/info'),
        ]);
        const listData = await listRes.json();
        const infoData = await infoRes.json();
        if (!cancelled) {
          setTokens(listData.tokens || []);
          setBalances(infoData.balances || []);
          setFaucetPubkey(infoData.pubkey || '');
          setSolBalance(infoData.solBalance ?? null);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleAirdrop() {
    setAirdropLoading(true);
    setAirdropMsg('');
    try {
      const res = await fetch('/api/faucet/airdrop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Airdrop failed');
      setAirdropMsg('Airdropped 1 SOL to faucet wallet.');
      setSolBalance((prev) => (prev !== null ? prev + 1 : 1));
    } catch (err) {
      setAirdropMsg(err instanceof Error ? err.message : 'Airdrop failed');
    } finally {
      setAirdropLoading(false);
    }
  }

  const getBalance = (mint: string) => {
    return balances.find((b) => b.mint === mint)?.balance ?? 0;
  };

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center px-6 py-12">
      {/* Top left back link */}
      <div className="fixed top-6 left-6 z-50">
        <Link
          href="/"
          className="text-xs font-medium text-white/40 hover:text-white transition-colors tracking-widest uppercase"
        >
          &larr; Back to Faucet
        </Link>
      </div>

      <div className="w-full max-w-lg flex flex-col items-center text-center">
        {/* Brand */}
        <div className="mb-10">
          <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-xl font-bold text-white">A</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white mb-3">
            Faucet Pool
          </h1>
          <p className="text-sm text-white/40 tracking-wide">
            Monitor balances and refill the pool
          </p>
        </div>

        {/* Authority */}
        {faucetPubkey && (
          <div className="w-full mb-8 border border-white/10 rounded-lg px-5 py-5 bg-white/[0.02] text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-medium text-white/30 uppercase tracking-[0.15em]">
                Faucet Authority
              </span>
              {solBalance !== null && (
                <span className={`text-xs font-mono ${solBalance < 0.01 ? 'text-red-400' : 'text-white/40'}`}>
                  {solBalance.toFixed(4)} SOL
                </span>
              )}
            </div>
            <p className="text-sm font-mono text-white/60 break-all leading-relaxed">
              {faucetPubkey}
            </p>
            {solBalance !== null && solBalance < 0.01 && (
              <p className="text-xs text-red-400/80 mt-2">
                SOL balance too low. Transactions will fail.
              </p>
            )}
            <button
              onClick={handleAirdrop}
              disabled={airdropLoading}
              className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-white/40 hover:text-white transition-colors disabled:opacity-30"
            >
              {airdropLoading ? 'Airdropping...' : 'Airdrop 1 SOL'}
            </button>
            {airdropMsg && (
              <p className={`text-xs mt-2 ${airdropMsg.includes('failed') || airdropMsg.includes('Error') ? 'text-red-400' : 'text-[#87ee83]'}`}>
                {airdropMsg}
              </p>
            )}
          </div>
        )}

        {/* Token Pool */}
        <div className="w-full mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-medium text-white/30 uppercase tracking-[0.15em]">
              Pool Balances
            </span>
            <button
              onClick={() => window.location.reload()}
              className="text-[10px] font-semibold uppercase tracking-widest text-white/30 hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-5 py-4 animate-pulse">
                  <div className="h-4 w-20 bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-5 py-8 text-center">
              <p className="text-sm text-white/30">No tokens in pool.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((t) => {
                const balance = getBalance(t.mint);
                return (
                  <div
                    key={t.mint}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-5 py-4"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-white">{t.name}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{t.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono text-white/60">
                        {balance.toLocaleString(undefined, { maximumFractionDigits: t.decimals })}
                      </p>
                      <p className="text-[10px] text-white/20 mt-0.5">
                        Max {t.maxClaim.toLocaleString()} / 8h
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="w-full text-left border-t border-white/5 pt-6 mt-2">
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-[0.15em] mb-4">
            How to Refill
          </p>
          <div className="space-y-3">
            <p className="text-sm text-white/40 leading-relaxed">
              1. Copy the faucet authority address above.
            </p>
            <p className="text-sm text-white/40 leading-relaxed">
              2. Send tokens to that wallet&apos;s Associated Token Account on Devnet.
            </p>
            <p className="text-sm text-white/40 leading-relaxed">
              3. Click Refresh to see updated balances.
            </p>
          </div>
          <p className="text-xs text-white/20 mt-4">
            To add/remove tokens, edit <code className="text-white/40">data/list_token.json</code> and restart.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-6 left-0 right-0 text-center">
        <p className="text-[10px] text-white/20 tracking-widest uppercase">Solana Devnet</p>
      </div>
    </div>
  );
}
