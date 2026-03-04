export type ScoreRank = 'S' | 'A' | 'B' | 'C';

export interface RunMetrics {
    timeRemaining: number;
    hintsUsed: number;
    laserHits: number;
    keypadMistakes: number;
    routingAttempts: number;
    cipherMistakes: number;
    chainPeak: number;
    modeMultiplier?: number;
}

export interface RunBonusOutcome {
    timeBonus: number;
    disciplineBonus: number;
    stealthBonus: number;
    efficiencyBonus: number;
    chainBonus: number;
    totalBonus: number;
    optionalGoals: {
        noHints: boolean;
        noLaserHits: boolean;
        fastExit: boolean;
        cleanSolve: boolean;
    };
}

const FAST_EXIT_SECONDS = 120;
const CLEAN_ROUTING_ATTEMPTS = 6;

export function computeRunBonus(metrics: RunMetrics): RunBonusOutcome {
    const hintsUsed = Math.max(0, metrics.hintsUsed);
    const laserHits = Math.max(0, metrics.laserHits);
    const keypadMistakes = Math.max(0, metrics.keypadMistakes);
    const routingAttempts = Math.max(0, metrics.routingAttempts);
    const cipherMistakes = Math.max(0, metrics.cipherMistakes);
    const modeMultiplier = Math.max(1, metrics.modeMultiplier ?? 1);

    const timeBonus = Math.max(0, Math.round(metrics.timeRemaining * 4));
    const disciplineBonus = hintsUsed === 0 ? 220 : hintsUsed === 1 ? 80 : 0;
    const stealthBonus = laserHits === 0 ? 180 : laserHits === 1 ? 70 : 0;
    const efficiencyBonus = Math.max(
        0,
        260
            - Math.max(0, routingAttempts - CLEAN_ROUTING_ATTEMPTS) * 16
            - keypadMistakes * 28
            - cipherMistakes * 60,
    );
    const chainBonus = Math.max(0, Math.round((Math.max(1, metrics.chainPeak) - 1) * 45));

    const baseBonus = timeBonus + disciplineBonus + stealthBonus + efficiencyBonus + chainBonus;
    const totalBonus = Math.round(baseBonus * modeMultiplier);

    return {
        timeBonus,
        disciplineBonus,
        stealthBonus,
        efficiencyBonus,
        chainBonus,
        totalBonus,
        optionalGoals: {
            noHints: hintsUsed === 0,
            noLaserHits: laserHits === 0,
            fastExit: metrics.timeRemaining >= FAST_EXIT_SECONDS,
            cleanSolve: routingAttempts <= CLEAN_ROUTING_ATTEMPTS
                && keypadMistakes === 0
                && cipherMistakes === 0,
        },
    };
}

export function scoreToRank(finalScore: number): ScoreRank {
    if (finalScore >= 3000) {
        return 'S';
    }
    if (finalScore >= 2400) {
        return 'A';
    }
    if (finalScore >= 1700) {
        return 'B';
    }
    return 'C';
}
