import { resetGameState, state, subscribeToState, updateState } from './state';
import type { ScoreRank } from './scoring';
import type { RunMode } from './modes';
import { DEFAULT_MODE } from './modes';
import { normalizeChampionName } from './highscore';

interface UIHandlers {
    onStart: (setup: RunSetup) => void;
    onResume: () => void;
    onRestart: () => void;
    onModePreview?: (mode: RunMode) => void;
    onKeypadSubmit: (code: string) => boolean;
    onCipherSubmit: (answer: string) => boolean;
    onUseHint: () => string | null;
}

export interface RunSetup {
    mode: RunMode;
    playerName: string;
}

export type MissionStepId = 'm1' | 'm2' | 'm3' | 'm4';
type MissionStatus = 'pending' | 'active' | 'done';
export type BonusStepId = 'b1' | 'b2' | 'b3' | 'b4';
type BonusStatus = 'pending' | 'done' | 'failed';

export interface VictorySummary {
    finalScore: number;
    rank: ScoreRank;
    bestScoreLabel: string;
    newRecord: boolean;
    timeBonus: number;
    disciplineBonus: number;
    stealthBonus: number;
    efficiencyBonus: number;
    chainBonus: number;
}

let handlers: UIHandlers | null = null;

const elements = {
    timerDisplay: document.getElementById('timer-display'),
    scoreValue: document.getElementById('score-value'),
    hintsValue: document.getElementById('hints-value'),
    objectiveText: document.getElementById('objective-text'),
    crosshair: document.getElementById('crosshair'),
    loadingBar: document.getElementById('loading-bar'),
    loadingText: document.getElementById('loading-text'),
    startBtn: document.getElementById('start-btn'),
    inventoryBar: document.getElementById('inventory-bar'),
    notificationArea: document.getElementById('notification-area'),
    screenFlash: document.getElementById('screen-flash'),
    noteBody: document.getElementById('note-body'),
    keypadInput: document.getElementById('keypad-input') as HTMLInputElement | null,
    keypadFeedback: document.getElementById('keypad-feedback'),
    cipherInput: document.getElementById('cipher-input') as HTMLInputElement | null,
    cipherFeedback: document.getElementById('cipher-feedback'),
    hintBtn: document.getElementById('use-hint-btn'),
    quickHintBtn: document.getElementById('quick-hint-btn'),
    runSeedValue: document.getElementById('run-seed-value'),
    runModeValue: document.getElementById('run-mode-value'),
    sessionChampionValue: document.getElementById('session-champion-value'),
    pilotNameInput: document.getElementById('pilot-name-input') as HTMLInputElement | null,
    bestScoreValue: document.getElementById('best-score-value'),
    victoryScoreValue: document.getElementById('victory-score-value'),
    victoryRankValue: document.getElementById('victory-rank-value'),
    victoryBestValue: document.getElementById('victory-best-value'),
    victoryRecordBadge: document.getElementById('victory-record-badge'),
    victoryTimeBonus: document.getElementById('victory-time-bonus'),
    victoryDisciplineBonus: document.getElementById('victory-discipline-bonus'),
    victoryStealthBonus: document.getElementById('victory-stealth-bonus'),
    victoryEfficiencyBonus: document.getElementById('victory-efficiency-bonus'),
    victoryChainBonus: document.getElementById('victory-chain-bonus'),
    missionStep1: document.getElementById('mission-step-1'),
    missionStep2: document.getElementById('mission-step-2'),
    missionStep3: document.getElementById('mission-step-3'),
    missionStep4: document.getElementById('mission-step-4'),
    bonusStep1: document.getElementById('bonus-step-1'),
    bonusStep2: document.getElementById('bonus-step-2'),
    bonusStep3: document.getElementById('bonus-step-3'),
    bonusStep4: document.getElementById('bonus-step-4'),
};

const modalIds = [
    'intro-modal',
    'note-modal',
    'keypad-modal',
    'cipher-modal',
    'pause-modal',
    'victory-modal',
    'gameover-modal',
];

