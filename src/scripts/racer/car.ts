import * as THREE from 'three';
import type { TrackState } from './track';

export interface CarState {
    mesh: THREE.Group;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    speed: number;
    maxSpeed: number;
    accelerationRate: number;
    brakingRate: number;
    friction: number;
    turnSpeed: number;
    driftFactor: number;
    grip: number;
    driftAngle: number;
    isDrifting: boolean;
    isAirborne: boolean;
    nitroAvailable: boolean;
    nitroActive: boolean;
    wheelMeshes: THREE.Mesh[];
    headlightLeft: THREE.PointLight;
    headlightRight: THREE.PointLight;
    taillightLeft: THREE.Mesh;
    taillightRight: THREE.Mesh;
    currentSteer: number;
}

const CAR_CONFIG = {
    maxSpeed: 30,
    accelerationRate: 35, // Increased for snappier feel against new drag
    brakingRate: 45,
    friction: 0.99,
    turnSpeed: 3.5,
    driftFactor: 0.92,
    grip: 0.85,
    nitroBoost: 2.0,
    nitroDuration: 3000,
    drag: 0.015, // Aerodynamic drag coefficient
    rollingResistance: 0.5 // Mechanical friction
};

type RacerInputPayload = { code: string; pressed: boolean; };
type RacerAxisPayload = { x?: number; y?: number; };

const inputState = {
    accelerate: false, brake: false, left: false, right: false,
    handbrake: false, nitro: false, steerAxis: 0,
};

// Maps keys directly to state properties for clean event handling
const KEY_MAP: Record<string, keyof typeof inputState> = {
    KeyW: 'accelerate', ArrowUp: 'accelerate',
    KeyS: 'brake', ArrowDown: 'brake',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'handbrake',
    ShiftLeft: 'nitro', ShiftRight: 'nitro'
};

let nitroResetTimer: ReturnType<typeof setTimeout> | null = null;
let treePositions: { x: number; z: number; radius: number }[] = [];

export function setTreePositions(trees: { x: number; z: number; radius: number }[]) {
    treePositions = trees;
}

export function initCar(camera: THREE.PerspectiveCamera, scene: THREE.Scene, track: TrackState): CarState {
    const carGroup = createCarModel();
    carGroup.position.copy(track.startPosition);
    carGroup.rotation.y = track.startRotation;
    scene.add(carGroup);

    // Set initial camera to face the track direction
    camera.position.copy(track.startPosition);
    camera.position.y += 1.4; // Cockpit height
    camera.rotation.y = track.startRotation;

    const wheelMeshes: THREE.Mesh[] = [];
    carGroup.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).userData.isWheel) wheelMeshes.push(child as THREE.Mesh);
    });

    // Encapsulate light creation
    const createHeadlight = (x: number) => {
        const light = new THREE.PointLight(0xffffff, 2, 50, 2);
        light.position.set(x, 0.8, -1.8);
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        return light;
    };

    const headlightLeft = createHeadlight(-0.6);
    const headlightRight = createHeadlight(0.6);
    carGroup.add(headlightLeft, headlightRight);

    const taillightLeft = createTaillight();
    taillightLeft.position.set(-0.7, 0.9, 1.7);
    const taillightRight = createTaillight();
    taillightRight.position.set(0.7, 0.9, 1.7);
    carGroup.add(taillightLeft, taillightRight);

    setupControls();

    return {
        mesh: carGroup,
        velocity: new THREE.Vector3(),
        acceleration: new THREE.Vector3(),
        speed: 0,
        maxSpeed: CAR_CONFIG.maxSpeed,
        accelerationRate: CAR_CONFIG.accelerationRate,
        brakingRate: CAR_CONFIG.brakingRate,
        friction: CAR_CONFIG.friction,
        turnSpeed: CAR_CONFIG.turnSpeed,
        driftFactor: CAR_CONFIG.driftFactor,
        grip: CAR_CONFIG.grip,
        driftAngle: 0,
        isDrifting: false,
        isAirborne: false,
        nitroAvailable: true,
        nitroActive: false,
        wheelMeshes,
        headlightLeft,
        headlightRight,
        taillightLeft,
        taillightRight,
        currentSteer: 0,
    };
}

