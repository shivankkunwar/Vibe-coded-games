import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule';
import { Octree } from 'three/examples/jsm/math/Octree';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { state, updateState } from './state';
import { setCrosshairInteractable } from './ui';

const GRAVITY = 30;
const JUMP_FORCE = 10;
const PLAYER_SPEED = 5;
const PLAYER_SPRINT_SPEED = 8;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.7;
const INTERACTION_DISTANCE = 3.2;
const MOBILE_LOOK_SENSITIVITY_X = 0.00355;
const MOBILE_LOOK_SENSITIVITY_Y = 0.0031;
const MOBILE_MAX_PITCH = Math.PI * 0.42;
const MOBILE_LOOK_SMOOTHING = 0.36;
const MOBILE_LOOK_DECAY = 8.5;

export const playerVelocity = new THREE.Vector3();
export const playerDirection = new THREE.Vector3();
let playerOnFloor = false;

export const playerCollider = new Capsule(
    new THREE.Vector3(0, PLAYER_RADIUS, 0),
    new THREE.Vector3(0, PLAYER_HEIGHT - PLAYER_RADIUS, 0),
    PLAYER_RADIUS,
);

let worldOctree: Octree;
let controls: PointerLockControls;

const movementState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
};

let raycaster: THREE.Raycaster;
const centerScreen = new THREE.Vector2(0, 0);
let hoveredObject: THREE.Object3D | null = null;
let hoveredDistance = Number.POSITIVE_INFINITY;

type InteractionHandler = (object: THREE.Object3D) => void;
let interactionHandler: InteractionHandler | null = null;

let flashlight: THREE.SpotLight;
let torchGroup: THREE.Group;
const FLASHLIGHT_BOB_SPEED = 10;
const FLASHLIGHT_BOB_AMOUNT = 0.05;
let bobTime = 0;

let isTouchControlMode = false;
let pendingLookDeltaX = 0;
let pendingLookDeltaY = 0;
let mobileYaw = 0;
let mobilePitch = 0;
let mobileLookVelocityX = 0;
let mobileLookVelocityY = 0;
let mobileAxisX = 0;
let mobileAxisY = 0;

export function initPlayer(camera: THREE.PerspectiveCamera, scene: THREE.Scene, octree: Octree) {
    worldOctree = octree;
    isTouchControlMode = detectTouchControlMode();
    controls = new PointerLockControls(camera, document.body);
    camera.rotation.order = 'YXZ';

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
        canvas.addEventListener('click', () => {
            if (state.isRunning && !state.activeModal && !isTouchControlMode) {
                controls.lock();
            }
        });
    }

    controls.addEventListener('unlock', () => {
        if (state.isRunning && !state.activeModal && !state.gameWon) {
            updateState('activeModal', 'pause-modal');
        }
    });

    torchGroup = buildTorchModel();
    torchGroup.position.set(0.28, -0.38, -0.55);
    camera.add(torchGroup);

    flashlight = new THREE.SpotLight(0xf3f4ff, 10.5);
    flashlight.angle = Math.PI / 4.2;
    flashlight.penumbra = 0.65;
    flashlight.decay = 1.55;
    flashlight.distance = 42;
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    flashlight.shadow.camera.near = 0.5;
    flashlight.shadow.camera.far = 42;

    torchGroup.add(flashlight);
    flashlight.position.set(0, 0, -0.25);
    flashlight.target.position.set(0, 0, -5.5);
    torchGroup.add(flashlight.target);
    scene.add(camera);

    document.addEventListener('keydown', (event) => {
        setMovementState(event.code, true);
    });

    document.addEventListener('keyup', (event) => {
        setMovementState(event.code, false);
    });

    document.addEventListener('game3d:input', (event) => {
        const customEvent = event as CustomEvent<{ code: string; pressed: boolean }>;
        if (!customEvent.detail) {
            return;
        }
        setMovementState(customEvent.detail.code, customEvent.detail.pressed);
    });

    document.addEventListener('game3d:look', (event) => {
        const customEvent = event as CustomEvent<{ deltaX: number; deltaY: number }>;
        if (!customEvent.detail || !isTouchControlMode) {
            return;
        }
        pendingLookDeltaX += customEvent.detail.deltaX;
        pendingLookDeltaY += customEvent.detail.deltaY;
    });

    document.addEventListener('game3d:axis', (event) => {
        const customEvent = event as CustomEvent<{ x: number; y: number }>;
        if (!customEvent.detail || !isTouchControlMode) {
            return;
        }
        mobileAxisX = THREE.MathUtils.clamp(customEvent.detail.x, -1, 1);
        mobileAxisY = THREE.MathUtils.clamp(customEvent.detail.y, -1, 1);
    });

    document.addEventListener('mousedown', (event) => {
        if (event.button !== 0) {
            return;
        }
        if ((!controls.isLocked && !isTouchControlMode) || !state.isRunning || state.activeModal) {
            return;
        }
        tryInteraction();
    });

    raycaster = new THREE.Raycaster();
    resetPlayerPosition(camera, new THREE.Vector3(0, 1.6, 6));

    document.addEventListener('game3d:interact', () => {
        if ((!controls.isLocked && !isTouchControlMode) || !state.isRunning || state.activeModal) {
            return;
        }
        tryInteraction();
    });
}