export function initUI(nextHandlers: UIHandlers) {
    handlers = nextHandlers;
    resetGameState();

    subscribeToState((currentState, prop) => {
        switch (prop) {
            case 'timeRemaining':
                updateTimer(currentState.timeRemaining);
                break;
            case 'score':
                if (elements.scoreValue) {
                    elements.scoreValue.textContent = String(currentState.score);
                }
                break;
            case 'hintsRemaining':
                if (elements.hintsValue) {
                    elements.hintsValue.textContent = String(currentState.hintsRemaining);
                }
                if (elements.hintBtn instanceof HTMLButtonElement) {
                    elements.hintBtn.disabled = currentState.hintsRemaining <= 0;
                }
                if (elements.quickHintBtn instanceof HTMLButtonElement) {
                    elements.quickHintBtn.disabled = currentState.hintsRemaining <= 0;
                }
                break;
            case 'inventory':
            case 'selectedItem':
                renderInventory(currentState.inventory, currentState.selectedItem);
                break;
            case 'activeModal':
                updateModals(currentState.activeModal);
                break;
            case 'objective':
                if (elements.objectiveText) {
                    elements.objectiveText.textContent = currentState.objective;
                }
                break;
        }
    });

    wireButtons();

    updateTimer(state.timeRemaining);
    renderInventory(state.inventory, state.selectedItem);
    updateModals(state.activeModal);
    if (elements.objectiveText) {
        elements.objectiveText.textContent = state.objective;
    }
    setMissionStep('m1', 'active');
    setMissionStep('m2', 'pending');
    setMissionStep('m3', 'pending');
    setMissionStep('m4', 'pending');
    setBonusStep('b1', 'pending');
    setBonusStep('b2', 'pending');
    setBonusStep('b3', 'pending');
    setBonusStep('b4', 'pending');
    handlers?.onModePreview?.(getSelectedMode());

    document.addEventListener('keydown', (event) => {
        if (!state.isRunning) {
            return;
        }

        if (event.code === 'Escape') {
            if (state.activeModal === null) {
                updateState('activeModal', 'pause-modal');
                return;
            }
            if (state.activeModal === 'pause-modal') {
                updateState('activeModal', null);
                handlers?.onResume();
            }
            return;
        }

        if (event.code === 'KeyH') {
            if (event.repeat || state.activeModal || state.gameWon || isTypingTarget(event.target)) {
                return;
            }
            event.preventDefault();
            triggerHintUse();
        }
    });
}

function wireButtons() {
    elements.startBtn?.addEventListener('click', () => {
        const selectedMode = getSelectedMode();
        const playerName = normalizeChampionName(elements.pilotNameInput?.value);
        if (elements.pilotNameInput) {
            elements.pilotNameInput.value = playerName;
        }

        updateState('isRunning', true);
        updateState('activeModal', null);
        handlers?.onStart({
            mode: selectedMode,
            playerName,
        });
    });

    const modeInputs = document.querySelectorAll<HTMLInputElement>('input[name="run-mode"]');
    modeInputs.forEach((input) => {
        input.addEventListener('change', () => {
            handlers?.onModePreview?.(getSelectedMode());
        });
    });

    document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => {
            updateState('activeModal', null);
            if (state.isRunning) {
                handlers?.onResume();
            }
        });
    });

    const resumeBtn = document.getElementById('resume-btn');
    resumeBtn?.addEventListener('click', () => {
        updateState('activeModal', null);
        handlers?.onResume();
    });

    const restartButtons = document.querySelectorAll<HTMLElement>('[data-restart-game]');
    restartButtons.forEach((button) => {
        button.addEventListener('click', () => {
            handlers?.onRestart();
        });
    });

    const keypadSubmit = document.getElementById('keypad-submit');
    keypadSubmit?.addEventListener('click', () => {
        const value = (elements.keypadInput?.value ?? '').trim();
        const isCorrect = handlers?.onKeypadSubmit(value) ?? false;
        if (isCorrect) {
            if (elements.keypadFeedback) {
                elements.keypadFeedback.textContent = 'Accepted. Storage terminal unlocked.';
            }
            if (elements.keypadInput) {
                elements.keypadInput.value = '';
            }
            setTimeout(() => {
                if (state.activeModal === 'keypad-modal') {
                    updateState('activeModal', null);
                    handlers?.onResume();
                }
            }, 400);
            return;
        }
        if (elements.keypadFeedback) {
            elements.keypadFeedback.textContent = 'Incorrect code.';
        }
    });

    const cipherSubmit = document.getElementById('cipher-submit');
    cipherSubmit?.addEventListener('click', () => {
        const value = (elements.cipherInput?.value ?? '').trim();
        const isCorrect = handlers?.onCipherSubmit(value) ?? false;
        if (isCorrect) {
            if (elements.cipherFeedback) {
                elements.cipherFeedback.textContent = 'Cipher solved. Director safe unlocked.';
            }
            if (elements.cipherInput) {
                elements.cipherInput.value = '';
            }
            setTimeout(() => {
                if (state.activeModal === 'cipher-modal') {
                    updateState('activeModal', null);
                    handlers?.onResume();
                }
            }, 400);
            return;
        }
        if (elements.cipherFeedback) {
            elements.cipherFeedback.textContent = 'Incorrect phrase.';
        }
    });

    const hintButtons = [elements.hintBtn, elements.quickHintBtn].filter(
        (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
    );
    hintButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (state.activeModal && state.activeModal !== 'pause-modal') {
                return;
            }
            triggerHintUse();
        });
    });
}

