export type RunMode = 'story' | 'hardcore' | 'daily';

export interface ModeConfig {
    label: string;
    timeLimitSeconds: number;
    hintBudget: number;
    hintPenalty: number;
    laserPenalty: number;
    laserResetRoom: 'room1' | 'room2';
    scoreMultiplier: number;
    description: string;
}

export const DEFAULT_MODE: RunMode = 'story';

export const MODE_CONFIGS: Record<RunMode, ModeConfig> = {
    story: {
        label: 'Story Ops',
        timeLimitSeconds: 300,
        hintBudget: 3,
        hintPenalty: 55,
        laserPenalty: 90,
        laserResetRoom: 'room2',
        scoreMultiplier: 1,
        description: 'Balanced run with full hint support.',
    },
    hardcore: {
        label: 'Hardcore Protocol',
        timeLimitSeconds: 240,
        hintBudget: 1,
        hintPenalty: 90,
        laserPenalty: 130,
        laserResetRoom: 'room1',
        scoreMultiplier: 1.24,
        description: 'Short timer, limited hints, harsher failures.',
    },
    daily: {
        label: 'Daily Seed',
        timeLimitSeconds: 300,
        hintBudget: 2,
        hintPenalty: 70,
        laserPenalty: 100,
        laserResetRoom: 'room2',
        scoreMultiplier: 1.12,
        description: 'Shared deterministic seed for daily leaderboard attempts.',
    },
};

export function formatModeLabel(mode: RunMode): string {
    return MODE_CONFIGS[mode].label;
}
