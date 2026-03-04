import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree';
import type { MirrorOrientation } from './puzzles';

export type InteractableId =
    | 'uv-panel'
    | 'mirror-1'
    | 'mirror-2'
    | 'mirror-3'
    | 'cipher-terminal'
    | 'director-safe'
    | 'fuse-box'
    | 'card-reader';

interface Laser {
    mesh: THREE.Mesh;
    axis: 'x' | 'z';
    baseX: number;
    baseZ: number;
    amplitude: number;
    speed: number;
    phase: number;
    length: number;
}

interface Crate {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    startX: number;
    startZ: number;
}

interface Plate {
    mesh: THREE.Mesh;
    active: boolean;
    position: THREE.Vector3;
}

interface PulseBeacon {
    mesh: THREE.Mesh;
    light: THREE.PointLight;
    baseIntensity: number;
    speed: number;
    phase: number;
    zone: 'door' | 'laser' | 'ambient';
}

export interface WorldUpdateResult {
    laserHit: boolean;
    platesChanged: boolean;
    activePlateCount: number;
    allPlatesActive: boolean;
    reachedExit: boolean;
    blockedByDoor: boolean;
    doorProgress: number;
}

const spawnPoints = {
    room1: new THREE.Vector3(0, 1.6, 6),
    room2: new THREE.Vector3(0, 1.6, -12.6),
    room3: new THREE.Vector3(20, 1.6, -18),
    room4: new THREE.Vector3(20, 1.6, 1.5),
};

let sceneRef: THREE.Scene;
let worldOctree: Octree;

const lasers: Laser[] = [];
const crates: Crate[] = [];
const plates: Plate[] = [];
const pulseBeacons: PulseBeacon[] = [];
const ambientDust: THREE.Points[] = [];

let elapsed = 0;
let lastLaserHitAt = -100;
let activePlateCount = 0;
let routingPulse = 0;

let leftDoor: THREE.Mesh | null = null;
let rightDoor: THREE.Mesh | null = null;
let doorShouldOpen = false;
let doorOpenProgress = 0;

let safeTerminal: THREE.Mesh | null = null;
let routingReceptor: THREE.Mesh | null = null;

const routingMirrorHeads: THREE.Mesh[] = [];
const routingMirrorArrows: THREE.Mesh[] = [];
const routingBeamSegments: THREE.Mesh[] = [];
const routingOrientations: MirrorOrientation[] = [0, 0, 0];
let routingSolution: [MirrorOrientation, MirrorOrientation, MirrorOrientation] = [0, 0, 0];

export const interactableObjects: THREE.Object3D[] = [];

export async function initWorld(manager: THREE.LoadingManager, scene: THREE.Scene): Promise<Octree> {
    sceneRef = scene;
    worldOctree = new Octree();

    interactableObjects.length = 0;
    lasers.length = 0;
    crates.length = 0;
    plates.length = 0;
    pulseBeacons.length = 0;
    ambientDust.length = 0;
    routingMirrorHeads.length = 0;
    routingMirrorArrows.length = 0;
    routingBeamSegments.length = 0;

    routingOrientations[0] = 0;
    routingOrientations[1] = 0;
    routingOrientations[2] = 0;

    elapsed = 0;
    lastLaserHitAt = -100;
    activePlateCount = 0;
    doorShouldOpen = false;
    doorOpenProgress = 0;
    routingPulse = 0;

    const ambient = new THREE.HemisphereLight(0x90b7e6, 0x1a1e2b, 0.34);
    sceneRef.add(ambient);

    const guideLight = new THREE.PointLight(0x75c8ff, 0.8, 45, 2);
    guideLight.position.set(20, 2.8, -10);
    sceneRef.add(guideLight);

    createRoomLighting();
    createArchitecture();
    createSetDressing();
    createInfrastructureDetail();
    createInteractables();
    createLaserRoutingRig();
    createLaserGrid();
    createStoragePuzzle();
    createExitDoor();
    createPulseBeaconNetwork();
    createAmbientDustField();

    manager.itemStart('world-bootstrap');
    manager.itemEnd('world-bootstrap');

    return worldOctree;
}

