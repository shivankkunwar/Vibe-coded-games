import * as THREE from 'three';
import type { CarState } from './car';

export interface TrackState {
    mesh: THREE.Group;
    checkpoints: THREE.Vector3[];
    trackWidth: number;
    startPosition: THREE.Vector3;
    startRotation: number;
    currentLap: number;
    lastLapTime: number;
    lapStartTime: number;
    raceFinished: boolean;
    totalDriftScore: number;
    currentDriftScore: number;
    minimapPoints: THREE.Vector2[];
    centerCurve: THREE.CatmullRomCurve3;
}

export interface CarPosition {
    x: number;
    z: number;
    progress: number;
    lastCheckpoint: number;
    currentLap: number;
    finished: boolean;
}

const TRACK_CONFIG = { trackWidth: 18, lapCount: 3 };

export function initTrack(scene: THREE.Scene): TrackState {
    const trackGroup = new THREE.Group();
    
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(50, 0, -40),
        new THREE.Vector3(90, 0, -80),
        new THREE.Vector3(100, 0, -130),
        new THREE.Vector3(70, 0, -180),
        new THREE.Vector3(20, 0, -200),
        new THREE.Vector3(-40, 0, -180),
        new THREE.Vector3(-100, 0, -140),
        new THREE.Vector3(-140, 0, -80),
        new THREE.Vector3(-150, 0, -20),
        new THREE.Vector3(-130, 0, 40),
        new THREE.Vector3(-80, 0, 70),
        new THREE.Vector3(-30, 0, 80),
        new THREE.Vector3(20, 0, 60),
        new THREE.Vector3(50, 0, 30),
    ], true);

    const points = curve.getSpacedPoints(200);
    
    buildTrackMesh(trackGroup, curve);
    buildStartFinish(trackGroup, points[0], points[1]);
    scene.add(trackGroup);

    const startPos = points[0].clone();
    startPos.y = 0.1;
    
    const p0 = curve.getPointAt(0);
    const p1 = curve.getPointAt(0.01);
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const startRot = Math.atan2(-dx, -dz);

    return {
        mesh: trackGroup,
        checkpoints: points,
        trackWidth: TRACK_CONFIG.trackWidth,
        startPosition: startPos,
        startRotation: startRot,
        currentLap: 1,
        lastLapTime: 0,
        lapStartTime: performance.now(),
        raceFinished: false,
        totalDriftScore: 0,
        currentDriftScore: 0,
        minimapPoints: points.map(p => new THREE.Vector2(p.x, p.z)),
        centerCurve: curve
    };
}

export function createCarPositionTracker(checkpoints: THREE.Vector3[]): CarPosition {
    return {
        x: checkpoints[0].x,
        z: checkpoints[0].z,
        progress: 0,
        lastCheckpoint: 0,
        currentLap: 1,
        finished: false,
    };
}

export function updateCarPosition(pos: CarPosition, track: TrackState) {
    if (pos.finished) return;
    
    const carPos = new THREE.Vector2(pos.x, pos.z);
    const totalCheckpoints = track.checkpoints.length;
    
    let closestCp = 0;
    let closestDist = Infinity;
    
    for (let i = 0; i < totalCheckpoints; i++) {
        const cp = track.checkpoints[i];
        const dist = carPos.distanceTo(new THREE.Vector2(cp.x, cp.z));
        if (dist < closestDist) {
            closestDist = dist;
            closestCp = i;
        }
    }
    
    if (closestDist > TRACK_CONFIG.trackWidth * 2) return;
    
    if (closestCp === 0 && pos.lastCheckpoint > totalCheckpoints * 0.7) {
        pos.currentLap++;
        pos.lastCheckpoint = 0;
        
        if (pos.currentLap > TRACK_CONFIG.lapCount) {
            pos.finished = true;
        }
    } else if (closestCp > pos.lastCheckpoint + 1) {
        pos.lastCheckpoint = closestCp;
    }
    
    pos.progress = ((pos.currentLap - 1) * totalCheckpoints) + pos.lastCheckpoint;
}

