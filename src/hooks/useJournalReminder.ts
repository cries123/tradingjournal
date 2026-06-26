import { useEffect, useRef } from 'react';
import type { Trade } from '../types';

function parseTime(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h ?? 16, minute: m ?? 0 };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasTradesToday(trades: Trade[]): boolean {
  const today = todayKey();
  return trades.some((t) => t.date === today);
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function useJournalReminder(
  enabled: boolean,
  reminderTime: string,
  trades: Trade[],
): void {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    void ensureNotificationPermission();

    const tick = () => {
      const now = new Date();
      const { hour, minute } = parseTime(reminderTime);
      const slotKey = `${todayKey()}-${hour}:${minute}`;

      if (now.getHours() !== hour || now.getMinutes() !== minute) return;
      if (firedRef.current === slotKey) return;
      if (hasTradesToday(trades)) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      firedRef.current = slotKey;
      new Notification('Trend Chasers — journal reminder', {
        body: 'Log today\'s trades before the market close review.',
        tag: 'journal-reminder',
      });
    };

    const id = window.setInterval(tick, 30_000);
    tick();
    return () => window.clearInterval(id);
  }, [enabled, reminderTime, trades]);
}
