import { state, updateState, type RaceMode } from './state';
import { formatLapTime } from './highscore';

export interface RunSetup {
    mode: RaceMode;
    playerName: string;
}

export interface DashboardData {
    speed: number;
    gear: string;
    driftIntensity: number;
    isDrifting: boolean;
}

export interface LapCompleteData {
    lapTime: string;
    bestLap: string;
    driftScore?: number;
}

export interface RaceFinishData {
    totalTime: string;
    bestLap: string;
    totalDrift?: number;
    isNewRecord: boolean;
}

type UIHandlers = {
    onStart: (setup: RunSetup) => void;
    onResume: () => void;
    onRestart: () => void;
};

let handlers: UIHandlers | null = null;
let bestLapCache: { time: number } | null = null;

function getStartBtn(): HTMLButtonElement | null {
    return document.getElementById('start-btn') as HTMLButtonElement | null;
}

export function setStartButtonEnabled(enabled: boolean, label = 'Start Engine') {
    const startBtn = getStartBtn();
    if (!startBtn) return;

    startBtn.disabled = !enabled;
    startBtn.style.display = enabled ? 'inline-flex' : 'none';

    if (enabled) {
        startBtn.textContent = label;
    }
}

export function initUI(uiHandlers: UIHandlers) {
    handlers = uiHandlers;

    const startBtn = getStartBtn();
    const resumeBtn = document.getElementById('resume-btn');
    const pilotInput = document.getElementById('pilot-name-input') as HTMLInputElement | null;
    openModal('intro-modal');
    updateState('activeModal', 'intro-modal');
    bestLapCache = null;

    setStartButtonEnabled(false);

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const selectedMode = document.querySelector('input[name="race-mode"]:checked') as HTMLInputElement | null;
            const mode = (selectedMode?.value || 'time-attack') as RaceMode;
            const playerName = pilotInput?.value || 'ROOKIE';

            handlers?.onStart({ mode, playerName });
            setStartButtonEnabled(false, 'Starting...');
             
            // Close the intro modal
            const introModal = document.getElementById('intro-modal');
            if (introModal) {
                introModal.classList.remove('active');
                updateState('activeModal', null);
            }
        });
    }

    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            closeCurrentModal();
            handlers?.onResume();
        });
    }

    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => {
            closeCurrentModal();
        });
    });

    // Restart buttons
    document.querySelectorAll('[data-restart-game]').forEach((btn) => {
        btn.addEventListener('click', () => {
            closeCurrentModal();
            handlers?.onRestart();
        });
    });

    // Show loading complete
    setTimeout(() => {
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');

        if (loadingBar) loadingBar.style.width = '100%';
        if (loadingText) loadingText.textContent = 'Ready to Race!';

        setStartButtonEnabled(true);
    }, 1500);
}

export function openModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        updateState('activeModal', modalId);
    }
}

export function closeCurrentModal() {
    if (!state.activeModal) return;

    const modal = document.getElementById(state.activeModal);
    if (modal) {
        modal.classList.remove('active');
        updateState('activeModal', null);
    }
}

export function showNotification(message: string, type: 'success' | 'error' | 'warn' | 'info' = 'info') {
    const area = document.getElementById('notification-area');
    if (!area) return;

    const toast = document.createElement('div');
    toast.className = `game-toast ${type}`;
    toast.textContent = message;
    area.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2500);
}

export function updateDashboard(data: DashboardData) {
    // Speed display
    const speedDisplay = document.getElementById('speed-display');
    if (speedDisplay) {
        speedDisplay.textContent = data.speed.toString();
    }

    // Gear display
    const gearDisplay = document.getElementById('gear-display');
    if (gearDisplay) {
        gearDisplay.textContent = data.gear;
    }

    // Drift indicator
    const driftIndicator = document.getElementById('drift-indicator');
    if (driftIndicator) {
        driftIndicator.style.setProperty('--drift-intensity', `${data.driftIntensity}%`);
        if (data.isDrifting) {
            driftIndicator.classList.add('active');
        } else {
            driftIndicator.classList.remove('active');
        }
    }

    // Speed gauge
    const speedGaugeFill = document.getElementById('speed-gauge-fill');
    const speedNeedle = document.getElementById('speed-needle');

    if (speedGaugeFill) {
        const speedRatio = Math.min(1, data.speed / 200);
        const angle = speedRatio * Math.PI;
        const x = 60 + 40 * Math.cos(Math.PI - angle);
        const y = 50 - 40 * Math.sin(angle);
        speedGaugeFill.setAttribute('d', `M 10 50 A 40 40 0 ${speedRatio > 0.5 ? 1 : 0} 1 ${x} ${y}`);
    }

    if (speedNeedle) {
        const speedRatio = Math.min(1, data.speed / 200);
        const rotation = -90 + speedRatio * 180;
        speedNeedle.style.transform = `rotate(${rotation}deg)`;
        speedNeedle.style.transformOrigin = '60px 50px';
    }
}