export function setInteractionHandler(handler: InteractionHandler) {
    interactionHandler = handler;
}

export function resetPlayerPosition(camera: THREE.PerspectiveCamera, pos: THREE.Vector3) {
    playerVelocity.set(0, 0, 0);
    playerCollider.start.set(pos.x, pos.y + PLAYER_RADIUS, pos.z);
    playerCollider.end.set(pos.x, pos.y + PLAYER_HEIGHT - PLAYER_RADIUS, pos.z);
    camera.position.copy(pos);
}

export function requestPointerLock() {
    if (isTouchControlMode) {
        return;
    }
    if (controls && !controls.isLocked) {
        controls.lock();
    }
}

export function updatePlayer(
    deltaTime: number,
    camera: THREE.PerspectiveCamera,
    interactableObjects: THREE.Object3D[],
) {
    const inputEnabled = controls.isLocked || isTouchControlMode;
    if (!inputEnabled) {
        hoveredObject = null;
        hoveredDistance = Number.POSITIVE_INFINITY;
        setCrosshairInteractable(false);
        return;
    }

    if (isTouchControlMode) {
        const targetDeltaX = THREE.MathUtils.clamp(pendingLookDeltaX, -64, 64);
        const targetDeltaY = THREE.MathUtils.clamp(pendingLookDeltaY, -64, 64);
        pendingLookDeltaX = 0;
        pendingLookDeltaY = 0;

        mobileLookVelocityX = THREE.MathUtils.lerp(
            mobileLookVelocityX,
            targetDeltaX,
            MOBILE_LOOK_SMOOTHING,
        );
        mobileLookVelocityY = THREE.MathUtils.lerp(
            mobileLookVelocityY,
            targetDeltaY,
            MOBILE_LOOK_SMOOTHING,
        );

        mobileYaw -= mobileLookVelocityX * MOBILE_LOOK_SENSITIVITY_X;
        mobilePitch -= mobileLookVelocityY * MOBILE_LOOK_SENSITIVITY_Y;
        mobilePitch = Math.max(-MOBILE_MAX_PITCH, Math.min(MOBILE_MAX_PITCH, mobilePitch));
        camera.rotation.set(mobilePitch, mobileYaw, 0);

        const decay = Math.exp(-MOBILE_LOOK_DECAY * deltaTime);
        mobileLookVelocityX *= decay;
        mobileLookVelocityY *= decay;
    } else {
        mobileYaw = camera.rotation.y;
        mobilePitch = camera.rotation.x;
        mobileLookVelocityX = 0;
        mobileLookVelocityY = 0;
    }

    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);
    const maxSpeed = movementState.sprint ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;

    const forwardInput = THREE.MathUtils.clamp(
        (movementState.forward ? 1 : 0) - (movementState.backward ? 1 : 0) + mobileAxisY,
        -1,
        1,
    );
    const sideInput = THREE.MathUtils.clamp(
        (movementState.right ? 1 : 0) - (movementState.left ? 1 : 0) + mobileAxisX,
        -1,
        1,
    );

    if (Math.abs(forwardInput) > 0.001) {
        playerVelocity.add(getForwardVector(camera).multiplyScalar(speedDelta * forwardInput));
    }
    if (Math.abs(sideInput) > 0.001) {
        playerVelocity.add(getSideVector(camera).multiplyScalar(speedDelta * sideInput));
    }
    if (playerOnFloor && movementState.jump) {
        playerVelocity.y = JUMP_FORCE;
        movementState.jump = false;
    }

    let damping = Math.exp(-4 * deltaTime) - 1;
    if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * deltaTime;
        damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const currentSpeed = Math.sqrt(playerVelocity.x ** 2 + playerVelocity.z ** 2);
    if (currentSpeed > maxSpeed) {
        const ratio = maxSpeed / currentSpeed;
        playerVelocity.x *= ratio;
        playerVelocity.z *= ratio;
    }

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();
    camera.position.copy(playerCollider.end);

    if (playerOnFloor && currentSpeed > 0.4) {
        bobTime += deltaTime * FLASHLIGHT_BOB_SPEED * (movementState.sprint ? 1.4 : 1);
        torchGroup.position.y = -0.38 + Math.sin(bobTime) * FLASHLIGHT_BOB_AMOUNT;
        torchGroup.rotation.z = -0.12 + Math.sin(bobTime * 0.5) * 0.03;
    } else {
        torchGroup.position.y = -0.38;
        torchGroup.rotation.z = -0.12;
        bobTime = 0;
    }

    raycaster.setFromCamera(centerScreen, camera);
    const intersections = raycaster.intersectObjects(interactableObjects, true);
    if (intersections.length > 0 && intersections[0].distance <= INTERACTION_DISTANCE) {
        hoveredObject = intersections[0].object;
        hoveredDistance = intersections[0].distance;
        setCrosshairInteractable(true);
    } else {
        hoveredObject = null;
        hoveredDistance = Number.POSITIVE_INFINITY;
        setCrosshairInteractable(false);
    }
}