export function updateWorld(deltaTime: number, playerPosition: THREE.Vector3): WorldUpdateResult {
    elapsed += deltaTime;
    routingPulse += deltaTime * 5;

    for (const beacon of pulseBeacons) {
        const pulse = 0.66 + Math.sin(elapsed * beacon.speed + beacon.phase) * 0.34;
        const zoneScalar = beacon.zone === 'door' && doorOpenProgress >= 0.98 ? 0.42 : 1;
        beacon.light.intensity = beacon.baseIntensity * pulse * zoneScalar;

        const material = beacon.mesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.35 + pulse * 0.55 * zoneScalar;
    }

    for (const dust of ambientDust) {
        dust.rotation.y += deltaTime * 0.018;
    }

    let laserHit = false;
    for (const laser of lasers) {
        const travel = Math.sin(elapsed * laser.speed + laser.phase) * laser.amplitude;
        if (laser.axis === 'x') {
            laser.mesh.position.x = laser.baseX + travel;
        } else {
            laser.mesh.position.z = laser.baseZ + travel;
        }

        const inHeight = playerPosition.y > 0.45 && playerPosition.y < 2.2;
        const hitZ = Math.abs(playerPosition.z - laser.mesh.position.z) < 0.33;
        const hitX = Math.abs(playerPosition.x - laser.mesh.position.x) < laser.length * 0.5 + 0.35;
        if (inHeight && hitX && hitZ && elapsed - lastLaserHitAt > 1.0) {
            laserHit = true;
            lastLaserHitAt = elapsed;
        }
    }

    for (let i = 0; i < routingBeamSegments.length; i += 1) {
        const beam = routingBeamSegments[i];
        const material = beam.material as THREE.MeshStandardMaterial;
        const active = Boolean(beam.userData.active);
        if (active) {
            material.emissiveIntensity = 0.45 + Math.sin(routingPulse + i * 0.5) * 0.15;
        } else {
            material.emissiveIntensity = 0.03;
        }
    }

    updateCrates(deltaTime, playerPosition);

    const previousPlateCount = activePlateCount;
    activePlateCount = 0;
    for (const plate of plates) {
        const occupied = crates.some((crate) => {
            const distance = Math.hypot(
                crate.mesh.position.x - plate.position.x,
                crate.mesh.position.z - plate.position.z,
            );
            return distance < 1.15;
        });

        plate.active = occupied;
        const plateMaterial = plate.mesh.material as THREE.MeshStandardMaterial;
        if (occupied) {
            activePlateCount += 1;
            plateMaterial.emissive.setHex(0x30ff8f);
            plateMaterial.emissiveIntensity = 0.5;
        } else {
            plateMaterial.emissive.setHex(0x000000);
            plateMaterial.emissiveIntensity = 0;
        }
    }

    if (safeTerminal) {
        const safeMaterial = safeTerminal.material as THREE.MeshStandardMaterial;
        if (activePlateCount === 3) {
            safeMaterial.emissive.setHex(0x30ff8f);
            safeMaterial.emissiveIntensity = 0.45;
        } else {
            safeMaterial.emissive.setHex(0x111111);
            safeMaterial.emissiveIntensity = 0.15;
        }
    }

    if (doorShouldOpen) {
        doorOpenProgress = Math.min(1, doorOpenProgress + deltaTime * 0.55);
    }

    if (leftDoor && rightDoor) {
        leftDoor.position.x = 19 - doorOpenProgress * 1.25;
        rightDoor.position.x = 21 + doorOpenProgress * 1.25;
    }

    const blockedByDoor =
        doorOpenProgress < 0.98
        && playerPosition.z > 9
        && playerPosition.z < 11.5
        && playerPosition.x > 18
        && playerPosition.x < 22;

    const reachedExit =
        doorOpenProgress >= 0.98
        && playerPosition.z > 10.35
        && playerPosition.x > 18
        && playerPosition.x < 22;

    return {
        laserHit,
        platesChanged: previousPlateCount !== activePlateCount,
        activePlateCount,
        allPlatesActive: activePlateCount === 3,
        reachedExit,
        blockedByDoor,
        doorProgress: doorOpenProgress,
    };
}

export function getSpawnPoint(room: keyof typeof spawnPoints): THREE.Vector3 {
    return spawnPoints[room].clone();
}

export function getInteractionId(object: THREE.Object3D): InteractableId | null {
    let current: THREE.Object3D | null = object;
    while (current) {
        const interactionId = current.userData.interactionId as InteractableId | undefined;
        if (interactionId) {
            return interactionId;
        }
        current = current.parent;
    }
    return null;
}