export function updateLoadingProgress(progress: number) {
    const clamped = Math.max(0, Math.min(progress, 1));
    if (elements.loadingBar) {
        elements.loadingBar.style.width = `${Math.round(clamped * 100)}%`;
    }
    if (elements.loadingText) {
        elements.loadingText.textContent = `Loading Systems (${Math.round(clamped * 100)}%)`;
    }
    if (clamped >= 1 && elements.startBtn) {
        if (elements.loadingText) {
            elements.loadingText.textContent = 'All systems ready.';
        }
        elements.startBtn.style.display = 'inline-flex';
    }
}

export function showNotification(
    message: string,
    type: 'info' | 'success' | 'error' | 'warn' = 'info',
) {
    if (!elements.notificationArea) {
        return;
    }
    const toast = document.createElement('div');
    toast.className = `game-toast ${type}`;
    toast.textContent = message;
    elements.notificationArea.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
        }, 220);
    }, 2200);
}

export function triggerScreenFlash(color: 'green' | 'red') {
    if (!elements.screenFlash) {
        return;
    }
    elements.screenFlash.classList.remove('flash-green', 'flash-red');
    void elements.screenFlash.offsetWidth;
    elements.screenFlash.classList.add(color === 'green' ? 'flash-green' : 'flash-red');
}

export function setCrosshairInteractable(isInteractable: boolean) {
    if (!elements.crosshair) {
        return;
    }
    elements.crosshair.classList.toggle('interactable', isInteractable);
}

export function showNote(text: string) {
    if (elements.noteBody) {
        elements.noteBody.textContent = text;
    }
    updateState('activeModal', 'note-modal');
}

export function openModal(modalId: string) {
    updateState('activeModal', modalId);
}

export function setObjective(text: string) {
    updateState('objective', text);
}

export function setRunSeed(seedLabel: string) {
    if (elements.runSeedValue) {
        elements.runSeedValue.textContent = seedLabel;
    }
}

export function setRunModeLabel(modeLabel: string) {
    if (elements.runModeValue) {
        elements.runModeValue.textContent = modeLabel;
    }
}

export function setSessionChampionLabel(label: string) {
    if (elements.sessionChampionValue) {
        elements.sessionChampionValue.textContent = label;
    }
}

export function setBestScoreLabel(label: string) {
    if (elements.bestScoreValue) {
        elements.bestScoreValue.textContent = label;
    }
}

export function setMissionStep(step: MissionStepId, status: MissionStatus) {
    const stepElementMap: Record<MissionStepId, HTMLElement | null> = {
        m1: elements.missionStep1,
        m2: elements.missionStep2,
        m3: elements.missionStep3,
        m4: elements.missionStep4,
    };
    const stepEl = stepElementMap[step];
    if (!stepEl) {
        return;
    }

    stepEl.classList.remove('pending', 'active', 'done');
    stepEl.classList.add(status);

    const marker = stepEl.querySelector<HTMLElement>('.mission-marker');
    if (!marker) {
        return;
    }
    if (status === 'done') {
        marker.textContent = 'OK';
    } else if (status === 'active') {
        marker.textContent = '>>';
    } else {
        marker.textContent = '..';
    }
}