export function updateTrack(track: TrackState, car: CarState, pos: CarPosition, deltaTime: number) {
    if (track.raceFinished) return;

    handleCollision(car, track);

    pos.x = car.mesh.position.x;
    pos.z = car.mesh.position.z;
    updateCarPosition(pos, track);

    if (pos.currentLap > track.currentLap) {
        track.currentLap = pos.currentLap;
        track.lastLapTime = (performance.now() - track.lapStartTime) / 1000;
        track.lapStartTime = performance.now();
    }

    if (pos.finished && !track.raceFinished) {
        track.raceFinished = true;
    }

    if (car.isDrifting && Math.abs(car.speed) > 3) {
        track.currentDriftScore += Math.round(car.driftAngle * car.speed * 10 * deltaTime);
    }
}

function handleCollision(car: CarState, track: TrackState) {
    const pos = car.mesh.position;
    let closestT = 0, minDist = Infinity;
    
    for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const pt = track.centerCurve.getPointAt(t);
        const dist = pos.distanceToSquared(pt);
        if (dist < minDist) { minDist = dist; closestT = t; }
    }

    const closestPoint = track.centerCurve.getPointAt(closestT);
    const tangent = track.centerCurve.getTangentAt(closestT);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const lateralDist = new THREE.Vector3().subVectors(pos, closestPoint).dot(normal);
    
    const maxDist = (track.trackWidth / 2) - 0.8;

    if (Math.abs(lateralDist) > maxDist) {
        const correction = Math.sign(lateralDist) * maxDist;
        const clampedPos = closestPoint.clone().add(normal.clone().multiplyScalar(correction));
        car.mesh.position.set(clampedPos.x, pos.y, clampedPos.z);
        car.speed *= 0.75;
    }
}

export function resetTrack(track: TrackState) {
    track.currentLap = 1;
    track.lastLapTime = 0;
    track.lapStartTime = performance.now();
    track.raceFinished = false;
    track.totalDriftScore = 0;
    track.currentDriftScore = 0;
}

function buildTrackMesh(group: THREE.Group, curve: THREE.CatmullRomCurve3) {
    const halfWidth = TRACK_CONFIG.trackWidth / 2;
    const segmentCount = 400;
    
    const roadMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3a3a3a, 
        roughness: 0.9, 
        metalness: 0.05,
    });

    const grassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d5a27,
        roughness: 0.95,
    });

    const trackPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segmentCount; i++) {
        const t = i / segmentCount;
        trackPoints.push(curve.getPointAt(t));
    }

    for (let i = 0; i < segmentCount; i++) {
        const p1 = trackPoints[i];
        const p2 = trackPoints[i + 1];
        
        const tangent = new THREE.Vector3().subVectors(p2, p1).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        const roadGeo = new THREE.PlaneGeometry(TRACK_CONFIG.trackWidth, p1.distanceTo(p2) + 0.1);
        const road = new THREE.Mesh(roadGeo, roadMaterial);
        
        road.position.set((p1.x + p2.x) / 2, 0.05, (p1.z + p2.z) / 2);
        road.rotation.x = -Math.PI / 2;
        road.rotation.z = Math.atan2(tangent.x, tangent.z);
        road.receiveShadow = true;
        group.add(road);

        const leftGrassGeo = new THREE.PlaneGeometry(15, p1.distanceTo(p2) + 0.1);
        const leftGrass = new THREE.Mesh(leftGrassGeo, grassMaterial);
        const leftOffset = normal.clone().multiplyScalar(halfWidth + 7.5);
        leftGrass.position.set((p1.x + p2.x) / 2 + leftOffset.x, 0.02, (p1.z + p2.z) / 2 + leftOffset.z);
        leftGrass.rotation.x = -Math.PI / 2;
        leftGrass.rotation.z = Math.atan2(tangent.x, tangent.z);
        leftGrass.receiveShadow = true;
        group.add(leftGrass);

        const rightGrassGeo = new THREE.PlaneGeometry(15, p1.distanceTo(p2) + 0.1);
        const rightGrass = new THREE.Mesh(rightGrassGeo, grassMaterial);
        const rightOffset = normal.clone().multiplyScalar(-halfWidth - 7.5);
        rightGrass.position.set((p1.x + p2.x) / 2 + rightOffset.x, 0.02, (p1.z + p2.z) / 2 + rightOffset.z);
        rightGrass.rotation.x = -Math.PI / 2;
        rightGrass.rotation.z = Math.atan2(tangent.x, tangent.z);
        rightGrass.receiveShadow = true;
        group.add(rightGrass);

        if (i % 6 === 0) {
            const lineGeo = new THREE.PlaneGeometry(0.3, 2);
            const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            
            const leftLine = new THREE.Mesh(lineGeo, lineMat);
            leftLine.position.set(
                (p1.x + p2.x) / 2 - normal.x * (halfWidth - 0.5),
                0.06,
                (p1.z + p2.z) / 2 - normal.z * (halfWidth - 0.5)
            );
            leftLine.rotation.x = -Math.PI / 2;
            leftLine.rotation.z = Math.atan2(tangent.x, tangent.z);
            group.add(leftLine);

            const rightLine = new THREE.Mesh(lineGeo, lineMat);
            rightLine.position.set(
                (p1.x + p2.x) / 2 + normal.x * (halfWidth - 0.5),
                0.06,
                (p1.z + p2.z) / 2 + normal.z * (halfWidth - 0.5)
            );
            rightLine.rotation.x = -Math.PI / 2;
            rightLine.rotation.z = Math.atan2(tangent.x, tangent.z);
            group.add(rightLine);
        }
    }

    for (let i = 0; i < segmentCount; i++) {
        const t = i / segmentCount;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        for (let side = -1; side <= 1; side += 2) {
            if (i % 5 === 0) {
                const kerbGeo = new THREE.BoxGeometry(0.6, 0.2, 0.8);
                const isRed = Math.floor(i / 5) % 2 === 0;
                const kerbMat = new THREE.MeshStandardMaterial({
                    color: isRed ? 0xff3333 : 0xffffff,
                    roughness: 0.7,
                });
                const kerb = new THREE.Mesh(kerbGeo, kerbMat);
                
                const offset = normal.clone().multiplyScalar(halfWidth + 0.3);
                kerb.position.set(
                    point.x + offset.x * side,
                    0.1,
                    point.z + offset.z * side
                );
                kerb.rotation.y = Math.atan2(tangent.x, tangent.z);
                kerb.rotation.y += Math.PI / 2;
                group.add(kerb);
            }
        }
    }
}