export function updateCar(car: CarState, deltaTime: number, track: TrackState) {
    const throttle = inputState.accelerate ? 1 : inputState.brake ? -1 : 0;
    const steerAxis = inputState.steerAxis;
    const steerTarget = steerAxis !== 0 ? steerAxis : inputState.left ? 1 : inputState.right ? -1 : 0;

    // Smooth steering input via Lerp
    car.currentSteer = THREE.MathUtils.lerp(car.currentSteer, steerTarget, deltaTime * 10);
    const isHandbraking = inputState.handbrake;
    const isNitro = inputState.nitro && car.nitroAvailable;

    if (isNitro && !car.nitroActive) activateNitro(car);

    // Engine force
    let force = 0;
    if (throttle !== 0) {
        force = throttle > 0 ? car.accelerationRate : -car.brakingRate;
    }

    // Environmental forces (Drag + Rolling Resistance)
    const dragForce = -CAR_CONFIG.drag * car.speed * Math.abs(car.speed);
    const rrForce = -CAR_CONFIG.rollingResistance * car.speed;

    // Apply net forces
    car.speed += (force + dragForce + rrForce) * deltaTime;
    car.speed = THREE.MathUtils.clamp(car.speed, -car.maxSpeed * 0.4, car.maxSpeed); // Allow 40% reverse speed

    if (Math.abs(car.speed) < 0.1 && throttle === 0) car.speed = 0;

    // Drifting logic
    const shouldDrift = isHandbraking && Math.abs(car.speed) > 5;
    car.isDrifting = shouldDrift;

    // Visual drift angle interpolation
    const targetDriftAngle = shouldDrift ? Math.abs(car.currentSteer) * 0.8 * Math.sign(car.speed) : 0;
    car.driftAngle = THREE.MathUtils.lerp(car.driftAngle, targetDriftAngle, deltaTime * (shouldDrift ? 3 : 5));

    // Steering physics (reduced turning circle at high speeds)
    const speedFactor = Math.min(1, Math.abs(car.speed) / CAR_CONFIG.maxSpeed);
    const steerAmount = car.currentSteer * car.turnSpeed * (1.2 - speedFactor * 0.5) * deltaTime;

    if (Math.abs(car.speed) > 0.1) {
        car.mesh.rotation.y += steerAmount * (car.speed > 0 ? 1 : -1);
    }

    // Apply drift velocity dampening
    if (shouldDrift) car.speed *= car.driftFactor;

    // Movement application
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.mesh.quaternion);
    const newPos = car.mesh.position.clone().add(forward.multiplyScalar(car.speed * deltaTime));
    
    // Wall collision detection
    const trackHalfWidth = 9; // Half of 18
    const carPos2D = new THREE.Vector2(newPos.x, newPos.z);
    let minDistToTrack = Infinity;
    let closestPoint = new THREE.Vector3();
    
    for (let i = 0; i < track.checkpoints.length; i++) {
        const cp = track.checkpoints[i];
        const dist = carPos2D.distanceTo(new THREE.Vector2(cp.x, cp.z));
        if (dist < minDistToTrack) {
            minDistToTrack = dist;
            closestPoint = cp;
        }
    }
    
    // If car is too far from track center, bounce back
    if (minDistToTrack > trackHalfWidth - 1) {
        // Push car back toward track center
        const toCenter = new THREE.Vector3(closestPoint.x - newPos.x, 0, closestPoint.z - newPos.z).normalize();
        newPos.add(toCenter.multiplyScalar(0.5));
        car.speed *= 0.5; // Lose speed on collision
    }
    
    car.mesh.position.copy(newPos);

    // Tree collision detection
    for (const tree of treePositions) {
        const dx = car.mesh.position.x - tree.x;
        const dz = car.mesh.position.z - tree.z;
        const distToTree = Math.sqrt(dx * dx + dz * dz);
        const carRadius = 1;
        
        if (distToTree < tree.radius + carRadius) {
            const pushX = (dx / distToTree) * (tree.radius + carRadius - distToTree);
            const pushZ = (dz / distToTree) * (tree.radius + carRadius - distToTree);
            car.mesh.position.x += pushX;
            car.mesh.position.z += pushZ;
            car.speed = 0;
            break;
        }
    }

    // Visuals: Body roll based on steering and speed
    const bodyMesh = car.mesh.children[0] as THREE.Mesh | undefined;
    if (bodyMesh) {
        const targetRoll = -car.currentSteer * speedFactor * 0.15;
        bodyMesh.rotation.z = THREE.MathUtils.lerp(bodyMesh.rotation.z, targetRoll, deltaTime * 8);
    }

    // Visuals: Wheels
    car.wheelMeshes.forEach((wheel, index) => {
        wheel.rotation.x += car.speed * deltaTime * 0.5;
        if (index < 2) wheel.rotation.y = car.currentSteer * 0.5; // Turn front wheels
    });

    // Visuals: Lights
    const time = Date.now() * 0.005;
    car.headlightLeft.intensity = 2 + Math.sin(time) * 0.3;
    car.headlightRight.intensity = 2 + Math.sin(time + 0.5) * 0.3;

    const brakeIntensity = inputState.brake ? 3 : 0.5;
    (car.taillightLeft.material as THREE.MeshStandardMaterial).emissiveIntensity = brakeIntensity;
    (car.taillightRight.material as THREE.MeshStandardMaterial).emissiveIntensity = brakeIntensity;
}