export function setDoorOpen(open: boolean) {
    doorShouldOpen = open;
}

export function resetWorldRunState() {
    elapsed = 0;
    lastLaserHitAt = -100;
    activePlateCount = 0;
    routingPulse = 0;
    doorShouldOpen = false;
    doorOpenProgress = 0;

    if (leftDoor && rightDoor) {
        leftDoor.position.x = 19;
        rightDoor.position.x = 21;
    }

    for (let i = 0; i < routingOrientations.length; i += 1) {
        routingOrientations[i] = 0;
    }
    updateLaserRoutingVisuals();

    for (const crate of crates) {
        crate.velocity.set(0, 0, 0);
        crate.mesh.position.x = crate.startX;
        crate.mesh.position.z = crate.startZ;
    }

    for (const plate of plates) {
        plate.active = false;
        const plateMaterial = plate.mesh.material as THREE.MeshStandardMaterial;
        plateMaterial.emissive.setHex(0x000000);
        plateMaterial.emissiveIntensity = 0;
    }

    if (safeTerminal) {
        const safeMaterial = safeTerminal.material as THREE.MeshStandardMaterial;
        safeMaterial.emissive.setHex(0x111111);
        safeMaterial.emissiveIntensity = 0.15;
    }
}

export function setLaserRoutingSolution(
    solution: [MirrorOrientation, MirrorOrientation, MirrorOrientation],
) {
    routingSolution = [...solution] as [MirrorOrientation, MirrorOrientation, MirrorOrientation];
    updateLaserRoutingVisuals();
}

export function rotateLaserRoutingMirror(index: number): MirrorOrientation {
    if (index < 0 || index >= routingOrientations.length) {
        return 0;
    }
    const next = ((routingOrientations[index] + 1) % 4) as MirrorOrientation;
    routingOrientations[index] = next;
    updateLaserRoutingVisuals();
    return next;
}

export function getLaserMirrorOrientations(): [MirrorOrientation, MirrorOrientation, MirrorOrientation] {
    return [
        routingOrientations[0],
        routingOrientations[1],
        routingOrientations[2],
    ];
}

function createArchitecture() {
    const floorTexture = createPanelTexture('#1b2537', '#28354a', '#36506f', 24, 0.06);
    floorTexture.repeat.set(12, 12);
    const wallTexture = createPanelTexture('#283346', '#324055', '#4a6888', 34, 0.05);
    wallTexture.repeat.set(8, 4);
    const ceilingTexture = createPanelTexture('#1a2231', '#212c3f', '#2d3e56', 30, 0.04);
    ceilingTexture.repeat.set(10, 6);

    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xcad8ef,
        map: floorTexture,
        roughness: 0.86,
        metalness: 0.06,
    });
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4e2f6,
        map: wallTexture,
        roughness: 0.76,
        metalness: 0.08,
    });
    const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0xb1c5e0,
        map: ceilingTexture,
        roughness: 0.83,
        metalness: 0.04,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
        color: 0x1f3148,
        emissive: 0x12253d,
        emissiveIntensity: 0.25,
        roughness: 0.45,
    });

    addStaticBox(44, 0.4, 42, 10, -0.2, -10, floorMaterial);
    addStaticBox(44, 0.4, 42, 10, 4.2, -10, ceilingMaterial);

    addStaticBox(30, 4.4, 1, 3, 2, 11, wallMaterial);
    addStaticBox(10, 4.4, 1, 27, 2, 11, wallMaterial);

    addStaticBox(44, 4.4, 1, 10, 2, -31, wallMaterial);
    addStaticBox(1, 4.4, 42, -12, 2, -10, wallMaterial);
    addStaticBox(1, 4.4, 42, 32, 2, -10, wallMaterial);

    addStaticBox(10, 4.4, 1, -7, 2, -10, wallMaterial);
    addStaticBox(16, 4.4, 1, 10, 2, -10, wallMaterial);
    addStaticBox(10, 4.4, 1, 27, 2, -10, wallMaterial);

    addStaticBox(1, 4.4, 9, 10, 2, -26.5, wallMaterial);
    addStaticBox(1, 4.4, 29, 10, 2, -3.5, wallMaterial);

    addDecorBox(8.5, 0.06, 0.22, 0, 0.03, -9.9, trimMaterial);
    addDecorBox(8.5, 0.06, 0.22, 0, 0.03, -10.7, trimMaterial);
    addDecorBox(8.5, 0.06, 0.22, 0, 0.03, -11.5, trimMaterial);

    addDecorBox(8.5, 0.06, 0.22, 20, 0.03, -9.9, trimMaterial);
    addDecorBox(8.5, 0.06, 0.22, 20, 0.03, -10.7, trimMaterial);
    addDecorBox(8.5, 0.06, 0.22, 20, 0.03, -11.5, trimMaterial);

    addDecorBox(4.2, 0.06, 0.22, 20, 0.03, 8.8, trimMaterial);
    addDecorBox(4.2, 0.06, 0.22, 20, 0.03, 9.4, trimMaterial);
}