export function updateLapDisplay(current: number, total: number, bestLap: { time: number } | null) {
    bestLapCache = bestLap;
    const lapDisplay = document.getElementById('lap-display');
    if (lapDisplay) {
        lapDisplay.textContent = `${current}/${total}`;
    }
}

export function showLapComplete(data: LapCompleteData) {
    const lapTimeValue = document.getElementById('lap-time-value');
    const bestLapValue = document.getElementById('best-lap-value');
    const driftScoreLine = document.getElementById('drift-score-line');
    const driftScoreValue = document.getElementById('drift-score-value');

    if (lapTimeValue) lapTimeValue.textContent = data.lapTime;
    if (bestLapValue) bestLapValue.textContent = data.bestLap;

    if (driftScoreLine && driftScoreValue && data.driftScore !== undefined) {
        driftScoreLine.style.display = 'flex';
        driftScoreValue.textContent = data.driftScore.toString();
    } else if (driftScoreLine) {
        driftScoreLine.style.display = 'none';
    }

    openModal('lap-modal');
}

export function showRaceFinish(data: RaceFinishData) {
    const totalTimeValue = document.getElementById('total-time-value');
    const bestLapValue = document.getElementById('finish-best-lap-value');
    const totalDriftLine = document.getElementById('finish-drift-line');
    const totalDriftValue = document.getElementById('finish-drift-value');
    const recordBadge = document.getElementById('finish-record-badge');

    if (totalTimeValue) totalTimeValue.textContent = data.totalTime;
    if (bestLapValue) bestLapValue.textContent = data.bestLap;

    if (totalDriftLine && totalDriftValue && data.totalDrift !== undefined) {
        totalDriftLine.style.display = 'flex';
        totalDriftValue.textContent = data.totalDrift.toString();
    } else if (totalDriftLine) {
        totalDriftLine.style.display = 'none';
    }

    if (recordBadge) {
        recordBadge.textContent = data.isNewRecord ? 'New Track Record!' : '';
    }

    openModal('finish-modal');
}

export function setRaceTimer(seconds: number) {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.textContent = formatLapTime(seconds);
    }
}

export function setCountdownMessage(message: string | null) {
    const countdown = document.getElementById('start-countdown');
    if (!countdown) return;

    if (message) {
        countdown.classList.add('active');
        countdown.textContent = message;
    } else {
        countdown.classList.remove('active');
        countdown.textContent = '';
    }
}

export function resetHUD() {
    setCountdownMessage(null);
    setRaceTimer(0);
    const bestLap = bestLapCache;
    updateLapDisplay(state.currentLap, state.totalLaps, bestLap);
    const speedDisplay = document.getElementById('speed-display');
    const gearDisplay = document.getElementById('gear-display');
    const driftIndicator = document.getElementById('drift-indicator');

    if (speedDisplay) speedDisplay.textContent = '0';
    if (gearDisplay) gearDisplay.textContent = 'N';
    if (driftIndicator) driftIndicator.classList.remove('active');
    if (driftIndicator) driftIndicator.style.setProperty('--drift-intensity', '0%');

    if (bestLap) {
        const bestLapValue = document.getElementById('best-lap-value');
        const finishBestLapValue = document.getElementById('finish-best-lap-value');

        if (bestLapValue) {
            bestLapValue.textContent = formatLapTime(bestLap.time);
        }

        if (finishBestLapValue) {
            finishBestLapValue.textContent = formatLapTime(bestLap.time);
        }
    }
}

export function updateLoadingProgress(progress: number) {
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');

    const percentage = Math.round(progress * 100);

    if (loadingBar) {
        loadingBar.style.width = `${percentage}%`;
    }

    if (loadingText) {
        loadingText.textContent = `Loading Systems (${percentage}%)`;
    }
}