function activateNitro(car: CarState) {
    car.nitroActive = true;
    car.maxSpeed = CAR_CONFIG.maxSpeed * CAR_CONFIG.nitroBoost;
    if (nitroResetTimer) clearTimeout(nitroResetTimer);

    nitroResetTimer = setTimeout(() => {
        car.nitroActive = false;
        car.nitroAvailable = false;
        car.maxSpeed = CAR_CONFIG.maxSpeed;
    }, CAR_CONFIG.nitroDuration);
}

export function resetCar(car: CarState, track: TrackState) {
    car.mesh.position.copy(track.startPosition);
    car.mesh.rotation.set(0, track.startRotation, 0);
    car.velocity.set(0, 0, 0);
    car.speed = 0;
    car.driftAngle = 0;
    car.isDrifting = false;
    car.nitroAvailable = true;
    car.nitroActive = false;
    car.currentSteer = 0;
    resetControls();
}

function createCarModel(): THREE.Group {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(1.8, 0.6, 4);
    const bodyColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8844, 0x8844ff];
    const randomColor = bodyColors[Math.floor(Math.random() * bodyColors.length)];
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: randomColor,
        metalness: 0.7,
        roughness: 0.3,
        emissive: randomColor,
        emissiveIntensity: 0.2,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const cabinGeometry = new THREE.BoxGeometry(1.4, 0.5, 2);
    const cabinMaterial = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7,
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    group.add(cabin);

    const stripeColors = [0xffffff, 0xffff00, 0x00ffff, 0xff00ff];
    const stripeColor = stripeColors[Math.floor(Math.random() * stripeColors.length)];
    
    const stripGeometry = new THREE.BoxGeometry(1.85, 0.05, 0.15);
    const stripMaterial = new THREE.MeshStandardMaterial({
        color: stripeColor,
        emissive: stripeColor,
        emissiveIntensity: 0.6,
    });

    const strip1 = new THREE.Mesh(stripGeometry, stripMaterial);
    strip1.position.set(0, 0.95, -1.85);
    group.add(strip1);

    const strip2 = new THREE.Mesh(stripGeometry, stripMaterial);
    strip2.position.set(0, 0.95, 1.85);
    group.add(strip2);

    const strip3 = new THREE.Mesh(stripGeometry, stripMaterial);
    strip3.position.set(0, 0.95, 0);
    group.add(strip3);

    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.6,
        roughness: 0.4,
    });

    const wheelPositions = [
        [-0.9, 0.35, 1.2],
        [0.9, 0.35, 1.2],
        [-0.9, 0.35, -1.2],
        [0.9, 0.35, -1.2],
    ];

    wheelPositions.forEach((pos) => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        const [wheelX, wheelY, wheelZ] = pos;
        wheel.position.set(wheelX, wheelY, wheelZ);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        wheel.userData.isWheel = true;
        group.add(wheel);

        const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8);
        const rimMat = new THREE.MeshStandardMaterial({
            color: stripeColor,
            metalness: 0.9,
            roughness: 0.1,
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.set(wheelX, wheelY, wheelZ);
        rim.rotation.z = Math.PI / 2;
        group.add(rim);
    });

    const headlightGeo = new THREE.CircleGeometry(0.2, 12);
    const headlightMat = new THREE.MeshStandardMaterial({
        color: 0xffffcc,
        emissive: 0xffffaa,
        emissiveIntensity: 1,
    });
    
    const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
    headlightL.position.set(-0.6, 0.8, -1.99);
    group.add(headlightL);
    
    const headlightR = new THREE.Mesh(headlightGeo, headlightMat);
    headlightR.position.set(0.6, 0.8, -1.99);
    group.add(headlightR);

    const taillightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.05);
    const taillightMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.8,
    });
    
    const taillightL = new THREE.Mesh(taillightGeo, taillightMat);
    taillightL.position.set(-0.6, 0.8, 1.99);
    group.add(taillightL);
    
    const taillightR = new THREE.Mesh(taillightGeo, taillightMat);
    taillightR.position.set(0.6, 0.8, 1.99);
    group.add(taillightR);

    return group;
}