function createSetDressing() {
    const pillarMaterial = new THREE.MeshStandardMaterial({
        color: 0x48566f,
        roughness: 0.7,
        metalness: 0.2,
    });
    const crateMaterial = new THREE.MeshStandardMaterial({
        color: 0x2f3b4e,
        roughness: 0.55,
        metalness: 0.35,
    });

    const pillarPositions = [
        new THREE.Vector3(-8.5, 1.75, -20),
        new THREE.Vector3(8.5, 1.75, -20),
        new THREE.Vector3(12, 1.75, -5),
        new THREE.Vector3(28, 1.75, -5),
    ];

    for (const position of pillarPositions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.8), pillarMaterial);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sceneRef.add(mesh);
        worldOctree.fromGraphNode(mesh);
    }

    const cratePositions = [
        new THREE.Vector3(-6, 0.45, -5),
        new THREE.Vector3(6, 0.45, -5),
        new THREE.Vector3(26, 0.45, 4),
    ];

    for (const position of cratePositions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), crateMaterial);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sceneRef.add(mesh);
        worldOctree.fromGraphNode(mesh);
    }
}

function createInfrastructureDetail() {
    const pipeMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a6c84,
        roughness: 0.46,
        metalness: 0.55,
    });
    const conduitMaterial = new THREE.MeshStandardMaterial({
        color: 0x38455b,
        roughness: 0.58,
        metalness: 0.22,
    });
    const canisterGlassMaterial = new THREE.MeshStandardMaterial({
        color: 0x76cbff,
        emissive: 0x2c8ad1,
        emissiveIntensity: 0.45,
        transparent: true,
        opacity: 0.68,
        roughness: 0.16,
        metalness: 0.1,
    });
    const canisterFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x33435a,
        roughness: 0.5,
        metalness: 0.4,
    });

    const pipeRuns = [
        { x: -5.8, y: 3.25, z: -12.5, length: 24, axis: 'z' as const },
        { x: 5.8, y: 3.25, z: -12.5, length: 24, axis: 'z' as const },
        { x: 20, y: 3.25, z: -12.5, length: 24, axis: 'z' as const },
        { x: 20, y: 3.25, z: 3.2, length: 10.5, axis: 'z' as const },
    ];

    for (const run of pipeRuns) {
        const geometry = new THREE.CylinderGeometry(0.16, 0.16, run.length, 14);
        const mesh = new THREE.Mesh(geometry, pipeMaterial);
        mesh.position.set(run.x, run.y, run.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (run.axis === 'z') {
            mesh.rotation.x = Math.PI / 2;
        } else {
            mesh.rotation.z = Math.PI / 2;
        }
        sceneRef.add(mesh);
        worldOctree.fromGraphNode(mesh);

        const joints = Math.max(2, Math.floor(run.length / 5));
        for (let i = 0; i < joints; i += 1) {
            const t = joints === 1 ? 0 : i / (joints - 1);
            const joint = new THREE.Mesh(
                new THREE.TorusGeometry(0.18, 0.04, 10, 16),
                pipeMaterial,
            );
            if (run.axis === 'z') {
                joint.position.set(run.x, run.y, run.z - run.length / 2 + run.length * t);
                joint.rotation.x = Math.PI / 2;
            } else {
                joint.position.set(run.x - run.length / 2 + run.length * t, run.y, run.z);
                joint.rotation.y = Math.PI / 2;
            }
            sceneRef.add(joint);
        }
    }

    const conduitRows = [
        { x: -11.4, z: -20, length: 20, axis: 'z' as const },
        { x: 31.4, z: -20, length: 20, axis: 'z' as const },
        { x: 20, z: 10.4, length: 8, axis: 'x' as const },
    ];

    for (const row of conduitRows) {
        for (let i = 0; i < 4; i += 1) {
            if (row.axis === 'z') {
                addDecorBox(0.08, 0.08, row.length, row.x + i * 0.16, 1.7 + i * 0.16, row.z, conduitMaterial);
            } else {
                addDecorBox(row.length, 0.08, 0.08, row.x, 1.7 + i * 0.16, row.z + i * 0.16, conduitMaterial);
            }
        }
    }

    const canisterPositions = [
        new THREE.Vector3(-8.8, 0.95, -24.5),
        new THREE.Vector3(8.8, 0.95, -24.5),
        new THREE.Vector3(14.2, 0.95, -21.4),
        new THREE.Vector3(25.8, 0.95, -21.4),
    ];

    for (const pos of canisterPositions) {
        const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.95, 16), canisterFrameMaterial);
        frame.position.set(pos.x, pos.y, pos.z);
        frame.castShadow = true;
        frame.receiveShadow = true;
        sceneRef.add(frame);
        worldOctree.fromGraphNode(frame);

        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.55, 18), canisterGlassMaterial);
        glass.position.set(pos.x, pos.y, pos.z);
        glass.castShadow = false;
        glass.receiveShadow = false;
        sceneRef.add(glass);

        const glow = new THREE.PointLight(0x4ac6ff, 0.7, 7.5, 2);
        glow.position.set(pos.x, pos.y + 0.2, pos.z);
        sceneRef.add(glow);
    }
}

