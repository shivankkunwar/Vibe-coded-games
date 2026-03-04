import * as THREE from 'three';
import {
    addItem,
    addScore,
    checkHasItem,
    checkPuzzleSolved,
    markPuzzleSolved,
    removeItem,
    state,
    updateState,
} from './state';
import { initPlayer, requestPointerLock, resetPlayerPosition, setInteractionHandler, updatePlayer } from './player';
import {
    getInteractionId,
    getLaserMirrorOrientations,
    getSpawnPoint,
    initWorld,
    interactableObjects,
    rotateLaserRoutingMirror,
    setDoorOpen,
    setLaserRoutingSolution,
    resetWorldRunState,
    updateWorld,
    type WorldUpdateResult,
} from './world';
import {
    initUI,
    openModal,
    setBestScoreLabel,
    setBonusStep,
    setMissionStep,
    setObjective,
    setRunModeLabel,
    setRunSeed,
    setSessionChampionLabel,
    showNote,
    showNotification,
    setVictorySummary,
    triggerScreenFlash,
    updateLoadingProgress,
    type RunSetup,
} from './ui';
import { generateRunSeed, PuzzleDirector } from './puzzles';
import { computeRunBonus, scoreToRank } from './scoring';
import {
    formatHighScoreLabel,
    loadHighScore,
    normalizeChampionName,
    saveHighScore,
    shouldReplaceHighScore,
    type HighScoreRecord,
} from './highscore';
import { DEFAULT_MODE, MODE_CONFIGS, formatModeLabel, type RunMode } from './modes';

const CIPHER_ANSWER = 'EXODUS';

type HintContext = 'uv' | 'routing' | 'keypad' | 'cipher' | 'plates' | 'safe' | 'exit';

interface HintResult {
    context: HintContext;
    level: number;
    text: string;
}

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let clock: THREE.Clock;

const loadingManager = new THREE.LoadingManager();

let activeMode: RunMode = DEFAULT_MODE;
let activePilotName = 'ANON';
let activeModeConfig = MODE_CONFIGS[DEFAULT_MODE];
let runSeed = generateRunSeed(activeMode);
let puzzleDirector = new PuzzleDirector(runSeed);

let routingSolved = false;
let keypadSolved = false;
let cipherSolved = false;
let cardCollected = false;
let fuseInstalled = false;
let cardReaderActivated = false;
let safePoweredAnnouncementShown = false;
let worldFrameState: WorldUpdateResult | null = null;
let elapsedTotal = 0;
let countdownAccumulator = 0;
let lastDoorWarnAt = -100;
const previousPlayerPosition = new THREE.Vector3();
let hintsUsedCount = 0;
let laserHitCount = 0;
let keypadMistakeCount = 0;
let progressChain = 0;
let progressChainPeak = 1;
let lastProgressAwardAt = -100;
let finalScoringCommitted = false;
let highScoreRecord: HighScoreRecord | null = null;

let hintStages: Record<HintContext, number> = createHintStageTracker();

const CHAIN_WINDOW_SECONDS = 45;
const CHAIN_STEP = 0.12;
const CHAIN_MAX = 1.6;

