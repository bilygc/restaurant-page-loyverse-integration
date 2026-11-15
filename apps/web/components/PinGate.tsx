'use client';

import { useState, type FormEvent } from 'react';
import { M } from '@/lib/messages';

/**
 * Runtime PIN gate. The PIN is entered by the operator, held only in this
 * component's state / the parent's React memory (never localStorage, cookie,
 * env or bundle) and forwarded as the KITCHEN_PIN header by the proxy.
 */
export function PinGate({
  invalid,
  onUnlock,
}: {
  invalid: boolean;
  onUnlock: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = pin.trim();
    if (trimmed.length === 0) return;
    onUnlock(trimmed); // synchronous user gesture -> unlocks audio / wake lock
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200"
        aria-labelledby="pin-heading"
      >
        <h1 id="pin-heading" className="text-2xl font-bold text-slate-900">
          {M.pinGateHeading}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{M.pinGateSubtitle}</p>

        <div className="mt-6 flex flex-col gap-2">
          <label htmlFor="kitchen-pin" className="text-sm font-medium text-slate-700">
            {M.pinLabel}
          </label>
          <input
            id="kitchen-pin"
            name="kitchen-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={M.pinPlaceholder}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'pin-error' : 'pin-hint'}
            className="min-h-[48px] rounded-xl border border-slate-300 px-4 text-lg tracking-widest text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          {invalid ? (
            <p id="pin-error" role="alert" className="text-sm font-medium text-red-700">
              {M.pinInvalid}
            </p>
          ) : (
            <p id="pin-hint" className="text-xs text-slate-500">
              {M.pinHint}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="mt-6 min-h-[48px] w-full rounded-xl bg-slate-900 px-4 text-base font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
        >
          {M.pinSubmit}
        </button>
      </form>
    </main>
  );
}
