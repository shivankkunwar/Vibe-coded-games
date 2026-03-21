import * as THREE from 'three';
import { initCar, updateCar, resetCar, setTreePositions, type CarState } from './car';
import { initTrack, updateTrack, resetTrack, createCarPositionTracker, type TrackState, type CarPosition } from './track';
import { initWorld, getTreePositions } from './world';
import { createRobotCar, updateRobotCar, resetRobotCar, type RobotCar } from './robot';
import {
    initUI,
    openModal,
    closeCurrentModal,
    showNotification,
    updateDashboard,
    updateLapDisplay,
    showLapComplete,
    showRaceFinish,
    updateLoadingProgress,
    setRaceTimer,
    setCountdownMessage,
    resetHUD,
    setStartButtonEnabled,
} from './ui';
import { state, updateState, resetState, type RaceMode } from './state';
import { loadBestLap, saveBestLap, formatLapTime } from './highscore';

const DEFAULT_MODE: RaceMode = 'time-attack';
const START_COUNTDOWN_SECONDS = 3;
const TOTAL_LAPS = 3;

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let clock: THREE.Clock;

const loadingManager = new THREE.LoadingManager();

let activeMode: RaceMode = DEFAULT_MODE;
let activeRacerName = 'ROOKIE';
let elapsedTotal = 0;
let countdownUntil = 0;
let countdownActive = false;

let carState: CarState | null = null;
let trackState: TrackState | null = null;
let playerPosition: CarPosition | null = null;
let robotCars: RobotCar[] = [];

export async function initGame() {
    initUI({
        onStart: (setup) => {
            startRace(setup);
            showNotification('WASD to drive, SPACE to drift, SHIFT for nitro', 'info');
            showNotification(`Mode: ${setup.mode === 'time-attack' ? 'Time Attack' : 'Drift Master'}`, 'info');
        },
        onResume: () => {
            resumeRace();
        },
        onRestart: () => {
            resetForNextRace();
        },
    });

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
    renderer.toneMappingExposure = 1.0;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050810);
    scene.fog = new THREE.FogExp2(0x050810, 0.02);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    clock = new THREE.Clock();
    clock.stop();

    updateLoadingProgress(0.15);

    loadingManager.onProgress = (_url: string, itemsLoaded: number, itemsTotal: number) => {
        if (itemsTotal <= 0) return;
        const ratio = itemsLoaded / itemsTotal;
        updateLoadingProgress(0.15 + ratio * 0.75);
    };

    loadingManager.onError = () => {
        showNotification('Asset load error. Refresh if visuals broken.', 'error');
    };

    await initWorld(loadingManager, scene);
    setTreePositions(getTreePositions());
    updateLoadingProgress(0.85);

    trackState = initTrack(scene);
    updateLoadingProgress(0.92);

    carState = initCar(camera, scene, trackState);
    playerPosition = createCarPositionTracker(trackState.checkpoints);

    robotCars = [
        createRobotCar(scene, trackState, 0x00ff00, -3, 29),
        createRobotCar(scene, trackState, 0x0000ff, -6, 27),
    ];

    updateLoadingProgress(1.0);

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    renderer.setAnimationLoop(animate);
    setStartButtonEnabled(false);
}

function startRace(setup: { mode: RaceMode; playerName: string }) {
    activeMode = setup.mode;
    activeRacerName = setup.playerName.trim() || 'ROOKIE';

    resetState();
    updateState('mode', activeMode);
    updateState('playerName', activeRacerName);
    updateState('totalLaps', TOTAL_LAPS);
    updateState('currentLap', 1);

    if (countdownActive) {
        countdownActive = false;
        setCountdownMessage(null);
        setRaceTimer(0);
    }

    if (trackState && carState) {
        resetTrack(trackState);
        resetCar(carState, trackState);
    }

    elapsedTotal = 0;
    updateState('isPaused', false);
    updateState('isStarting', true);
    updateState('isRunning', false);
    updateState('raceFinished', false);
    countdownUntil = performance.now() + START_COUNTDOWN_SECONDS * 1000;
    countdownActive = true;
    showCountdown();

    const currentBest = loadBestLap(activeMode);
    const bestLapLabel = currentBest ? formatLapTime(currentBest.time) : '--:--.--';
    showNotification(`Best Lap: ${bestLapLabel}`, 'info');

    const bestLap = loadBestLap(activeMode);
    updateLapDisplay(1, state.totalLaps || TOTAL_LAPS, bestLap);
    resetHUD();

    showNotification('Get ready, engine up in 3...', 'info');
}

