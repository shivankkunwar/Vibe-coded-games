import * as THREE from 'three';
import type { TrackState, CarPosition } from './track';
import { createCarPositionTracker, updateCarPosition } from './track';

export interface RobotCar {
    group: THREE.Group;
    color: number;
    speed: number;
    maxSpeed: number;
    targetCheckpoint: number;
    trackProgress: number;
    carPosition: CarPosition;
}

export function createRobotCar(
    scene: THREE.Scene,
    track: TrackState,
    color: number,
    offsetZ: number,
    maxSpeed: number
): RobotCar {
    const carGroup = createCarModel(color);
    const startPos = track.startPosition.clone();
    startPos.x += offsetZ;
    carGroup.position.copy(startPos);
    carGroup.rotation.y = track.startRotation;
    scene.add(carGroup);

    const carPos = createCarPositionTracker(track.checkpoints);

    return {
        group: carGroup,
        color,
        speed: 0,
        maxSpeed,
        targetCheckpoint: 1,
        trackProgress: 0,
        carPosition: carPos,
    };
}

export function updateRobotCar(
    robot: RobotCar,
    track: TrackState,
    deltaTime: number,
    otherCars: { x: number; z: number }[]
) {
    if (robot.carPosition.finished) return;

    const targetPoint = track.checkpoints[robot.targetCheckpoint];
    const dx = targetPoint.x - robot.group.position.x;
    const dz = targetPoint.z - robot.group.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 8) {
        robot.targetCheckpoint = (robot.targetCheckpoint + 1) % track.checkpoints.length;
    }

    let targetSpeed = robot.maxSpeed;

    for (const other of otherCars) {
        const avoidDx = other.x - robot.group.position.x;
        const avoidDz = other.z - robot.group.position.z;
        const avoidDist = Math.sqrt(avoidDx * avoidDx + avoidDz * avoidDz);

        if (avoidDist < 6 && avoidDist > 0) {
            targetSpeed = Math.max(targetSpeed * 0.3, 5);
            const pushStrength = (6 - avoidDist) / 6;
            robot.group.position.x -= (avoidDx / avoidDist) * pushStrength * deltaTime * 4;
            robot.group.position.z -= (avoidDz / avoidDist) * pushStrength * deltaTime * 4;
        }
    }

    robot.speed = THREE.MathUtils.lerp(robot.speed, targetSpeed, deltaTime * 5);

    const forwardX = dx / distance;
    const forwardZ = dz / distance;

    robot.group.position.x += forwardX * robot.speed * deltaTime;
    robot.group.position.z += forwardZ * robot.speed * deltaTime;

    const targetRotation = Math.atan2(-dx, -dz);
    let currentRotation = robot.group.rotation.y;
    let diff = targetRotation - currentRotation;
    
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    
    robot.group.rotation.y += diff * Math.min(1, deltaTime * 5);

    robot.carPosition.x = robot.group.position.x;
    robot.carPosition.z = robot.group.position.z;
    updateCarPosition(robot.carPosition, track);
}

export function resetRobotCar(robot: RobotCar, track: TrackState, offsetZ: number) {
    const startPos = track.startPosition.clone();
    startPos.x += offsetZ;
    robot.group.position.copy(startPos);
    robot.group.rotation.y = track.startRotation;
    robot.speed = 0;
    robot.targetCheckpoint = 1;
    robot.trackProgress = 0;
    robot.carPosition = createCarPositionTracker(track.checkpoints);
}

function createCarModel(color: number): THREE.Group {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(1.8, 0.6, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.7,
        roughness: 0.3,
        emissive: color,
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
        group.add(wheel);
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