export async function initGame() {
    highScoreRecord = loadHighScore(DEFAULT_MODE);

    initUI({
        onStart: (setup) => {
            startRun(setup);
            requestPointerLock();
            showNotification('Move with WASD or D-pad, look with mouse or LOOK pad, use click/USE.', 'info');
            showNotification(`Mode: ${formatModeLabel(activeMode)}.`, 'info');
        },
        onResume: () => {
            requestPointerLock();
        },
        onRestart: () => {
            window.location.reload();
        },
        onModePreview: (mode) => {
            previewMode(mode);
        },
        onKeypadSubmit: (code: string) => handleKeypadSubmit(code),
        onCipherSubmit: (answer: string) => handleCipherSubmit(answer),
        onUseHint: () => {
            const hint = consumeContextualHint();
            if (!hint) {
                return null;
            }
            hintsUsedCount += 1;
            const hintPenalty = activeModeConfig.hintPenalty + (hint.level - 1) * 20;
            applyScorePenalty(hintPenalty, `${hint.context.toUpperCase()} hint`);
            refreshBonusObjectives();
            return hint.text;
        },
    });

    setRunSeed(puzzleDirector.getSeedLabel());
    setRunModeLabel(formatModeLabel(DEFAULT_MODE));
    setBestScoreLabel(formatHighScoreLabel(highScoreRecord));
    setSessionChampionLabel(highScoreRecord?.name ?? '---');

    updateLoadingProgress(0.08);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
        throw new Error('Missing #game-canvas element');
    }

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d141f);
    scene.fog = new THREE.FogExp2(0x101824, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
    clock = new THREE.Clock();

    updateLoadingProgress(0.2);

    loadingManager.onProgress = (_url, itemsLoaded, itemsTotal) => {
        if (itemsTotal <= 0) {
            return;
        }
        const ratio = itemsLoaded / itemsTotal;
        updateLoadingProgress(0.2 + ratio * 0.7);
    };

    loadingManager.onError = () => {
        showNotification('Asset load error detected. Refresh if visuals are broken.', 'error');
    };

    const worldOctree = await initWorld(loadingManager, scene);
    setLaserRoutingSolution(puzzleDirector.getLaserRoutingSolution());
    updateLoadingProgress(0.82);

    initPlayer(camera, scene, worldOctree);
    setInteractionHandler(handleInteraction);
    resetPlayerPosition(camera, getSpawnPoint('room1'));

    updateLoadingProgress(1);

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    renderer.setAnimationLoop(animate);
}

function startRun(setup: RunSetup) {
    activeMode = setup.mode;
    activeModeConfig = MODE_CONFIGS[activeMode];
    activePilotName = normalizeChampionName(setup.playerName);

    runSeed = generateRunSeed(activeMode);
    puzzleDirector = new PuzzleDirector(runSeed);
    setLaserRoutingSolution(puzzleDirector.getLaserRoutingSolution());

    highScoreRecord = loadHighScore(activeMode);

    updateState('score', 0);
    updateState('inventory', []);
    updateState('solvedPuzzles', new Set<string>());
    updateState('selectedItem', null);
    updateState('gameWon', false);
    updateState('timeRemaining', activeModeConfig.timeLimitSeconds);
    updateState('hintsRemaining', activeModeConfig.hintBudget);

    setRunSeed(puzzleDirector.getSeedLabel());
    setRunModeLabel(formatModeLabel(activeMode));
    setBestScoreLabel(formatHighScoreLabel(highScoreRecord));
    setSessionChampionLabel(highScoreRecord?.name ?? '---');

    setObjective('Search the main lab and recover the calibration clue.');
    setMissionStep('m1', 'active');
    setMissionStep('m2', 'pending');
    setMissionStep('m3', 'pending');
    setMissionStep('m4', 'pending');
    setBonusStep('b1', 'pending');
    setBonusStep('b2', 'pending');
    setBonusStep('b3', 'pending');
    setBonusStep('b4', 'pending');

    resetRunProgress();

    puzzleDirector.markActive('room1-discovery');
    setDoorOpen(false);
    resetWorldRunState();
    resetPlayerPosition(camera, getSpawnPoint('room1'));
}

function previewMode(mode: RunMode) {
    const record = loadHighScore(mode);
    setRunModeLabel(formatModeLabel(mode));
    setBestScoreLabel(formatHighScoreLabel(record));
    setSessionChampionLabel(record?.name ?? '---');
}