function buildStartFinish(group: THREE.Group, pt1: THREE.Vector3, pt2: THREE.Vector3) {
    const halfWidth = TRACK_CONFIG.trackWidth / 2;
    const dir = new THREE.Vector3().subVectors(pt2, pt1).normalize();
    const angle = Math.atan2(dir.x, dir.z);

    const checkeredRows = 2;
    const checkeredCols = 10;
    const tileSize = 1.4;
    
    for (let row = 0; row < checkeredRows; row++) {
        for (let col = 0; col < checkeredCols; col++) {
            const isWhite = (row + col) % 2 === 0;
            const tileGeo = new THREE.PlaneGeometry(tileSize, tileSize);
            const tileMat = new THREE.MeshBasicMaterial({
                color: isWhite ? 0xffffff : 0x000000,
            });
            const tile = new THREE.Mesh(tileGeo, tileMat);
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(
                -halfWidth + (col + 0.5) * tileSize,
                0.06,
                -3 + row * tileSize
            );
            tile.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            tile.position.add(pt1);
            group.add(tile);
        }
    }

    const startLineGeo = new THREE.PlaneGeometry(TRACK_CONFIG.trackWidth, 0.3);
    const startLineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const startLine = new THREE.Mesh(startLineGeo, startLineMat);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.copy(pt1);
    startLine.position.y = 0.06;
    group.add(startLine);

    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 8, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    
    const leftPole = new THREE.Mesh(poleGeo, poleMat);
    leftPole.position.set(
        pt1.x - Math.cos(angle) * (halfWidth + 2),
        4,
        pt1.z - Math.sin(angle) * (halfWidth + 2)
    );
    group.add(leftPole);

    const rightPole = new THREE.Mesh(poleGeo, poleMat);
    rightPole.position.set(
        pt1.x + Math.cos(angle) * (halfWidth + 2),
        4,
        pt1.z + Math.sin(angle) * (halfWidth + 2)
    );
    group.add(rightPole);

    const bannerGeo = new THREE.PlaneGeometry(TRACK_CONFIG.trackWidth + 4, 2);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 4; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? 'white' : 'black';
            ctx.fillRect(i * 32, j * 16, 32, 16);
        }
    }
    const bannerTexture = new THREE.CanvasTexture(canvas);
    const bannerMat = new THREE.MeshStandardMaterial({
        map: bannerTexture,
        side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(pt1.x, 8, pt1.z);
    banner.rotation.y = angle;
    group.add(banner);
}