function playerCollisions() {
    if (!worldOctree) {
        return;
    }

    const result = worldOctree.capsuleIntersect(playerCollider);
    playerOnFloor = false;

    if (result) {
        playerOnFloor = result.normal.y > 0;
        if (!playerOnFloor) {
            playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }
        playerCollider.translate(result.normal.multiplyScalar(result.depth));
    }
}

function getForwardVector(camera: THREE.PerspectiveCamera) {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    return playerDirection;
}

function getSideVector(camera: THREE.PerspectiveCamera) {
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);
    return playerDirection;
}

function setMovementState(code: string, pressed: boolean) {
    switch (code) {
        case 'KeyW':
        case 'ArrowUp':
            movementState.forward = pressed;
            break;
        case 'KeyS':
        case 'ArrowDown':
            movementState.backward = pressed;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            movementState.left = pressed;
            break;
        case 'KeyD':
        case 'ArrowRight':
            movementState.right = pressed;
            break;
        case 'Space':
            movementState.jump = pressed;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            movementState.sprint = pressed;
            break;
    }
}

export function getPlayerControls() {
    return controls;
}

function tryInteraction() {
    if (hoveredObject && hoveredDistance <= INTERACTION_DISTANCE) {
        interactionHandler?.(hoveredObject);
    }
}

function detectTouchControlMode(): boolean {
    return window.matchMedia('(pointer: coarse)').matches
        || ('ontouchstart' in window);
}

function buildTorchModel(): THREE.Group {
    const group = new THREE.Group();
    group.rotation.set(-0.08, -0.16, -0.12);

    const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.05, 0.34, 14),
        new THREE.MeshStandardMaterial({
            color: 0x1f2736,
            metalness: 0.45,
            roughness: 0.4,
        }),
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -0.03, -0.03);
    group.add(handle);

    const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.066, 0.12, 16),
        new THREE.MeshStandardMaterial({
            color: 0x4f5f74,
            metalness: 0.75,
            roughness: 0.22,
        }),
    );
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0, -0.21);
    group.add(head);

    const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.048, 16),
        new THREE.MeshStandardMaterial({
            color: 0xe9f2ff,
            emissive: 0xbad6ff,
            emissiveIntensity: 0.5,
            roughness: 0.2,
            metalness: 0.1,
        }),
    );
    lens.position.set(0, 0, -0.27);
    group.add(lens);

    const sideGlow = new THREE.PointLight(0xb7cbff, 0.85, 2.5, 2);
    sideGlow.position.set(0, -0.01, -0.2);
    sideGlow.castShadow = false;
    group.add(sideGlow);

    return group;
}
