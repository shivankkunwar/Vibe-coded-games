import type { RunMode } from './modes';

export type PuzzleId =
    | 'room1-discovery'
    | 'sector-keypad'
    | 'laser-routing'
    | 'storage-cipher'
    | 'vault-power'
    | 'exit-protocol';

export type PuzzleStatus = 'locked' | 'active' | 'solved';
export type MirrorOrientation = 0 | 1 | 2 | 3;

interface PuzzleEntry {
    id: PuzzleId;
    status: PuzzleStatus;
    attempts: number;
}

const ROUTING_HEADINGS = ['N', 'E', 'S', 'W'] as const;

function mulberry32(seed: number) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class PuzzleDirector {
    private readonly runSeed: number;
    private readonly rng: () => number;
    private readonly puzzleStates: Map<PuzzleId, PuzzleEntry>;
    private readonly laserRoutingSolution: [MirrorOrientation, MirrorOrientation, MirrorOrientation];
    private readonly keypadCode: string;

    constructor(seed: number) {
        this.runSeed = seed;
        this.rng = mulberry32(seed);
        this.puzzleStates = new Map<PuzzleId, PuzzleEntry>();

        const ids: PuzzleId[] = [
            'room1-discovery',
            'sector-keypad',
            'laser-routing',
            'storage-cipher',
            'vault-power',
            'exit-protocol',
        ];
        for (const id of ids) {
            this.puzzleStates.set(id, { id, status: 'locked', attempts: 0 });
        }

        this.laserRoutingSolution = [
            this.rollOrientation(),
            this.rollOrientation(),
            this.rollOrientation(),
        ];

        // Avoid a low-entropy sequence where all mirrors match at spawn.
        if (
            this.laserRoutingSolution[0] === this.laserRoutingSolution[1]
            && this.laserRoutingSolution[1] === this.laserRoutingSolution[2]
        ) {
            this.laserRoutingSolution[2] = ((this.laserRoutingSolution[2] + 1) % 4) as MirrorOrientation;
        }

        this.keypadCode = this.generateKeypadCode();
    }

    getSeedLabel(): string {
        return String(this.runSeed).padStart(8, '0');
    }

    getLaserRoutingSolution(): [MirrorOrientation, MirrorOrientation, MirrorOrientation] {
        return [...this.laserRoutingSolution] as [MirrorOrientation, MirrorOrientation, MirrorOrientation];
    }

    getKeypadCode(): string {
        return this.keypadCode;
    }

    getKeypadTeaser(): string {
        return `${this.keypadCode[0]} _ ${this.keypadCode[2]} _`;
    }

    markActive(id: PuzzleId) {
        const entry = this.puzzleStates.get(id);
        if (!entry || entry.status === 'solved') {
            return;
        }
        entry.status = 'active';
    }

    markSolved(id: PuzzleId) {
        const entry = this.puzzleStates.get(id);
        if (!entry) {
            return;
        }
        entry.status = 'solved';
    }

    registerAttempt(id: PuzzleId) {
        const entry = this.puzzleStates.get(id);
        if (!entry) {
            return;
        }
        entry.attempts += 1;
    }

    getStatus(id: PuzzleId): PuzzleStatus {
        return this.puzzleStates.get(id)?.status ?? 'locked';
    }

    getAttempts(id: PuzzleId): number {
        return this.puzzleStates.get(id)?.attempts ?? 0;
    }

    isLaserRoutingSolved(
        orientations: readonly MirrorOrientation[],
    ): boolean {
        if (orientations.length < 3) {
            return false;
        }
        return orientations[0] === this.laserRoutingSolution[0]
            && orientations[1] === this.laserRoutingSolution[1]
            && orientations[2] === this.laserRoutingSolution[2];
    }

    getLaserRoutingHint(hintLevel: number): string {
        const [a, b, c] = this.laserRoutingSolution;
        if (hintLevel <= 1) {
            return `Mirror 2 should face ${ROUTING_HEADINGS[b]}.`;
        }
        if (hintLevel === 2) {
            return `Mirror 1 = ${ROUTING_HEADINGS[a]}, Mirror 3 = ${ROUTING_HEADINGS[c]}.`;
        }
        return `Full calibration: M1 ${ROUTING_HEADINGS[a]} -> M2 ${ROUTING_HEADINGS[b]} -> M3 ${ROUTING_HEADINGS[c]}.`;
    }

    getKeypadHint(hintLevel: number): string {
        if (hintLevel <= 1) {
            return `Keypad code starts with ${this.keypadCode[0]} and ends with ${this.keypadCode[3]}.`;
        }
        if (hintLevel === 2) {
            return `Keypad mid digits are ${this.keypadCode[1]} and ${this.keypadCode[2]}.`;
        }
        return `Full keypad code: ${this.keypadCode}.`;
    }

    getRoutingOrientationLabel(orientation: MirrorOrientation): string {
        return ROUTING_HEADINGS[orientation];
    }

    private rollOrientation(): MirrorOrientation {
        return Math.floor(this.rng() * 4) as MirrorOrientation;
    }

    private generateKeypadCode(): string {
        const seedCore = Number(this.getSeedLabel().slice(2, 6));
        const [a, b, c] = this.laserRoutingSolution;
        const checksum = a * 111 + b * 37 + c * 19;
        const value = ((seedCore + checksum) % 9000) + 1000;
        return String(value).padStart(4, '0');
    }
}

export function generateRunSeed(mode: RunMode): number {
    if (mode === 'daily') {
        const now = new Date();
        const y = now.getUTCFullYear();
        const m = now.getUTCMonth() + 1;
        const d = now.getUTCDate();
        const stamp = y * 10000 + m * 100 + d;
        return (stamp * 7919) % 100000000;
    }

    const timePart = Date.now() % 100000000;
    const randomPart = Math.floor(Math.random() * 10000);
    const modeSalt = mode === 'hardcore' ? 6113 : 3571;
    return (timePart + randomPart + modeSalt) % 100000000;
}