function showCountdown() {
    const remaining = Math.max(0, Math.ceil((countdownUntil - performance.now()) / 1000));
    setCountdownMessage(remaining > 0 ? String(remaining) : 'GO!');
}

function startActiveRun() {
    countdownActive = false;
    updateState('isStarting', false);
    updateState('isRunning', true);
    setCountdownMessage(null);
    setRaceTimer(0);
    elapsedTotal = 0;
    clock.start();
    closeCurrentModal();
    showNotification('GO! WASD/Arrows to drive, SPACE=drift, SHIFT=nitro', 'success');
}

let frameCount = 0;

function animate() {
    frameCount++;
    const currentTime = performance.now();

    if (state.isStarting) {
        showCountdown();
        if (countdownUntil <= currentTime) {
            startActiveRun();
        }
        renderer.render(scene, camera);
        return;
    }

    const deltaTime = Math.min(0.1, clock.getDelta());

    if (state.isRunning && !state.activeModal) {
        if (frameCount % 60 === 0 && carState) {
            console.log(`[GAME] Running - frame ${frameCount}, speed: ${carState.speed.toFixed(2)}, pos: x=${carState.mesh.position.x.toFixed(1)}, z=${carState.mesh.position.z.toFixed(1)}, rotY: ${carState.mesh.rotation.y.toFixed(2)}`);
        }
        
        elapsedTotal += deltaTime;

        // Update car physics
        if (carState && trackState && playerPosition) {
            updateCar(carState, deltaTime, trackState);
            
            const otherCarsForCollision = robotCars.map(r => ({
                x: r.group.position.x,
                z: r.group.position.z,
            }));
            
            for (const robot of robotCars) {
                updateRobotCar(robot, trackState, deltaTime, [
                    { x: carState.mesh.position.x, z: carState.mesh.position.z },
                    ...otherCarsForCollision.filter(c => c.x !== robot.group.position.x),
                ]);
            }

            for (const robot of robotCars) {
                const px = carState.mesh.position.x;
                const pz = carState.mesh.position.z;
                const rx = robot.group.position.x;
                const rz = robot.group.position.z;
                const dx = rx - px;
                const dz = rz - pz;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < 3.5 && dist > 0) {
                    const pushDx = (dx / dist) * (3.5 - dist) * 0.5;
                    const pushDz = (dz / dist) * (3.5 - dist) * 0.5;
                    carState.mesh.position.x -= pushDx;
                    carState.mesh.position.z -= pushDz;
                    robot.group.position.x += pushDx;
                    robot.group.position.z += pushDz;
                    carState.speed *= 0.6;
                }
            }

            updateTrack(trackState, carState, playerPosition, deltaTime);

            updateCamera();

            if (trackState.currentLap > state.currentLap) {
                handleLapComplete(trackState);
            }

            if (trackState.raceFinished && !state.raceFinished) {
                handleRaceFinish(trackState);
            }

            let playerPositionRank = 1;
            const totalRacers = 1 + robotCars.length;
            for (const robot of robotCars) {
                if (robot.carPosition.progress > playerPosition.progress) {
                    playerPositionRank++;
                }
            }
            updateState('position', playerPositionRank);
            
            const posDisplay = document.getElementById('position-display');
            if (posDisplay) {
                posDisplay.textContent = `${playerPositionRank}/${totalRacers}`;
            }
        }

        // Update UI
        if (carState && trackState) {
            updateDashboardUI(carState, trackState);
            setRaceTimer(elapsedTotal);
        }
    }

    renderer.render(scene, camera);
}

function updateCamera() {
    if (!carState) return;

    // First-person cockpit view. Camera stays at the driver's eye position.
    const carPos = carState.mesh.position;
    const carQuat = carState.mesh.quaternion;

    // Camera offset for cockpit view (inside the car)
    const cockpitOffset = new THREE.Vector3(0, 1.4, 0.3);
    cockpitOffset.applyQuaternion(carQuat);
    camera.position.copy(carPos).add(cockpitOffset);

    // Look slightly ahead of the car
    const lookAhead = new THREE.Vector3(0, 1.3, -5);
    lookAhead.applyQuaternion(carQuat);
    const lookTarget = carPos.clone().add(lookAhead);
    camera.lookAt(lookTarget);
}

