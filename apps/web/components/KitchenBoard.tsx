'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KitchenOrderView, KitchenState } from '@restaurant/shared';
import { KitchenCard } from './KitchenCard';
import { PinGate } from './PinGate';
import { ApiError, advanceKitchenState, fetchKitchenColumn } from '@/lib/client-api';
import { newOrderIds } from '@/lib/board';
import { BOARD_COLUMNS, columnAccentClass, columnTitle, nextState } from '@/lib/kitchen';
import { M } from '@/lib/messages';

const POLL_INTERVAL_MS = 5000;

type Status = 'loading' | 'ready' | 'error';
type Columns = Record<KitchenState, KitchenOrderView[]>;

function emptyColumns(): Columns {
  return { nuevo: [], en_preparacion: [], listo: [], entregado: [] };
}

interface WakeSentinel {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

function audioConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export function KitchenBoard() {
  // PIN lives ONLY in React memory (never localStorage/cookie/env/bundle).
  const [pin, setPin] = useState<string | null>(null);
  const [pinInvalid, setPinInvalid] = useState(false);

  const [columns, setColumns] = useState<Columns>(emptyColumns);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [wakeActive, setWakeActive] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const audioRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeSentinel | null>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const inFlightRef = useRef(false);
  const pollRef = useRef<() => void>(() => {});

  // ---- Audio (unlocked by the PIN-submit user gesture) ----
  const unlockAudio = useCallback(() => {
    const Ctor = audioConstructor();
    if (!Ctor) return;
    let ctx = audioRef.current;
    if (!ctx) {
      try {
        ctx = new Ctor();
        audioRef.current = ctx;
      } catch {
        return;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    // A near-silent tone completes the unlock on iOS Safari.
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    } catch {
      /* best-effort */
    }
  }, []);

  const playChime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    try {
      const t0 = ctx.currentTime;
      const tones: Array<[number, number]> = [
        [880, 0],
        [1174.66, 0.16],
      ];
      for (const [freq, offset] of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0 + offset);
        gain.gain.setValueAtTime(0.0001, t0 + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0 + offset);
        osc.stop(t0 + offset + 0.36);
      }
    } catch {
      /* audio is best-effort; the board must keep working without it */
    }
  }, []);

  // ---- Keep the tablet screen awake (best-effort, needs secure context) ----
  const requestWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> };
    };
    if (!nav.wakeLock) {
      setWakeActive(false);
      return;
    }
    try {
      const sentinel = await nav.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeActive(true);
      sentinel.addEventListener('release', () => setWakeActive(false));
    } catch {
      setWakeActive(false);
    }
  }, []);

  // ---- Ticking elapsed timers ----
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- Release audio / wake lock on unmount ----
  useEffect(
    () => () => {
      try {
        void wakeLockRef.current?.release().catch(() => {});
      } catch {
        /* ignore */
      }
      try {
        void audioRef.current?.close().catch(() => {});
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // ---- Polling every 5s, one filtered GET per column (plan.md §9.2) ----
  useEffect(() => {
    if (!pin) return;
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const results = await Promise.all(
          BOARD_COLUMNS.map((state) => fetchKitchenColumn(state, pin, controller.signal)),
        );
        if (cancelled) return;

        const next = emptyColumns();
        BOARD_COLUMNS.forEach((state, i) => {
          next[state] = results[i];
        });
        const allIds = results.flat().map((order) => order.id);
        const nuevoIds = next.nuevo.map((order) => order.id);
        const fresh = newOrderIds(seenIdsRef.current, nuevoIds);
        seenIdsRef.current = new Set(allIds);

        setColumns(next);
        setStatus('ready');
        setErrorMsg(null);

        if (fresh.length > 0) {
          playChime();
          setAnnouncement(
            `${M.newOrderAnnouncement} (${fresh.length}) — ${new Date().toLocaleTimeString('es-MX')}`,
          );
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 403) {
          // Wrong / expired PIN -> back to the gate.
          setPin(null);
          setPinInvalid(true);
          seenIdsRef.current = null;
          setColumns(emptyColumns());
          setStatus('loading');
          return;
        }
        // Network / 5xx / API down: keep last good columns, show a retry banner.
        setStatus('error');
        setErrorMsg(M.connectionError);
      } finally {
        inFlightRef.current = false;
      }
    };

    pollRef.current = () => {
      void run();
    };
    void run();
    const interval = setInterval(() => {
      void run();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [pin, playChime]);

  // ---- Actions ----
  const handleUnlock = useCallback(
    (entered: string) => {
      unlockAudio(); // must happen inside the user gesture
      void requestWakeLock();
      setPinInvalid(false);
      setPin(entered);
    },
    [unlockAudio, requestWakeLock],
  );

  const handleLock = useCallback(() => {
    try {
      void wakeLockRef.current?.release().catch(() => {});
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null;
    setWakeActive(false);
    setPin(null);
    setPinInvalid(false);
    seenIdsRef.current = null;
    setColumns(emptyColumns());
    setStatus('loading');
    setErrorMsg(null);
  }, []);

  const handleAdvance = useCallback(
    async (order: KitchenOrderView) => {
      if (!pin) return;
      const next = nextState(order.kitchen_state);
      if (next === null) return;
      setPendingIds((prev) => new Set(prev).add(order.id));
      try {
        await advanceKitchenState(order.id, next, pin);
        pollRef.current?.(); // refresh immediately after the transition
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setPin(null);
          setPinInvalid(true);
          seenIdsRef.current = null;
          setStatus('loading');
        } else {
          setStatus('error');
          setErrorMsg(M.connectionError);
          pollRef.current?.(); // reconcile a possibly stale state
        }
      } finally {
        setPendingIds((prev) => {
          const copy = new Set(prev);
          copy.delete(order.id);
          return copy;
        });
      }
    },
    [pin],
  );

  const handleTestSound = useCallback(() => {
    unlockAudio();
    playChime();
  }, [unlockAudio, playChime]);

  // ---- Render ----
  if (!pin) {
    return <PinGate invalid={pinInvalid} onUnlock={handleUnlock} />;
  }

  const isInitialLoading =
    status === 'loading' && BOARD_COLUMNS.every((state) => columns[state].length === 0);

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>

      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{M.kitchenHeading}</h1>
          <p className="text-xs text-slate-600">{M.awakeHint}</p>
          <p className={`text-xs font-medium ${wakeActive ? 'text-emerald-700' : 'text-amber-700'}`}>
            {wakeActive ? M.wakeActive : M.wakeUnsupported}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestSound}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {M.testSoundButton}
          </button>
          <button
            type="button"
            onClick={handleLock}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {M.lockButton}
          </button>
        </div>
      </header>

      {status === 'error' && errorMsg ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => pollRef.current?.()}
            className="min-h-[40px] rounded-md bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {M.retryNow}
          </button>
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="rounded-xl bg-white p-10 text-center text-slate-600 ring-1 ring-slate-200">
          <p className="text-base font-medium">{M.loading}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {BOARD_COLUMNS.map((state) => (
            <section
              key={state}
              aria-label={columnTitle(state)}
              className={`flex flex-col rounded-2xl border-t-4 bg-white/70 p-3 shadow-sm ring-1 ring-slate-200 ${columnAccentClass(state)}`}
            >
              <h2 className="mb-3 flex items-center justify-between text-base font-bold text-slate-800">
                {columnTitle(state)}
                <span className="ml-2 inline-flex min-w-[1.75rem] justify-center rounded-full bg-slate-200 px-2 py-0.5 text-sm tabular-nums text-slate-700">
                  {columns[state].length}
                </span>
              </h2>
              <div className="flex flex-col gap-3 md:max-h-[calc(100vh-10rem)] md:overflow-y-auto">
                {columns[state].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                    {M.emptyColumn}
                  </p>
                ) : (
                  columns[state].map((order) => (
                    <KitchenCard
                      key={order.id}
                      order={order}
                      now={now}
                      pending={pendingIds.has(order.id)}
                      onAdvance={handleAdvance}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