function createInteractables() {
    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e4f5c,
        emissive: 0x2ad8f3,
        emissiveIntensity: 0.35,
        roughness: 0.45,
    });

    createInteractable('uv-panel', 1.6, 2, 0.25, 0, 1.7, -7.3, panelMaterial);

    createInteractable('cipher-terminal', 1.6, 2, 0.3, 20, 1.7, -27.2, panelMaterial);
    safeTerminal = createInteractable('director-safe', 2.2, 1.8, 0.6, 20, 1.1, -12.7, panelMaterial);

    createInteractable('fuse-box', 1.4, 1.8, 0.35, 18, 1.6, 7.5, panelMaterial);
    createInteractable('card-reader', 0.6, 1.2, 0.3, 22, 1.4, 7.7, panelMaterial);
}

function createLaserRoutingRig() {
    const mirrorBaseMaterial = new THREE.MeshStandardMaterial({
        color: 0x30465f,
        roughness: 0.68,
        metalness: 0.25,
    });
    const mirrorHeadMaterial = new THREE.MeshStandardMaterial({
        color: 0x6f849f,
        roughness: 0.3,
        metalness: 0.5,
    });

    const sourceMaterial = new THREE.MeshStandardMaterial({
        color: 0x5f7eb5,
        emissive: 0x2f65d6,
        emissiveIntensity: 0.55,
        roughness: 0.25,
    });
    const receptorMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b3f54,
        emissive: 0x12426d,
        emissiveIntensity: 0.2,
        roughness: 0.45,
    });

    const mirrorPositions = [
        new THREE.Vector3(-4, 0.72, -25.2),
        new THREE.Vector3(0, 0.72, -25.8),
        new THREE.Vector3(4, 0.72, -25.2),
    ];

    for (let i = 0; i < mirrorPositions.length; i += 1) {
        const basePosition = mirrorPositions[i];

        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.45, 18), mirrorBaseMaterial);
        base.position.copy(basePosition);
        base.castShadow = true;
        base.receiveShadow = true;
        sceneRef.add(base);
        worldOctree.fromGraphNode(base);

        const head = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 1.05), mirrorHeadMaterial.clone());
        head.position.set(basePosition.x, 1.53, basePosition.z);
        head.castShadow = true;
        head.receiveShadow = true;
        head.userData.interactionId = (`mirror-${i + 1}` as InteractableId);
        sceneRef.add(head);

        const arrow = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.07, 0.58),
            new THREE.MeshStandardMaterial({
                color: 0x7fa7d8,
                emissive: 0x345e9a,
                emissiveIntensity: 0.25,
                roughness: 0.35,
            }),
        );
        arrow.position.set(0, 0.17, -0.19);
        head.add(arrow);

        routingMirrorHeads.push(head);
        routingMirrorArrows.push(arrow);
        interactableObjects.push(head);
    }

    const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), sourceMaterial);
    emitter.position.set(0, 1.3, -27.8);
    emitter.castShadow = true;
    sceneRef.add(emitter);

    routingReceptor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.2), receptorMaterial);
    routingReceptor.position.set(0, 1.45, -30.8);
    sceneRef.add(routingReceptor);

    const segmentPoints: [THREE.Vector3, THREE.Vector3][] = [
        [new THREE.Vector3(0, 1.3, -27.8), new THREE.Vector3(-4, 1.53, -25.2)],
        [new THREE.Vector3(-4, 1.53, -25.2), new THREE.Vector3(0, 1.53, -25.8)],
        [new THREE.Vector3(0, 1.53, -25.8), new THREE.Vector3(4, 1.53, -25.2)],
        [new THREE.Vector3(4, 1.53, -25.2), new THREE.Vector3(0, 1.45, -30.8)],
    ];

    for (const [start, end] of segmentPoints) {
        const segment = createBeamSegment(start, end);
        routingBeamSegments.push(segment);
        sceneRef.add(segment);
    }

    updateLaserRoutingVisuals();
}

