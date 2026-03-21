export interface GameState {
    isRunning: boolean;
    isStarting: boolean;
    isPaused: boolean;
    raceFinished: boolean;
    mode: RaceMode;
    playerName: string;
    currentLap: number;
    totalLaps: number;
    activeModal: string | null;
    position: number;
}

export type RaceMode = 'time-attack' | 'drift-master';

const state: GameState = {
    isRunning: false,
    isStarting: false,
    isPaused: false,
    raceFinished: false,
    mode: 'time-attack',
    playerName: 'ROOKIE',
    currentLap: 1,
    totalLaps: 3,
    activeModal: null,
    position: 1,
};

export function updateState<K extends keyof GameState>(key: K, value: GameState[K]) {
    state[key] = value;
}

export function resetState() {
    state.isRunning = false;
    state.isStarting = false;
    state.isPaused = false;
    state.raceFinished = false;
    state.currentLap = 1;
    state.activeModal = null;
    state.position = 1;
}

export { state };