function updateDashboardUI(car: CarState, track: TrackState) {
    const speedKmh = Math.round(car.speed * 3.6); // m/s to km/h
    const gear = getGear(car.speed);
    const driftIntensity = car.isDrifting ? Math.min(100, car.driftAngle * 50) : 0;

    updateDashboard({
        speed: speedKmh,
        gear,
        driftIntensity,
        isDrifting: car.isDrifting,
    });
}

function getGear(speed: number): string {
    if (speed < 0.5) return 'N';
    if (speed < 1.5) return '1';
    if (speed < 3.0) return '2';
    if (speed < 5.0) return '3';
    if (speed < 7.5) return '4';
    if (speed < 10.0) return '5';
    return '6';
}

function handleLapComplete(track: TrackState) {
    updateState('currentLap', track.currentLap);

    if (track.currentLap <= state.totalLaps) {
        const lapTime = track.lastLapTime;
        const formattedLap = formatLapTime(lapTime);

        // Check for best lap
        const bestLap = loadBestLap(activeMode);
        const isNewBest = !bestLap || lapTime < bestLap.time;

        let best = bestLap;

        if (isNewBest) {
            const updatedBest = {
                name: activeRacerName,
                time: lapTime,
                mode: activeMode,
                achievedAt: new Date().toISOString(),
            };
            saveBestLap({
                name: activeRacerName,
                time: lapTime,
                mode: activeMode,
                achievedAt: new Date().toISOString(),
            });
            showNotification(`New Best Lap: ${formattedLap}`, 'success');
            best = updatedBest;
        }

        showLapComplete({
            lapTime: formattedLap,
            bestLap: best ? formatLapTime(best.time) : '--:--.--',
            driftScore: activeMode === 'drift-master' ? track.currentDriftScore : undefined,
        });

        updateLapDisplay(track.currentLap, state.totalLaps, best);
    }
}

function handleRaceFinish(track: TrackState) {
    updateState('raceFinished', true);
    updateState('isRunning', false);

    const totalTime = elapsedTotal;
    let bestLap = loadBestLap(activeMode);
    const isNewRecord = !bestLap || totalTime < bestLap.time;
    if (isNewRecord) {
        bestLap = {
            name: activeRacerName,
            time: totalTime,
            mode: activeMode,
            achievedAt: new Date().toISOString(),
        };
        saveBestLap({
            ...bestLap,
        });
    }

    showRaceFinish({
        totalTime: formatLapTime(totalTime),
        bestLap: bestLap ? formatLapTime(bestLap.time) : '--:--.--',
        totalDrift: activeMode === 'drift-master' ? track.totalDriftScore : undefined,
        isNewRecord,
    });

    showNotification('Race Complete!', 'success');
}

function resetForNextRace() {
    countdownActive = false;
    setCountdownMessage(null);
    resetHUD();

    updateState('isRunning', false);
    updateState('isStarting', false);
    updateState('isPaused', false);
    updateState('raceFinished', false);
    updateState('currentLap', 1);
    updateState('activeModal', null);

    elapsedTotal = 0;
    setRaceTimer(0);

    if (trackState && carState) {
        resetTrack(trackState);
        resetCar(carState, trackState);
        
        playerPosition = createCarPositionTracker(trackState.checkpoints);
        
        robotCars.forEach((robot, i) => {
            const offset = i === 0 ? -3 : -6;
            resetRobotCar(robot, trackState!, offset);
        });
    }

    openModal('intro-modal');
    updateState('activeModal', 'intro-modal');
    setStartButtonEnabled(true);

    const bestLap = loadBestLap(activeMode);
    updateLapDisplay(1, state.totalLaps || TOTAL_LAPS, bestLap);
}

function resumeRace() {
    if (!state.isPaused) return;
    updateState('isPaused', false);
    updateState('isRunning', true);
    clock.start();
    closeCurrentModal();
}

function handleVisibilityChange() {
    if (!document.hidden) return;
    if (!state.isRunning || state.raceFinished || state.activeModal || state.isStarting) return;

    updateState('isPaused', true);
    updateState('isRunning', false);
    clock.stop();
    openModal('pause-modal');
    showNotification('Race paused', 'info');
}

function onWindowResize() {
    if (!camera || !renderer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