function createLaserGrid() {
    const beamMaterial = new THREE.MeshStandardMaterial({
        color: 0xff2f2f,
        emissive: 0xff4040,
        emissiveIntensity: 0.65,
        roughness: 0.2,
    });

    for (let i = 0; i < 5; i += 1) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.14, 0.14), beamMaterial.clone());
        mesh.position.set(0, 1.1, -14 - i * 2.4);
        sceneRef.add(mesh);

        const warningStrip = new THREE.Mesh(
            new THREE.BoxGeometry(8.5, 0.04, 0.2),
            new THREE.MeshStandardMaterial({
                color: 0x5a1313,
                emissive: 0xb61a1a,
                emissiveIntensity: 0.25,
                roughness: 0.6,
            }),
        );
        warningStrip.position.set(0, 0.02, -14 - i * 2.4);
        sceneRef.add(warningStrip);

        lasers.push({
            mesh,
            axis: 'x',
            baseX: 0,
            baseZ: -14 - i * 2.4,
            amplitude: 4.8,
            speed: 1.1 + i * 0.21,
            phase: i * 1.1,
            length: 6.5,
        });
    }
}

function createStoragePuzzle() {
    const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x6f5947, roughness: 0.72 });
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0x17463d,
        emissive: 0x000000,
        roughness: 0.5,
    });

    const cratePositions = [
        new THREE.Vector3(15.5, 0.7, -18.2),
        new THREE.Vector3(20.0, 0.7, -23.7),
        new THREE.Vector3(24.5, 0.7, -18.2),
    ];

    for (const position of cratePositions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), crateMaterial);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sceneRef.add(mesh);
        crates.push({
            mesh,
            velocity: new THREE.Vector3(),
            minX: 13.1,
            maxX: 26.9,
            minZ: -27.8,
            maxZ: -13.1,
            startX: position.x,
            startZ: position.z,
        });
    }

    const platePositions = [
        new THREE.Vector3(15.5, 0.1, -14.8),
        new THREE.Vector3(20.0, 0.1, -14.8),
        new THREE.Vector3(24.5, 0.1, -14.8),
    ];

    for (const platePosition of platePositions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 1.9), plateMaterial.clone());
        mesh.position.copy(platePosition);
        mesh.receiveShadow = true;
        sceneRef.add(mesh);
        plates.push({
            mesh,
            active: false,
            position: platePosition.clone(),
        });
    }
}

function createExitDoor() {
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0x212a3f,
        emissive: 0x102035,
        emissiveIntensity: 0.35,
        roughness: 0.33,
    });

    leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.4, 0.35), doorMaterial);
    rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.4, 0.35), doorMaterial.clone());

    leftDoor.position.set(19, 1.7, 10.5);
    rightDoor.position.set(21, 1.7, 10.5);

    leftDoor.castShadow = true;
    rightDoor.castShadow = true;

    sceneRef.add(leftDoor);
    sceneRef.add(rightDoor);
}

function createInteractable(
    id: InteractableId,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.MeshStandardMaterial,
): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone());
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.interactionId = id;
    sceneRef.add(mesh);
    interactableObjects.push(mesh);
    worldOctree.fromGraphNode(mesh);
    return mesh;
}

function addStaticBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    sceneRef.add(mesh);
    worldOctree.fromGraphNode(mesh);
}

function addDecorBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    sceneRef.add(mesh);
}

