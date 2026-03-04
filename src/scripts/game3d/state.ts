export interface GameState {
    isRunning: boolean;
    score: number;
    hintsRemaining: number;
    timeRemaining: number;
    inventory: string[];
    solvedPuzzles: Set<string>;
    activeModal: string | null;
    selectedItem: string | null;
    objective: string;
    gameWon: boolean;
}

const INITIAL_OBJECTIVE = 'Search the main lab and discover the hidden code.';

export const state: GameState = {
    isRunning: false,
    score: 0,
    hintsRemaining: 3,
    timeRemaining: 300,
    inventory: [],
    solvedPuzzles: new Set<string>(),
    activeModal: 'intro-modal',
    selectedItem: null,
    objective: INITIAL_OBJECTIVE,
    gameWon: false,
};

type StateObserver = (currentState: GameState, propertyChanged: keyof GameState) => void;
const observers: StateObserver[] = [];

export function subscribeToState(observer: StateObserver) {
    observers.push(observer);
}

export function updateState<K extends keyof GameState>(key: K, value: GameState[K]) {
    state[key] = value;
    for (const observer of observers) {
        observer(state, key);
    }
}

export function resetGameState() {
    updateState('isRunning', false);
    updateState('score', 0);
    updateState('hintsRemaining', 3);
    updateState('timeRemaining', 300);
    updateState('inventory', []);
    updateState('solvedPuzzles', new Set<string>());
    updateState('activeModal', 'intro-modal');
    updateState('selectedItem', null);
    updateState('objective', INITIAL_OBJECTIVE);
    updateState('gameWon', false);
}

export function addItem(itemId: string): boolean {
    if (state.inventory.includes(itemId)) {
        return false;
    }
    updateState('inventory', [...state.inventory, itemId]);
    return true;
}

export function removeItem(itemId: string): boolean {
    if (!state.inventory.includes(itemId)) {
        return false;
    }
    updateState('inventory', state.inventory.filter((item) => item !== itemId));
    if (state.selectedItem === itemId) {
        updateState('selectedItem', null);
    }
    return true;
}

export function checkHasItem(itemId: string): boolean {
    return state.inventory.includes(itemId);
}

export function markPuzzleSolved(puzzleId: string): boolean {
    if (state.solvedPuzzles.has(puzzleId)) {
        return false;
    }
    const nextSolved = new Set(state.solvedPuzzles);
    nextSolved.add(puzzleId);
    updateState('solvedPuzzles', nextSolved);
    return true;
}

export function checkPuzzleSolved(puzzleId: string): boolean {
    return state.solvedPuzzles.has(puzzleId);
}

export function addScore(points: number) {
    const nextScore = Math.max(0, state.score + Math.round(points));
    updateState('score', nextScore);
}