function handleInteraction(object: THREE.Object3D) {
    const interactionId = getInteractionId(object);
    if (!interactionId) {
        return;
    }

    switch (interactionId) {
        case 'uv-panel':
            if (checkPuzzleSolved('room1-code')) {
                showNotification('UV panel already inspected.', 'info');
                return;
            }
            markPuzzleSolved('room1-code');
            puzzleDirector.markSolved('room1-discovery');
            puzzleDirector.markActive('laser-routing');
            addItem('uv-flashlight');
            awardProgressScore(120);
            showNote(
                'UV overlay recovered. Mirror array is locked to calibration. '
                + `Keypad teaser: ${puzzleDirector.getKeypadTeaser()}. `
                + `Routing starter: ${puzzleDirector.getLaserRoutingHint(1)}`,
            );
            setObjective('Calibrate the mirror routing array in room 2 to stabilize power.');
            setMissionStep('m1', 'done');
            setMissionStep('m2', 'active');
            showNotification('Calibration clue recovered.', 'success');
            break;

        case 'mirror-1':
        case 'mirror-2':
        case 'mirror-3': {
            if (!checkPuzzleSolved('room1-code')) {
                showNotification('Routing array locked. Recover UV clue first.', 'warn');
                return;
            }
            if (routingSolved) {
                showNotification('Routing array already stabilized.', 'info');
                return;
            }
            const mirrorIndex = Number(interactionId.split('-')[1]) - 1;
            const orientation = rotateLaserRoutingMirror(mirrorIndex);
            puzzleDirector.registerAttempt('laser-routing');
            refreshBonusObjectives();
            showNotification(
                `Mirror ${mirrorIndex + 1} heading: ${puzzleDirector.getRoutingOrientationLabel(orientation)}.`,
                'info',
            );

            if (puzzleDirector.isLaserRoutingSolved(getLaserMirrorOrientations())) {
                routingSolved = true;
                puzzleDirector.markSolved('laser-routing');
                puzzleDirector.markActive('sector-keypad');
                markPuzzleSolved('room2-routing');
                addItem('fuse');
                awardProgressScore(280);
                setObjective('Use the storage terminal keypad to unlock cipher access.');
                setMissionStep('m2', 'done');
                setMissionStep('m3', 'active');
                showNotification('Laser routing solved. Heavy Fuse released.', 'success');
                triggerScreenFlash('green');
            }
            break;
        }

        case 'cipher-terminal':
            if (!routingSolved) {
                showNotification('Laser routing must be stabilized before storage terminal unlocks.', 'warn');
                return;
            }
            if (!keypadSolved) {
                openModal('keypad-modal');
                return;
            }
            openModal('cipher-modal');
            break;

        case 'director-safe':
            if (!cipherSolved) {
                showNotification('Safe locked. Solve the storage cipher first.', 'warn');
                return;
            }
            if (!worldFrameState?.allPlatesActive) {
                showNotification('Safe power low. Activate all pressure plates.', 'warn');
                return;
            }
            if (cardCollected) {
                showNotification('Safe already emptied.', 'info');
                return;
            }
            cardCollected = true;
            puzzleDirector.markSolved('vault-power');
            markPuzzleSolved('room3-safe');
            addItem('access-card');
            awardProgressScore(420);
            triggerScreenFlash('green');
            setObjective('Go to exit corridor. Equip fuse and card to complete exit protocol.');
            setMissionStep('m3', 'done');
            setMissionStep('m4', 'active');
            showNotification('Access card acquired from director safe.', 'success');
            break;

        case 'fuse-box':
            if (fuseInstalled) {
                showNotification('Fuse is already installed.', 'info');
                return;
            }
            if (!checkHasItem('fuse')) {
                showNotification('Missing required item: Heavy Fuse.', 'warn');
                return;
            }
            if (state.selectedItem !== 'fuse') {
                showNotification('Select FUSE from inventory before installing.', 'warn');
                return;
            }
            removeItem('fuse');
            fuseInstalled = true;
            markPuzzleSolved('room4-fuse');
            awardProgressScore(140);
            showNotification('Exit power restored.', 'success');
            updateDoorState();
            break;

        case 'card-reader':
            if (cardReaderActivated) {
                showNotification('Card reader already authenticated.', 'info');
                return;
            }
            if (!checkHasItem('access-card')) {
                showNotification('Access card required.', 'warn');
                return;
            }
            if (state.selectedItem !== 'access-card') {
                showNotification('Select ACCESS CARD in inventory before swiping.', 'warn');
                return;
            }
            cardReaderActivated = true;
            markPuzzleSolved('room4-card');
            awardProgressScore(140);
            triggerScreenFlash('green');
            showNotification('Card authenticated.', 'success');
            updateDoorState();
            break;
    }
}