function createRoomLighting() {
    const roomLights = [
        { x: 0, y: 2.4, z: 4.5, color: 0x6fb7ff, intensity: 1.2, distance: 16 },
        { x: 0, y: 2.4, z: -20, color: 0x7ee5ff, intensity: 1.3, distance: 18 },
        { x: 20, y: 2.4, z: -20, color: 0x97d8ff, intensity: 1.3, distance: 18 },
        { x: 20, y: 2.5, z: 3.2, color: 0xa8c4ff, intensity: 1.1, distance: 15 },
    ];

    for (const lightDef of roomLights) {
        const light = new THREE.PointLight(lightDef.color, lightDef.intensity, lightDef.distance, 2);
        light.position.set(lightDef.x, lightDef.y, lightDef.z);
        light.castShadow = false;
        sceneRef.add(light);

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 10, 10),
            new THREE.MeshStandardMaterial({
                color: lightDef.color,
                emissive: lightDef.color,
                emissiveIntensity: 1.0,
                roughness: 0.35,
            }),
        );
        marker.position.copy(light.position);
        sceneRef.add(marker);
    }
}

function createPulseBeaconNetwork() {
    const beaconDefs = [
        { x: -4.7, y: 2.2, z: -13.6, color: 0xff5454, base: 1.05, speed: 2.8, phase: 0.2, zone: 'laser' as const },
        { x: 4.7, y: 2.2, z: -18.4, color: 0xff5454, base: 1.0, speed: 3.1, phase: 0.8, zone: 'laser' as const },
        { x: 18.3, y: 2.3, z: 9.6, color: 0x6bd5ff, base: 0.85, speed: 1.9, phase: 1.6, zone: 'door' as const },
        { x: 21.7, y: 2.3, z: 9.6, color: 0x6bd5ff, base: 0.85, speed: 1.9, phase: 2.3, zone: 'door' as const },
        { x: 0, y: 2.35, z: -28.5, color: 0x86b6ff, base: 0.75, speed: 1.4, phase: 0.4, zone: 'ambient' as const },
    ];

    for (const def of beaconDefs) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 12, 12),
            new THREE.MeshStandardMaterial({
                color: def.color,
                emissive: def.color,
                emissiveIntensity: 0.75,
                roughness: 0.25,
            }),
        );
        mesh.position.set(def.x, def.y, def.z);
        sceneRef.add(mesh);

        const light = new THREE.PointLight(def.color, def.base, 8.2, 2);
        light.position.copy(mesh.position);
        light.castShadow = false;
        sceneRef.add(light);

        pulseBeacons.push({
            mesh,
            light,
            baseIntensity: def.base,
            speed: def.speed,
            phase: def.phase,
            zone: def.zone,
        });
    }
}

function createAmbientDustField() {
    const dustRegions = [
        { center: new THREE.Vector3(0, 1.9, -8), spreadX: 12, spreadY: 2.5, spreadZ: 14, count: 140 },
        { center: new THREE.Vector3(0, 1.9, -20), spreadX: 10, spreadY: 2.2, spreadZ: 10, count: 120 },
        { center: new THREE.Vector3(20, 1.9, -20), spreadX: 10, spreadY: 2.2, spreadZ: 10, count: 120 },
        { center: new THREE.Vector3(20, 1.9, 3), spreadX: 8, spreadY: 2.2, spreadZ: 9, count: 90 },
    ];

    for (const region of dustRegions) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(region.count * 3);
        const alpha = new Float32Array(region.count);

        for (let i = 0; i < region.count; i += 1) {
            const index = i * 3;
            positions[index] = region.center.x + (Math.random() * 2 - 1) * region.spreadX;
            positions[index + 1] = region.center.y + (Math.random() * 2 - 1) * region.spreadY;
            positions[index + 2] = region.center.z + (Math.random() * 2 - 1) * region.spreadZ;
            alpha[i] = 0.28 + Math.random() * 0.42;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));

        const material = new THREE.PointsMaterial({
            color: 0xc9e4ff,
            size: 0.03,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
        });
        const points = new THREE.Points(geometry, material);
        sceneRef.add(points);
        ambientDust.push(points);
    }
}

function createBeamSegment(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh {
    const delta = end.clone().sub(start);
    const length = delta.length();

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, length),
        new THREE.MeshStandardMaterial({
            color: 0x6fd7ff,
            emissive: 0x2db2ff,
            emissiveIntensity: 0.05,
            transparent: true,
            opacity: 0.88,
        }),
    );

    mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));

    const direction = delta.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction,
    );
    mesh.quaternion.copy(quaternion);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.active = false;

    return mesh;
}

