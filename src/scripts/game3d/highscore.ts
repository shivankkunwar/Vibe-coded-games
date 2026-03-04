import type { ScoreRank } from './scoring';
import type { RunMode } from './modes';

const DEFAULT_NAME = 'ANON';

const sessionHighScores: Record<RunMode, HighScoreRecord | null> = {
    story: null,
    hardcore: null,
    daily: null,
};

export interface HighScoreRecord {
    name: string;
    score: number;
    rank: ScoreRank;
    seed: string;
    achievedAt: string;
    mode: RunMode;
}

export function loadHighScore(mode: RunMode): HighScoreRecord | null {
    const record = sessionHighScores[mode];
    if (!record) {
        return null;
    }

    return {
        ...record,
        name: normalizeChampionName(record.name),
        score: Math.max(0, Math.round(record.score)),
        rank: normalizeRank(record.rank),
    };
}

export function saveHighScore(record: HighScoreRecord) {
    sessionHighScores[record.mode] = {
        ...record,
        name: normalizeChampionName(record.name),
        score: Math.max(0, Math.round(record.score)),
        rank: normalizeRank(record.rank),
    };
}

export function shouldReplaceHighScore(score: number, current: HighScoreRecord | null): boolean {
    if (!current) {
        return true;
    }
    if (score === current.score) {
        return false;
    }
    return score > current.score;
}

export function formatHighScoreLabel(record: HighScoreRecord | null): string {
    if (!record) {
        return '---';
    }
    return `${record.name} ${record.score}`;
}

export function normalizeChampionName(raw: string | null | undefined): string {
    const cleaned = (raw ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
        .slice(0, 14);
    return cleaned || DEFAULT_NAME;
}

function normalizeRank(raw: string): ScoreRank {
    if (raw === 'S' || raw === 'A' || raw === 'B' || raw === 'C') {
        return raw;
    }
    return 'C';
}