function handleKeypadSubmit(code: string): boolean {
    const normalized = code.trim();
    if (keypadSolved) {
        return true;
    }

    if (normalized !== puzzleDirector.getKeypadCode()) {
        puzzleDirector.registerAttempt('sector-keypad');
        keypadMistakeCount += 1;
        refreshBonusObjectives();
        applyScorePenalty(30, 'Keypad mismatch');
        return false;
    }

    keypadSolved = true;
    puzzleDirector.markSolved('sector-keypad');
    puzzleDirector.markActive('storage-cipher');
    markPuzzleSolved('room2-keypad');
    awardProgressScore(160);
    setObjective('Storage terminal unlocked. Solve the cipher to authorize the director safe.');
    showNotification('Terminal access accepted.', 'success');
    triggerScreenFlash('green');
    return true;
}

function handleCipherSubmit(answer: string): boolean {
    const normalized = answer.trim().toUpperCase();
    if (cipherSolved) {
        return true;
    }
    if (normalized !== CIPHER_ANSWER) {
        puzzleDirector.registerAttempt('storage-cipher');
        refreshBonusObjectives();
        applyScorePenalty(35, 'Cipher mismatch');
        return false;
    }

    cipherSolved = true;
    puzzleDirector.markSolved('storage-cipher');
    markPuzzleSolved('room3-cipher');
    awardProgressScore(240);
    setObjective('Push all 3 crates onto pressure plates, then open the director safe.');
    showNotification('Cipher solved. Safe authorization decrypted.', 'success');
    return true;
}

function updateDoorState() {
    if (fuseInstalled && cardReaderActivated) {
        puzzleDirector.markSolved('exit-protocol');
        setDoorOpen(true);
        setObjective('Blast door opening. Move through the exit gate.');
        showNotification('Exit blast door unlocking...', 'success');
        return;
    }
    setObjective('Complete exit protocol: equip and install fuse, then swipe access card.');
}

function animate() {
    const deltaTime = Math.min(0.1, clock.getDelta());
    elapsedTotal += deltaTime;

    if (state.isRunning && !state.activeModal && !state.gameWon) {
        countdownAccumulator += deltaTime;
        while (countdownAccumulator >= 1) {
            countdownAccumulator -= 1;
            const nextTime = Math.max(0, state.timeRemaining - 1);
            updateState('timeRemaining', nextTime);
            if (nextTime === 0) {
                updateState('isRunning', false);
                openModal('gameover-modal');
                setObjective('Mission failed. Facility lockdown complete.');
                showNotification('Time expired. Lockdown engaged.', 'error');
                break;
            }
        }

        previousPlayerPosition.copy(camera.position);

        updatePlayer(deltaTime, camera, interactableObjects);
        worldFrameState = updateWorld(deltaTime, camera.position);

        if (worldFrameState.laserHit) {
            triggerScreenFlash('red');
            showNotification('Laser contact. Repositioning to checkpoint.', 'error');
            laserHitCount += 1;
            applyScorePenalty(activeModeConfig.laserPenalty, 'Laser impact');
            refreshBonusObjectives();
            resetPlayerPosition(camera, getSpawnPoint(activeModeConfig.laserResetRoom));
        }

        if (worldFrameState.blockedByDoor) {
            resetPlayerPosition(camera, previousPlayerPosition);
            if (elapsedTotal - lastDoorWarnAt > 1.5) {
                lastDoorWarnAt = elapsedTotal;
                showNotification('Blast door locked. Restore power and card auth.', 'warn');
            }
        }

        if (worldFrameState.platesChanged) {
            showNotification(
                `Pressure plates active: ${worldFrameState.activePlateCount}/3`,
                worldFrameState.allPlatesActive ? 'success' : 'info',
            );
            if (worldFrameState.allPlatesActive && !safePoweredAnnouncementShown) {
                safePoweredAnnouncementShown = true;
                showNotification('Director safe now has full power.', 'success');
                if (cipherSolved && !cardCollected) {
                    setObjective('Safe is powered. Retrieve the access card.');
                }
            }
            if (!worldFrameState.allPlatesActive) {
                safePoweredAnnouncementShown = false;
            }
        }

        if (worldFrameState.reachedExit) {
            updateState('gameWon', true);
            updateState('isRunning', false);
            setObjective('Escape complete. Facility breach successful.');
            setMissionStep('m4', 'done');
            awardProgressScore(500);
            finalizeVictoryScoring();
            openModal('victory-modal');
            showNotification('Escape successful.', 'success');
        }
    }

    renderer.render(scene, camera);
}