export function setBonusStep(step: BonusStepId, status: BonusStatus) {
    const stepElementMap: Record<BonusStepId, HTMLElement | null> = {
        b1: elements.bonusStep1,
        b2: elements.bonusStep2,
        b3: elements.bonusStep3,
        b4: elements.bonusStep4,
    };
    const stepEl = stepElementMap[step];
    if (!stepEl) {
        return;
    }

    stepEl.classList.remove('pending', 'done', 'failed');
    stepEl.classList.add(status);

    const marker = stepEl.querySelector<HTMLElement>('.mission-marker');
    if (!marker) {
        return;
    }
    if (status === 'done') {
        marker.textContent = 'OK';
    } else if (status === 'failed') {
        marker.textContent = 'XX';
    } else {
        marker.textContent = '..';
    }
}

export function setVictorySummary(summary: VictorySummary) {
    if (elements.victoryScoreValue) {
        elements.victoryScoreValue.textContent = String(summary.finalScore);
    }
    if (elements.victoryRankValue) {
        elements.victoryRankValue.textContent = summary.rank;
    }
    if (elements.victoryBestValue) {
        elements.victoryBestValue.textContent = summary.bestScoreLabel;
    }
    if (elements.victoryRecordBadge) {
        elements.victoryRecordBadge.textContent = summary.newRecord ? 'NEW HIGH SCORE' : '';
    }
    if (elements.victoryTimeBonus) {
        elements.victoryTimeBonus.textContent = `+${summary.timeBonus}`;
    }
    if (elements.victoryDisciplineBonus) {
        elements.victoryDisciplineBonus.textContent = `+${summary.disciplineBonus}`;
    }
    if (elements.victoryStealthBonus) {
        elements.victoryStealthBonus.textContent = `+${summary.stealthBonus}`;
    }
    if (elements.victoryEfficiencyBonus) {
        elements.victoryEfficiencyBonus.textContent = `+${summary.efficiencyBonus}`;
    }
    if (elements.victoryChainBonus) {
        elements.victoryChainBonus.textContent = `+${summary.chainBonus}`;
    }
}

function updateTimer(seconds: number) {
    if (!elements.timerDisplay) {
        return;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    elements.timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    elements.timerDisplay.classList.remove('warning', 'urgent');
    if (seconds <= 60) {
        elements.timerDisplay.classList.add('urgent');
    } else if (seconds <= 120) {
        elements.timerDisplay.classList.add('warning');
    }
}

function renderInventory(inventory: string[], selectedItem: string | null) {
    if (!elements.inventoryBar) {
        return;
    }
    elements.inventoryBar.innerHTML = '';
    for (let i = 0; i < 5; i += 1) {
        const slot = document.createElement('button');
        slot.type = 'button';
        const item = inventory[i];
        slot.className = `inv-slot ${item === selectedItem ? 'selected' : ''}`;
        if (!item) {
            slot.disabled = true;
            elements.inventoryBar.appendChild(slot);
            continue;
        }
        slot.title = formatItemName(item);
        slot.innerHTML = `<span class="inv-code">${getItemBadge(item)}</span>`;
        slot.addEventListener('click', () => {
            updateState('selectedItem', selectedItem === item ? null : item);
        });
        elements.inventoryBar.appendChild(slot);
    }
}

function updateModals(activeModal: string | null) {
    for (const modalId of modalIds) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            continue;
        }
        modal.classList.toggle('active', modalId === activeModal);
    }
    if (activeModal && document.pointerLockElement) {
        document.exitPointerLock();
    }
}

function getItemBadge(itemId: string): string {
    const map: Record<string, string> = {
        'uv-flashlight': 'UV',
        fuse: 'FUSE',
        'access-card': 'CARD',
    };
    return map[itemId] ?? 'ITEM';
}

function formatItemName(itemId: string): string {
    return itemId.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function triggerHintUse() {
    if (state.hintsRemaining <= 0) {
        showNotification('No hints remaining.', 'warn');
        return;
    }
    const hint = handlers?.onUseHint() ?? null;
    if (!hint) {
        showNotification('No relevant hint for current objective.', 'warn');
        return;
    }
    updateState('hintsRemaining', state.hintsRemaining - 1);
    showNotification(`Hint: ${hint}`, 'info');
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function getSelectedMode(): RunMode {
    const selected = document.querySelector<HTMLInputElement>('input[name="run-mode"]:checked');
    const value = selected?.value;
    if (value === 'hardcore' || value === 'daily' || value === 'story') {
        return value;
    }
    return DEFAULT_MODE;
}
