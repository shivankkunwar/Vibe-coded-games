import * as THREE from 'three';

const treePositions: { x: number; z: number; radius: number }[] = [];

export function getTreePositions() {
    return treePositions;
}

export async function initWorld(manager: THREE.LoadingManager, scene: THREE.Scene) {
    manager.itemStart('world-assets');

    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.003);

    const sunLight = new THREE.DirectionalLight(0xfff8dc, 2);
    sunLight.position.set(100, 150, 80);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0005;
    Object.assign(sunLight.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, far: 800 });
    scene.add(sunLight);

    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x228B22, 0.8));
    
    const ambientLight = new THREE.AmbientLight(0xfff8dc, 0.4);
    scene.add(ambientLight);

    createGround(scene);
    createSimpleTrees(scene, 60);
    createStartBanner(scene);

    manager.itemEnd('world-assets');
}

function createGround(scene: THREE.Scene) {
    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const groundMat = new THREE.MeshStandardMaterial({
        color: 0x4a7c3f,
        roughness: 0.95,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);
}

function createSimpleTrees(scene: THREE.Scene, distanceFromCenter: number) {
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    
    const foliageGeo = new THREE.ConeGeometry(2, 4, 8);
    const foliageMat = new THREE.MeshStandardMaterial({
        color: 0x228B22,
        roughness: 0.8,
    });

    for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = distanceFromCenter + Math.random() * 150;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        if (Math.abs(x) < 50 && Math.abs(z + 100) < 50) continue;
        
        const scale = 0.6 + Math.random() * 0.8;
        
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, 1, z);
        trunk.scale.setScalar(scale);
        trunk.castShadow = true;
        trunk.userData.isTree = true;
        trunk.userData.treeRadius = 0.5 * scale;
        scene.add(trunk);

        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.set(x, 4 * scale, z);
        foliage.scale.setScalar(scale);
        foliage.castShadow = true;
        foliage.userData.isTreeFoliage = true;
        scene.add(foliage);

        treePositions.push({ x, z, radius: 0.5 * scale });
    }
}

function createStartBanner(scene: THREE.Scene) {
    const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 8, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-12, 4, 5);
    scene.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(12, 4, 5);
    scene.add(rightPost);

    const bannerGeo = new THREE.PlaneGeometry(26, 3);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START / FINISH', 256, 32);
    
    const bannerTexture = new THREE.CanvasTexture(canvas);
    const bannerMat = new THREE.MeshStandardMaterial({
        map: bannerTexture,
        side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 8, 5);
    scene.add(banner);
}