function handleVisibilityChange() {
    if (!document.hidden) {
        return;
    }
    if (!state.isRunning || state.gameWon || state.activeModal) {
        return;
    }

    openModal('pause-modal');
    showNotification('Mission paused while tab is hidden.', 'info');
}

function onWindowResize() {
    if (!camera || !renderer) {
        return;
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

function awardProgressScore(basePoints: number): number {
    const inChainWindow = elapsedTotal - lastProgressAwardAt <= CHAIN_WINDOW_SECONDS;
    progressChain = inChainWindow ? Math.min(progressChain + 1, 6) : 1;
    progressChainPeak = Math.max(progressChainPeak, progressChain);
    lastProgressAwardAt = elapsedTotal;

    const chainMultiplier = Math.min(CHAIN_MAX, 1 + (progressChain - 1) * CHAIN_STEP);
    const awarded = Math.round(basePoints * chainMultiplier * activeModeConfig.scoreMultiplier);
    addScore(awarded);

    if (progressChain >= 3) {
        showNotification(`Momentum chain x${chainMultiplier.toFixed(2)} (+${awarded})`, 'success');
    }
    return awarded;
}

function applyScorePenalty(points: number, reason: string) {
    const penalty = Math.max(0, Math.round(points));
    if (penalty <= 0) {
        return;
    }

    const prevScore = state.score;
    addScore(-penalty);
    const appliedPenalty = prevScore - state.score;
    if (appliedPenalty > 0) {
        showNotification(`${reason}: -${appliedPenalty}`, 'warn');
    }
}

function refreshBonusObjectives() {
    if (hintsUsedCount > 0) {
        setBonusStep('b1', 'failed');
    }
    if (laserHitCount > 0) {
        setBonusStep('b2', 'failed');
    }
    if (
        puzzleDirector.getAttempts('laser-routing') > 6
        || puzzleDirector.getAttempts('sector-keypad') > 0
        || puzzleDirector.getAttempts('storage-cipher') > 0
    ) {
        setBonusStep('b4', 'failed');
    }
}

function finalizeVictoryScoring() {
    if (finalScoringCommitted) {
        return;
    }
    finalScoringCommitted = true;

    const bonus = computeRunBonus({
        timeRemaining: state.timeRemaining,
        hintsUsed: hintsUsedCount,
        laserHits: laserHitCount,
        keypadMistakes: keypadMistakeCount,
        routingAttempts: puzzleDirector.getAttempts('laser-routing'),
        cipherMistakes: puzzleDirector.getAttempts('storage-cipher'),
        chainPeak: progressChainPeak,
        modeMultiplier: activeModeConfig.scoreMultiplier,
    });

    addScore(bonus.totalBonus);
    const finalScore = state.score;
    const rank = scoreToRank(finalScore);

    setBonusStep('b1', bonus.optionalGoals.noHints ? 'done' : 'failed');
    setBonusStep('b2', bonus.optionalGoals.noLaserHits ? 'done' : 'failed');
    setBonusStep('b3', bonus.optionalGoals.fastExit ? 'done' : 'failed');
    setBonusStep('b4', bonus.optionalGoals.cleanSolve ? 'done' : 'failed');

    let isNewRecord = false;
    if (shouldReplaceHighScore(finalScore, highScoreRecord)) {
        isNewRecord = true;
        highScoreRecord = {
            name: activePilotName,
            score: finalScore,
            rank,
            seed: puzzleDirector.getSeedLabel(),
            achievedAt: new Date().toISOString(),
            mode: activeMode,
        };
        saveHighScore(highScoreRecord);
    }

    const bestScoreLabel = formatHighScoreLabel(highScoreRecord);
    setBestScoreLabel(bestScoreLabel);
    setSessionChampionLabel(highScoreRecord?.name ?? '---');

    setVictorySummary({
        finalScore,
        rank,
        bestScoreLabel,
        newRecord: isNewRecord,
        timeBonus: bonus.timeBonus,
        disciplineBonus: bonus.disciplineBonus,
        stealthBonus: bonus.stealthBonus,
        efficiencyBonus: bonus.efficiencyBonus,
        chainBonus: bonus.chainBonus,
    });

    if (isNewRecord && highScoreRecord) {
        showNotification(`Session leader updated: ${highScoreRecord.name}.`, 'success');
    }
}

function consumeContextualHint(): HintResult | null {
    const context = resolveHintContext();
    const nextLevel = Math.min(3, hintStages[context] + 1);
    hintStages[context] = nextLevel;

    const text = buildHintText(context, nextLevel);
    if (!text) {
        return null;
    }

    return {
        context,
        level: nextLevel,
        text,
    };
}

function resolveHintContext(): HintContext {
    if (!checkPuzzleSolved('room1-code')) {
        return 'uv';
    }
    if (!routingSolved) {
        return 'routing';
    }
    if (!keypadSolved) {
        return 'keypad';
    }
    if (!cipherSolved) {
        return 'cipher';
    }
    if (!worldFrameState?.allPlatesActive) {
        return 'plates';
    }
    if (!cardCollected) {
        return 'safe';
    }
    return 'exit';
}

function buildHintText(context: HintContext, level: number): string {
    switch (context) {
        case 'uv':
            if (level === 1) {
                return 'Sweep the main lab walls with your view; one panel glows brighter cyan.';
            }
            if (level === 2) {
                return 'The UV panel sits on the rear wall section beyond the first room divider.';
            }
            return 'Look straight at z ~ -7 in room 1; interact with the luminous UV panel.';

        case 'routing':
            return puzzleDirector.getLaserRoutingHint(level);

        case 'keypad':
            return puzzleDirector.getKeypadHint(level);

        case 'cipher':
            if (level === 1) {
                return 'Cipher console uses a Caesar shift of -3.';
            }
            if (level === 2) {
                return 'Apply -3 per letter: H->E, A->X, R->O ... continue the same way.';
            }
            return 'Decrypted phrase is EXODUS.';

        case 'plates':
            if (level === 1) {
                return 'Each crate must be centered on a plate to register power.';
            }
            if (level === 2) {
                return 'Use shallow pushes; overshooting a plate can deactivate another.';
            }
            return 'Align crates near x=15.5, 20.0, 24.5 and z=-14.8.';

        case 'safe':
            if (level === 1) {
                return 'With cipher solved and all plates active, interact with the director safe.';
            }
            if (level === 2) {
                return 'Safe is in room 3 near z=-12.7. It opens only at full plate power.';
            }
            return 'Collect the access card from the director safe now.';

        case 'exit':
            if (!fuseInstalled) {
                return state.selectedItem === 'fuse'
                    ? 'You are holding the fuse. Interact with the fuse box now.'
                    : 'Select FUSE from inventory before using the fuse box.';
            }
            if (!cardReaderActivated) {
                return state.selectedItem === 'access-card'
                    ? 'You are holding the card. Swipe at the card reader.'
                    : 'Select ACCESS CARD in inventory before swiping.';
            }
            return 'Door is unlocked. Move through the exit corridor gate to finish.';
    }
}

function createHintStageTracker(): Record<HintContext, number> {
    return {
        uv: 0,
        routing: 0,
        keypad: 0,
        cipher: 0,
        plates: 0,
        safe: 0,
        exit: 0,
    };
}

function resetRunProgress() {
    routingSolved = false;
    keypadSolved = false;
    cipherSolved = false;
    cardCollected = false;
    fuseInstalled = false;
    cardReaderActivated = false;
    safePoweredAnnouncementShown = false;
    worldFrameState = null;
    elapsedTotal = 0;
    countdownAccumulator = 0;
    lastDoorWarnAt = -100;
    hintsUsedCount = 0;
    laserHitCount = 0;
    keypadMistakeCount = 0;
    progressChain = 0;
    progressChainPeak = 1;
    lastProgressAwardAt = -100;
    finalScoringCommitted = false;
    hintStages = createHintStageTracker();
}

