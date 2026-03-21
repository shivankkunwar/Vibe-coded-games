import type { RaceMode } from './state';

export interface BestLapRecord {
    name: string;
    time: number;
    mode: RaceMode;
    achievedAt: string;
}

const STORAGE_KEY_TIME_ATTACK = 'neon-drift-best-time-attack';
const STORAGE_KEY_DRIFT_MASTER = 'neon-drift-best-drift-master';

function getStorageItemSafe(key: string): string | null {
    try {
        if (typeof window === 'undefined' || !('localStorage' in window)) {
            return null;
        }
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function setStorageItemSafe(key: string, value: string): void {
    try {
        if (typeof window === 'undefined' || !('localStorage' in window)) {
            return;
        }
        window.localStorage.setItem(key, value);
    } catch {
        return;
    }
}

function getStorageKey(mode: RaceMode): string {
    return mode === 'time-attack' ? STORAGE_KEY_TIME_ATTACK : STORAGE_KEY_DRIFT_MASTER;
}

export function loadBestLap(mode: RaceMode): BestLapRecord | null {
    const key = getStorageKey(mode);
    const data = getStorageItemSafe(key);
    if (!data) return null;

    try {
        const parsed = JSON.parse(data) as BestLapRecord;
        if (!parsed.name || typeof parsed.time !== 'number') {
            return null;
        }

        return {
            name: parsed.name,
            time: parsed.time,
            mode,
            achievedAt: parsed.achievedAt || new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

export function saveBestLap(record: BestLapRecord) {
    const key = getStorageKey(record.mode);
    setStorageItemSafe(key, JSON.stringify(record));
}

export function formatLapTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '--:--.--';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export const formatSessionTime = formatLapTime;