function createTaillight(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(0.3, 0.15, 0.1);
    const material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}

function resetControls() {
    Object.keys(inputState).forEach(key => {
        if (typeof (inputState as any)[key] === 'boolean') (inputState as any)[key] = false;
    });
    inputState.steerAxis = 0;
}

function setupControls() {
    // Consolidated keyboard handling via dictionary map
    const handleKey = (e: KeyboardEvent, isPressed: boolean) => {
        const stateKey = KEY_MAP[e.code];
        if (stateKey && typeof inputState[stateKey] === 'boolean') {
            (inputState as any)[stateKey] = isPressed;
        }
    };

    document.addEventListener('keydown', (e) => handleKey(e, true));
    document.addEventListener('keyup', (e) => handleKey(e, false));

    document.addEventListener('racer:input', (event) => {
        const detail = (event as CustomEvent<RacerInputPayload>).detail;
        if (!detail?.code || typeof detail.pressed !== 'boolean') return;
        const stateKey = KEY_MAP[detail.code];
        if (stateKey) (inputState as any)[stateKey] = detail.pressed;
    });

    document.addEventListener('racer:axis', (event) => {
        const detail = (event as CustomEvent<RacerAxisPayload>).detail;
        if (detail?.x !== undefined) inputState.steerAxis = THREE.MathUtils.clamp(-detail.x, -1, 1);
    });

    // Touch controls helper
    const bindTouch = (id: string, stateKey: keyof typeof inputState) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); (inputState as any)[stateKey] = true; });
            btn.addEventListener('touchend', (e) => { e.preventDefault(); (inputState as any)[stateKey] = false; });
        }
    };

    bindTouch('mobile-gas-btn', 'accelerate');
    bindTouch('mobile-brake-btn', 'brake');
    bindTouch('mobile-drift-btn', 'handbrake');

    window.addEventListener('blur', resetControls); // Clear inputs on tab out
}