function createPanelTexture(
    baseHex: string,
    panelHex: string,
    lineHex: string,
    tileSize: number,
    grainAlpha: number,
): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        const fallback = new THREE.CanvasTexture(canvas);
        fallback.wrapS = THREE.RepeatWrapping;
        fallback.wrapT = THREE.RepeatWrapping;
        return fallback;
    }

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cols = Math.ceil(canvas.width / tileSize);
    const rows = Math.ceil(canvas.height / tileSize);

    for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
            const px = x * tileSize;
            const py = y * tileSize;
            ctx.fillStyle = (x + y) % 2 === 0 ? panelHex : baseHex;
            ctx.fillRect(px, py, tileSize, tileSize);
        }
    }

    ctx.strokeStyle = lineHex;
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += tileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() * 2 - 1) * 255 * grainAlpha;
        data[i] = clampByte(data[i] + noise);
        data[i + 1] = clampByte(data[i + 1] + noise);
        data[i + 2] = clampByte(data[i + 2] + noise);
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function clampByte(value: number): number {
    if (value < 0) {
        return 0;
    }
    if (value > 255) {
        return 255;
    }
    return Math.round(value);
}

function updateLaserRoutingVisuals() {
    const match1 = routingOrientations[0] === routingSolution[0];
    const match2 = routingOrientations[1] === routingSolution[1];
    const match3 = routingOrientations[2] === routingSolution[2];

    const chainStates = [true, match1, match1 && match2, match1 && match2 && match3];

    for (let i = 0; i < routingMirrorHeads.length; i += 1) {
        const head = routingMirrorHeads[i];
        const arrow = routingMirrorArrows[i];

        head.rotation.y = routingOrientations[i] * (Math.PI / 2);

        const isCorrect = routingOrientations[i] === routingSolution[i];
        const arrowMat = arrow.material as THREE.MeshStandardMaterial;
        if (isCorrect) {
            arrowMat.emissive.setHex(0x2ee48a);
            arrowMat.emissiveIntensity = 0.5;
        } else {
            arrowMat.emissive.setHex(0x8f4e17);
            arrowMat.emissiveIntensity = 0.2;
        }
    }

    for (let i = 0; i < routingBeamSegments.length; i += 1) {
        const beam = routingBeamSegments[i];
        const beamMat = beam.material as THREE.MeshStandardMaterial;
        const isActive = chainStates[i];
        beam.userData.active = isActive;
        if (isActive) {
            beamMat.color.setHex(0x7ae5ff);
            beamMat.emissive.setHex(0x39c5ff);
        } else {
            beamMat.color.setHex(0x274b60);
            beamMat.emissive.setHex(0x1b3445);
        }
    }

    if (routingReceptor) {
        const receptorMat = routingReceptor.material as THREE.MeshStandardMaterial;
        if (chainStates[3]) {
            receptorMat.emissive.setHex(0x31f194);
            receptorMat.emissiveIntensity = 0.7;
        } else {
            receptorMat.emissive.setHex(0x12426d);
            receptorMat.emissiveIntensity = 0.25;
        }
    }
}

function updateCrates(deltaTime: number, playerPosition: THREE.Vector3) {
    for (const crate of crates) {
        const offsetX = crate.mesh.position.x - playerPosition.x;
        const offsetZ = crate.mesh.position.z - playerPosition.z;
        const distance = Math.hypot(offsetX, offsetZ);

        if (distance < 1.75 && distance > 0.001) {
            const pushStrength = ((1.75 - distance) / 1.75) * 11;
            crate.velocity.x += (offsetX / distance) * pushStrength * deltaTime;
            crate.velocity.z += (offsetZ / distance) * pushStrength * deltaTime;
        }

        crate.velocity.multiplyScalar(Math.max(0, 1 - 4.2 * deltaTime));
        crate.mesh.position.x += crate.velocity.x;
        crate.mesh.position.z += crate.velocity.z;

        crate.mesh.position.x = Math.max(crate.minX, Math.min(crate.maxX, crate.mesh.position.x));
        crate.mesh.position.z = Math.max(crate.minZ, Math.min(crate.maxZ, crate.mesh.position.z));
    }
}
