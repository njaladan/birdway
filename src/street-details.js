import * as THREE from '../vendor/three.module.js';

function inRing(x, z, ring) {
 let inside = false;
 for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
  const a = ring[i], b = ring[j];
  if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
 }
 return inside;
}

function insideManhattan(building, map) {
 return map.land.some(feature => feature.name === 'Manhattan'
  && inRing(building.cx, building.cz, feature.rings[0])
  && !feature.rings.slice(1).some(ring => inRing(building.cx, building.cz, ring)));
}

const random = seed => {
 const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
 return value - Math.floor(value);
};

/** Add a sparse set of classic elevated NYC rooftop tanks with batched instances. */
export function addRooftopWaterTowers(parent, map) {
 const candidates = [];
 for (const building of map.buildings) {
  const width = building.x1 - building.x0, depth = building.z1 - building.z0;
  const shortSide = Math.min(width, depth), longSide = Math.max(width, depth);
  const year = Number(building.style?.year), cls = String(building.style?.class || '');
  if (building.h < 20 || building.h > 100 || shortSide < 15 || longSide > 90 || longSide / shortSide >= 2.6
   || year < 1880 || year >= 1945 || !/^(B|C|D|R)/.test(cls) || !insideManhattan(building, map)) continue;
  // Check a broad roof patch, not a single point. This admits detailed flat
  // roofs while excluding mansard and pitched surfaces and rooftop crowns.
  const samples = [[building.cx, building.cz],
   [building.cx - width * .2, building.cz - depth * .2],
   [building.cx - width * .2, building.cz + depth * .2],
   [building.cx + width * .2, building.cz - depth * .2],
   [building.cx + width * .2, building.cz + depth * .2]];
  const roofs = samples.map(([x, z]) => map.buildingAt(x, z));
  if (!roofs.every(roof => roof?.id === building.id)) continue;
  const heights = roofs.map(roof => roof.h), low = Math.min(...heights), high = Math.max(...heights);
  if (high - low > .15 || random(building.id * 17 + 9) <= .16) continue;
  candidates.push({...building, waterTowerRoofY: heights.reduce((sum, height) => sum + height, 0) / heights.length});
 }
 if (!candidates.length) return new Set();

 const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.27, 3.6, .27), new THREE.MeshStandardMaterial({color: 0x665443, roughness: .9}), candidates.length * 4);
 const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .18, .18), new THREE.MeshStandardMaterial({color: 0x74614a, roughness: .9}), candidates.length * 8);
 const tanks = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.15, 2.15, 3.3, 16), new THREE.MeshStandardMaterial({color: 0xffffff, roughness: .94}), candidates.length);
 const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, .55, 12), new THREE.MeshStandardMaterial({color: 0x584b3c, roughness: .9}), candidates.length);
 const hoops = new THREE.InstancedMesh(new THREE.TorusGeometry(2.17, .075, 5, 16), new THREE.MeshStandardMaterial({color: 0x464846, roughness: .82}), candidates.length * 3);
 const matrix = new THREE.Object3D();
 const towerBuildings = new Set();
 let legIndex = 0, braceIndex = 0, hoopIndex = 0;

 for (let index = 0; index < candidates.length; index++) {
  const building = candidates[index], seed = building.id * 17 + 9;
  const width = 4.8 + random(seed + 1) * 1.4, depth = 4.8 + random(seed + 2) * 1.4;
  const angle = random(seed + 3) * Math.PI;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const roofY = building.waterTowerRoofY;
  const offsetX = (random(seed + 4) - .5) * Math.min(6, (building.x1 - building.x0) * .16);
  const offsetZ = (random(seed + 5) - .5) * Math.min(6, (building.z1 - building.z0) * .16);
  const x = building.cx + offsetX, z = building.cz + offsetZ;
  const localPoint = (lx, lz) => [x + lx * cosine - lz * sine, z + lx * sine + lz * cosine];

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
   const lx = sx * width / 2, lz = sz * depth / 2;
   const px = x + lx * cosine - lz * sine, pz = z + lx * sine + lz * cosine;
   matrix.position.set(px, roofY + 1.8, pz);
   matrix.rotation.set(0, angle, 0); matrix.updateMatrix(); legs.setMatrixAt(legIndex++, matrix.matrix);
  }

  for (const level of [1.15, 2.85]) {
   for (const side of [-1, 1]) {
    const [edgeX, edgeZ] = localPoint(0, side * (depth + .25) / 2);
    matrix.position.set(edgeX, roofY + level, edgeZ);
    matrix.rotation.set(0, angle, 0); matrix.scale.set(width + .25, 1, 1);
    matrix.updateMatrix(); braces.setMatrixAt(braceIndex++, matrix.matrix);
    const [sideX, sideZ] = localPoint(side * (width + .25) / 2, 0);
    matrix.position.set(sideX, roofY + level, sideZ);
    matrix.rotation.set(0, angle + Math.PI / 2, 0); matrix.scale.set(depth + .25, 1, 1);
    matrix.updateMatrix(); braces.setMatrixAt(braceIndex++, matrix.matrix);
   }
  }

  matrix.position.set(x, roofY + 5.05, z); matrix.rotation.set(0, angle, 0); matrix.scale.set(1, 1, 1); matrix.updateMatrix();
  tanks.setMatrixAt(index, matrix.matrix);
  const wood = new THREE.Color(0x805f40).lerp(new THREE.Color(0x9a7954), random(seed + 6) * .45);
  tanks.setColorAt(index, wood);
  matrix.position.set(x, roofY + 6.98, z); matrix.updateMatrix(); caps.setMatrixAt(index, matrix.matrix);
  for (const height of [3.65, 4.25, 6.0]) {
   matrix.position.set(x, roofY + height, z); matrix.rotation.set(Math.PI / 2, 0, 0); matrix.scale.set(1, 1, 1);
   matrix.updateMatrix(); hoops.setMatrixAt(hoopIndex++, matrix.matrix);
  }
  towerBuildings.add(building.id);
 }

 for (const instance of [legs, braces, tanks, caps, hoops]) { instance.castShadow = true; instance.receiveShadow = true; parent.add(instance); }
 return towerBuildings;
}
