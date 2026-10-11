import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// Mapped street trees are represented as branching, instanced trees rather
// than repeated crown primitives. Templates keep the sampled point budget affordable.
const CHUNK = 420;
const MAX_TREES = 12000;
const MAX_CENSUS_TREES = 10000;
const MAX_PARK_TREES = 2000;
const FULL_RANGE = 200;
const FAR_RANGE = 900;
const SPECIES = [
  { name: 'plane', crown: 1.22, taper: .83, leaf: 0x527d43, shape: 'palmate' },
  { name: 'oak', crown: 1.12, taper: .86, leaf: 0x587d3f, shape: 'lobed' },
  { name: 'honeylocust', crown: 1.25, taper: .72, leaf: 0x668647, shape: 'small' },
  { name: 'linden', crown: 1.08, taper: .9, leaf: 0x648448, shape: 'heart' },
  { name: 'maple', crown: 1.13, taper: .85, leaf: 0x52783e, shape: 'palmate' },
  { name: 'conifer', crown: .82, taper: .76, leaf: 0x526f4b, shape: 'small' },
  { name: 'ginkgo', crown: 1.05, taper: .82, leaf: 0x6d9049, shape: 'fan' },
  { name: 'pear', crown: 1.02, taper: .78, leaf: 0x638348, shape: 'heart' },
];

const fract = n => n - Math.floor(n);
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeGeometry(positions, colors, winds = null, uvs = null, roots = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (winds) g.setAttribute('wind', new THREE.Float32BufferAttribute(winds, 1));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (roots) g.setAttribute('treeRoot', new THREE.Float32BufferAttribute(roots, 3));
  g.computeVertexNormals();
  return g;
}

function pushTriangle(out, a, b, c, ca, cb = ca, cc = ca, wind = 0, uvs = null) {
  const vertices = [[a, ca], [b, cb], [c, cc]];
  for (let i = 0; i < vertices.length; i++) {
    const [p, color] = vertices[i];
    out.positions.push(p.x, p.y, p.z);
    out.colors.push(color.r, color.g, color.b);
    if (out.winds) out.winds.push(wind);
    if (out.uvs) out.uvs.push(...(uvs?.[i] || [0, 0]));
  }
}

function addBranch(out, start, end, radius0, radius1, color) {
  const axis = end.clone().sub(start);
  const length = axis.length();
  if (length < .035) return;
  axis.normalize();
  const tangent = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > .93 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const bitangent = new THREE.Vector3().crossVectors(axis, tangent).normalize();
  const sides = radius0 > .085 ? 6 : 5;
  const ringA = [], ringB = [];
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2;
    const radial = tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(bitangent, Math.sin(angle));
    ringA.push(start.clone().addScaledVector(radial, radius0));
    ringB.push(end.clone().addScaledVector(radial, radius1));
  }
  const shade = (i, ring) => color.clone().multiplyScalar(0.82 + ((i * 7 + ring * 3) % 5) * .055);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const u0 = i / sides, u1 = (i + 1) / sides, v1 = length * .85;
    pushTriangle(out, ringA[i], ringB[i], ringA[j], shade(i, 0), shade(i, 0), shade(i, 0), 0, [[u0, 0], [u0, v1], [u1, 0]]);
    pushTriangle(out, ringA[j], ringB[i], ringB[j], shade(j, 1), shade(j, 1), shade(j, 1), 0, [[u1, 0], [u0, v1], [u1, v1]]);
  }
  pushTriangle(out, start, ringA[1], ringA[0], color, color, color, 0, [[.5, 0], [1, 0], [0, 0]]);
}

function addLeafCard(out, center, direction, width, height, color, rotation) {
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(direction, .24).normalize();
  const right = new THREE.Vector3(Math.cos(rotation), 0, Math.sin(rotation));
  right.addScaledVector(up, -right.dot(up)).normalize();
  const a = center.clone().addScaledVector(right, -width * .5).addScaledVector(up, -height * .5);
  const b = center.clone().addScaledVector(right, width * .5).addScaledVector(up, -height * .5);
  const c = center.clone().addScaledVector(right, width * .5).addScaledVector(up, height * .5);
  const d = center.clone().addScaledVector(right, -width * .5).addScaledVector(up, height * .5);
  const tint = new THREE.Color(0xffffff).lerp(color, .16).multiplyScalar(.92 + .12 * fract(Math.sin(center.x * 7.1 + center.z * 3.7) * 419.2));
  const wind = .65 + Math.max(0, direction.y) * .35;
  pushTriangle(out, a, b, c, tint, tint, tint, wind, [[0, 0], [1, 0], [1, 1]]);
  pushTriangle(out, a, c, d, tint, tint, tint, wind, [[0, 0], [1, 1], [0, 1]]);
}

function leafOutline(shape, size) {
  if (shape === 'lobed') return [
    [-.08, -.5], [-.14, -.22], [-.38, -.16], [-.2, .03], [-.26, .28], [0, .5],
    [.26, .28], [.2, .03], [.38, -.16], [.14, -.22], [.08, -.5],
  ].map(([x, y]) => [x * size * 1.6, y * size * 1.8]);
  if (shape === 'palmate') return [
    [0, -.53], [-.28, -.34], [-.48, -.08], [-.25, .12], [-.23, .31], [0, .14],
    [.23, .31], [.25, .12], [.48, -.08], [.28, -.34],
  ].map(([x, y]) => [x * size * 1.5, y * size * 1.7]);
  if (shape === 'heart') return [
    [0, -.48], [-.24, -.29], [-.48, -.17], [-.44, .03], [-.24, .28], [0, .5], [.24, .28], [.44, .03], [.48, -.17], [.24, -.29],
  ].map(([x, y]) => [x * size * 1.5, y * size * 1.7]);
  if (shape === 'fan') return [
    [0, -.53], [-.1, -.25], [-.24, -.08], [-.42, .06], [-.48, .28], [-.33, .31], [-.23, .17], [-.15, .34], [0, .48], [.15, .34], [.23, .17], [.33, .31], [.48, .28], [.42, .06], [.24, -.08], [.1, -.25],
  ].map(([x, y]) => [x * size * 1.45, y * size * 1.7]);
  return Array.from({ length: 10 }, (_, i) => {
    const angle = i / 9 * Math.PI - Math.PI / 2;
    const radius = Math.sin(i / 9 * Math.PI) ** .72;
    return [Math.cos(angle) * radius * size * .42, -Math.sin(angle) * size * .78];
  });
}

function addLeaf(out, center, direction, size, shape, color, rng) {
  const axis = direction.clone().normalize();
  const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > .86 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const normal = new THREE.Vector3().crossVectors(side, axis).normalize();
  side.applyAxisAngle(axis, (rng() - .5) * 1.0);
  const outline = leafOutline(shape, size);
  const tip = center.clone().addScaledVector(axis, size * .72);
  const points = outline.map(([x, y]) => center.clone().addScaledVector(side, x).addScaledVector(axis, y));
  const colorVariation = .82 + rng() * .36;
  const leafColor = color.clone().multiplyScalar(colorVariation);
  const centerColor = leafColor.clone().multiplyScalar(1.08);
  // A shallow central ridge catches light while preserving an individual-leaf silhouette.
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    pushTriangle(out, tip, points[i], points[next], centerColor, leafColor, leafColor, .75);
    pushTriangle(out, tip.clone().addScaledVector(normal, -.004), points[next].clone().addScaledVector(normal, -.004), points[i].clone().addScaledVector(normal, -.004), centerColor, leafColor, leafColor, .75);
  }
}

let treeTextures = { leaves: [], barkColor: null, barkNormal: null, barkRoughness: null };
let pineModel = null;
async function loadTreeTextures() {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return treeTextures;
  const loader = new THREE.TextureLoader();
  const load = async (url, srgb = false) => {
    try {
      const texture = await loader.loadAsync(url);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      return texture;
    } catch {
      return null;
    }
  };
  const [oak, ash, aspen, pine, barkColor, barkNormal, barkRoughness] = await Promise.all([
    load('./assets/trees/leaves/oak_color.png', true),
    load('./assets/trees/leaves/ash_color.png', true),
    load('./assets/trees/leaves/aspen_color.png', true),
    load('./assets/trees/leaves/pine_color.png', true),
    load('./assets/trees/bark/oak_color_1k.jpg', true),
    load('./assets/trees/bark/oak_normal_1k.jpg'),
    load('./assets/trees/bark/oak_roughness_1k.jpg'),
  ]);
  treeTextures = { leaves: [aspen, oak, ash, oak, aspen, pine, aspen, aspen], barkColor, barkNormal, barkRoughness };
  return treeTextures;
}

function buildTreeTemplate(species, variant, detail) {
  const rng = random((variant + 1) * 1009 + (species + 1) * 7919 + (detail ? 3 : 17));
  const form = SPECIES[species];
  const bark = { positions: [], colors: [], winds: [], uvs: [] };
  const leaves = { positions: [], colors: [], winds: [], uvs: [] };
  const barkTint = new THREE.Color(0x625849).lerp(new THREE.Color(0x8c8068), rng() * .45);
  const barkColor = new THREE.Color(0xffffff).lerp(barkTint, .14);
  const leafColor = new THREE.Color(form.leaf);
  const height = 11.2;
  const canopyBase = detail ? 4.2 : 4.6;
  const apex = new THREE.Vector3((rng() - .5) * 1.05, height, (rng() - .5) * 1.05);
  addBranch(bark, new THREE.Vector3(0, 0, 0), apex, .34, .035, barkColor);

  const primaryCount = detail ? 9 : 7;
  const terminalTips = [];
  for (let i = 0; i < primaryCount; i++) {
    const angle = i / primaryCount * Math.PI * 2 + rng() * .6;
    const startY = canopyBase + rng() * 2.5;
    const reach = (detail ? 4.0 : 3.8) * form.crown * (.72 + rng() * .48);
    const rise = 1.05 + rng() * 2.05;
    const lean = (rng() - .5) * .45;
    const start = new THREE.Vector3((rng() - .5) * .12, startY, (rng() - .5) * .12);
    const elbow = new THREE.Vector3(Math.sin(angle) * reach * .54 + lean, startY + rise * .38, Math.cos(angle) * reach * .54 - lean);
    const tip = new THREE.Vector3(Math.sin(angle) * reach + lean * 1.5, startY + rise, Math.cos(angle) * reach - lean * 1.5);
    addBranch(bark, start, elbow, .17 * form.taper, .09 * form.taper, barkColor);
    addBranch(bark, elbow, tip, .09 * form.taper, .022, barkColor);
    const subCount = detail ? 5 : 3;
    for (let j = 0; j < subCount; j++) {
      const t = .3 + j / subCount * .6;
      const branchStart = elbow.clone().lerp(tip, t);
      const branchAngle = angle + (j % 2 ? 1 : -1) * (.35 + rng() * .8) + (rng() - .5) * .3;
      const subLength = (detail ? 1.55 : 1.2) * (.65 + rng() * .58);
      const branchTip = branchStart.clone().add(new THREE.Vector3(Math.sin(branchAngle) * subLength, .35 + rng() * .9, Math.cos(branchAngle) * subLength));
      addBranch(bark, branchStart, branchTip, .037, .012, barkColor);
      terminalTips.push({ point: branchTip, direction: branchTip.clone().sub(branchStart).normalize() });
      if (detail) {
        for (let k = 0; k < 1; k++) {
          const twigStart = branchStart.clone().lerp(branchTip, .52 + rng() * .35);
          const twigAngle = branchAngle + (k ? 1 : -1) * (.55 + rng() * .5);
          const twigEnd = twigStart.clone().add(new THREE.Vector3(Math.sin(twigAngle) * .65, .32 + rng() * .38, Math.cos(twigAngle) * .65));
          addBranch(bark, twigStart, twigEnd, .018, .006, barkColor);
          terminalTips.push({ point: twigEnd, direction: twigEnd.clone().sub(twigStart).normalize() });
        }
      }
    }
    terminalTips.push({ point: tip, direction: tip.clone().sub(elbow).normalize() });
  }
  if (detail) {
    for (const { point, direction } of terminalTips) {
      const sprays = treeTextures.leaves[species] ? (form.shape === 'small' ? 5 : 4) : (form.shape === 'small' ? 3 : 2);
      for (let i = 0; i < sprays; i++) {
        const sideAngle = rng() * Math.PI * 2;
        const offset = new THREE.Vector3(Math.cos(sideAngle) * (.12 + rng() * .45), (rng() - .2) * .58, Math.sin(sideAngle) * (.12 + rng() * .45));
        const pos = point.clone().add(offset);
        const leafDirection = direction.clone().multiplyScalar(.3 + rng() * .4).add(offset.clone().normalize().multiplyScalar(.65)).add(new THREE.Vector3(0, .2, 0));
        if (treeTextures.leaves[species]) {
          const leafScale = form.shape === 'small' ? 1.3 : 1;
          const cardScale = .78 + rng() * .3;
          addLeafCard(leaves, pos, leafDirection, (2.0 + rng() * .42) * leafScale * cardScale, (2.2 + rng() * .5) * leafScale * cardScale, leafColor, sideAngle + (rng() - .5) * .7);
        } else {
          addLeaf(leaves, pos, leafDirection, form.shape === 'small' ? .17 : .24, form.shape, leafColor, rng);
        }
      }
    }
  } else {
    // Far LOD keeps a readable twiggy silhouette with sparse photographic cards.
    for (const { point, direction } of terminalTips) {
      const sprays = treeTextures.leaves[species] ? 2 : 2;
      for (let i = 0; i < sprays; i++) {
        const sideAngle = rng() * Math.PI * 2;
        const offset = new THREE.Vector3(Math.cos(sideAngle) * .17, (rng() - .25) * .25, Math.sin(sideAngle) * .17);
        const pos = point.clone().add(offset), leafDirection = direction.clone().add(offset).add(new THREE.Vector3(0, .25, 0));
        if (treeTextures.leaves[species]) addLeafCard(leaves, pos, leafDirection, 2.2, 2.6, leafColor, sideAngle);
        else addLeaf(leaves, pos, leafDirection, .24, form.shape, leafColor, rng);
      }
    }
  }
  return {
    bark: makeGeometry(bark.positions, bark.colors, bark.winds, bark.uvs),
    leaves: makeGeometry(leaves.positions, leaves.colors, leaves.winds, treeTextures.leaves[species] ? leaves.uvs : null),
  };
}

let templates = null;
export async function loadTrees() {
  if (!templates) {
    await loadTreeTextures();
    await loadPineModel();
    templates = SPECIES.map((_, species) => ({
      full: [buildTreeTemplate(species, 0, true)],
    }));
  }
  return templates;
}

async function loadPineModel() {
  if (pineModel || typeof document === 'undefined') return pineModel;
  try {
    const gltf = await new GLTFLoader().loadAsync('./assets/trees/polyhaven/pine_tree_01.gltf');
    gltf.scene.updateMatrixWorld(true);
    let mesh = null;
    gltf.scene.traverse(object => { if (!mesh && object.isMesh) mesh = object; });
    if (!mesh) return null;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const position = geometry.getAttribute('position');
    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const height = Math.max(.1, geometry.boundingBox.max.y - minY);
    const wind = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) wind[i] = THREE.MathUtils.clamp((position.getY(i) - minY) / height, 0, 1);
    geometry.setAttribute('wind', new THREE.Float32BufferAttribute(wind, 1));
    geometry.translate(0, -minY, 0);
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
      const lit = material.clone();
      lit.onBeforeCompile = shader => {
        shader.uniforms.treeTime = { value: 0 };
        shader.vertexShader = `attribute float wind; uniform float treeTime;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += wind * sin(treeTime * 1.15 + position.y * 0.42 + position.x * 0.71) * 0.085;\ntransformed.z += wind * cos(treeTime * 0.83 + position.y * 0.31 + position.z * 0.63) * 0.045;`);
        lit.userData.treeShader = shader;
      };
      return lit;
    });
    pineModel = { geometry, material: Array.isArray(mesh.material) ? materials : materials[0], height };
  } catch (error) {
    console.warn('Poly Haven pine model unavailable; using the generated pine form.', error);
  }
  return pineModel;
}

function setWind(material, time, position = null) {
  const shader = material.userData.treeShader;
  if (shader) {
    shader.uniforms.treeTime.value = time;
    if (position && shader.uniforms.treeViewer) shader.uniforms.treeViewer.value.set(position.x, 0, position.z);
  }
}

function windMaterial(color = null, distanceLod = false) {
  const material = new THREE.MeshStandardMaterial({
    color: color || 0xffffff,
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.treeTime = { value: 0 };
    if (distanceLod) {
      shader.uniforms.treeViewer = { value: new THREE.Vector3() };
      shader.uniforms.treeRange = { value: new THREE.Vector2(FULL_RANGE, FAR_RANGE) };
      shader.vertexShader = `attribute vec3 treeRoot; varying vec3 vTreeRoot; uniform vec3 treeViewer;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvTreeRoot = treeRoot;`);
      shader.fragmentShader = `varying vec3 vTreeRoot; uniform vec3 treeViewer; uniform vec2 treeRange;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\nfloat treeDistance = distance(vTreeRoot.xz, treeViewer.xz);\nif (treeDistance < treeRange.x || treeDistance > treeRange.y) discard;`);
    }
    shader.vertexShader = `attribute float wind; uniform float treeTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.x += wind * sin(treeTime * 1.15 + position.y * 0.42 + position.x * 0.71) * 0.085;\ntransformed.z += wind * cos(treeTime * 0.83 + position.y * 0.31 + position.z * 0.63) * 0.045;`);
    material.userData.treeShader = shader;
  };
  material.customProgramCacheKey = () => distanceLod ? 'tree-distance-lod' : 'tree-near-lod';
  return material;
}

function chunkKey(x, z) { return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; }

function speciesForType(type, seed) {
  const name = String(type || '').toLowerCase();
  if (/pine|spruce|fir|cedar|arborvitae|hemlock|yew|redwood|cypress/.test(name)) return 5;
  if (/ginkgo/.test(name)) return 6;
  if (/callery pear|pear|crab apple|cherry|raintree|chokecherry|dogwood|magnolia/.test(name)) return 7;
  if (/honey.?locust|locust|sophora|coffeetree|maackia/.test(name)) return 2;
  if (/linden|basswood/.test(name)) return 3;
  if (/maple|boxelder|sweetgum|tulip/.test(name)) return 4;
  if (/oak|beech|chestnut/.test(name)) return 1;
  if (/plane|sycamore|plat(an|e)|london|zelkova|elm|ash|hornbeam|hackberry/.test(name)) return 0;
  if (name === 'needleleaved') return 5;
  return seed % 5;
}

function buildFarBatch(items) {
  const bark = { positions: [], colors: [], winds: [], uvs: [], roots: [] };
  const leaves = { positions: [], colors: [], winds: [], uvs: [], roots: [] };
  const recordRoots = (out, vertexStart, x, z) => {
    for (let i = vertexStart; i < out.positions.length / 3; i++) out.roots.push(x, 0, z);
  };
  for (const tree of items) {
    const { x, z, seed, species } = tree;
    const form = SPECIES[species];
    const height = 9.1 + fract(Math.sin(seed * 2.123) * 7143.31) * 5.7;
    const width = height * (.87 + fract(Math.sin(seed * 4.731) * 3521.7) * .26);
    const trunkTint = new THREE.Color(0x625849).lerp(new THREE.Color(0x8c8068), fract(Math.sin(seed * 3.27) * 1911.3) * .45);
    const trunk = new THREE.Color(0xffffff).lerp(trunkTint, .14);
    const leafColor = new THREE.Color(0xffffff).lerp(new THREE.Color(form.leaf), .16);
    let start = bark.positions.length / 3;
    addBranch(bark, new THREE.Vector3(x, 0, z), new THREE.Vector3(x + Math.sin(seed * .0017) * .4, height * .78, z + Math.cos(seed * .0017) * .4), height * .024, height * .004, trunk);
    recordRoots(bark, start, x, z);
    const center = new THREE.Vector3(x, height * .68, z);
    // Two crossing photographic shoot cards retain the natural silhouette at distance.
    start = leaves.positions.length / 3;
    addLeafCard(leaves, center, new THREE.Vector3(1, .12, 0), width * .58, height * .58, leafColor, seed * .0017);
    addLeafCard(leaves, center, new THREE.Vector3(0, .12, 1), width * .58, height * .58, leafColor, seed * .0017 + Math.PI * .5);
    recordRoots(leaves, start, x, z);
  }
  return {
    bark: makeGeometry(bark.positions, bark.colors, bark.winds, bark.uvs, bark.roots),
    leaves: makeGeometry(leaves.positions, leaves.colors, leaves.winds, leaves.uvs, leaves.roots),
  };
}

export function buildTrees(scene, data) {
  if (!templates) {
    // Build synchronously for callers that don't run loadTrees first.
    templates = SPECIES.map((_, species) => ({
      full: [buildTreeTemplate(species, 0, true)],
    }));
  }
  const census = Array.isArray(data?.streetTrees) ? data.streetTrees : (data?.streetTrees?.trees || []);
  const parks = data?.trees || [];
  const censusCount = Math.min(census.length, MAX_CENSUS_TREES);
  const parkBudget = census.length ? MAX_PARK_TREES : MAX_TREES;
  const parkCount = Math.min(parks.length, parkBudget);
  const chunks = new Map();
  const dummy = new THREE.Object3D();
  let accepted = 0;
  const addTree = (record, i, source) => {
    if (accepted >= MAX_TREES) return;
    const [x, z, type, dbh] = record;
    const key = chunkKey(x, z);
    if (!chunks.has(key)) chunks.set(key, []);
    const seed = Math.abs(Math.floor(x * 13 + z * 7 + i * 19 + (source === 'census' ? 0 : 7919)));
    const species = source === 'park' && (type == null || type === '') ? seed % 5 : speciesForType(type, seed);
    const variant = 0;
    chunks.get(key).push({ x, z, species, variant, seed, dbh });
    accepted++;
  };
  for (let i = 0; i < censusCount && accepted < MAX_TREES; i++) addTree(census[Math.floor(i * census.length / censusCount)], i, 'census');
  for (let i = 0; i < parkCount && accepted < MAX_TREES; i++) addTree(parks[Math.floor(i * parks.length / parkCount)], i, 'park');

  const barkMaterial = windMaterial(0xffffff);
  barkMaterial.map = treeTextures.barkColor;
  barkMaterial.normalMap = treeTextures.barkNormal;
  barkMaterial.roughnessMap = treeTextures.barkRoughness;
  const leafMaterials = SPECIES.map((_, species) => {
    const material = windMaterial(0xffffff);
    material.map = treeTextures.leaves[species];
    if (treeTextures.leaves[species]) material.alphaTest = .36;
    return material;
  });
  const farBarkMaterial = windMaterial(0xffffff, true);
  farBarkMaterial.map = treeTextures.barkColor;
  farBarkMaterial.normalMap = treeTextures.barkNormal;
  farBarkMaterial.roughnessMap = treeTextures.barkRoughness;
  const farLeafMaterial = windMaterial(0xffffff, true);
  farLeafMaterial.map = treeTextures.leaves[1];
  farLeafMaterial.alphaTest = .36;
  const root = new THREE.Group();
  root.name = 'City inventory and park trees';
  scene.add(root);
  const records = [];

  for (const [key, items] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const centerX = cx * CHUNK + CHUNK / 2;
    const centerZ = cz * CHUNK + CHUNK / 2;
    const groups = new Map();
    for (const item of items) {
      const groupKey = `${item.species}:${item.variant}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(item);
    }
    const lods = [];
    for (const [groupKey, group] of groups) {
      const [species, variant] = groupKey.split(':').map(Number);
      if (species === 5 && pineModel) {
        const actual = new THREE.InstancedMesh(pineModel.geometry, pineModel.material, group.length);
        actual.count = 0;
        actual.castShadow = true;
        for (let i = 0; i < group.length; i++) {
          const tree = group[i];
          const height = 9.1 + fract(Math.sin(tree.seed * 2.123) * 7143.31) * 5.7;
          const scale = height / pineModel.height;
          const girth = .9 + fract(Math.sin(tree.seed * 4.731) * 3521.7) * .2;
          dummy.position.set(tree.x, 0, tree.z);
          dummy.rotation.set(0, tree.seed * .0017, 0);
          dummy.scale.set(scale * girth, scale, scale * girth);
          dummy.updateMatrix();
          actual.setMatrixAt(i, dummy.matrix);
        }
        actual.instanceMatrix.needsUpdate = true;
        const actualRoot = new THREE.Group();
        actualRoot.name = 'Poly Haven pine model';
        actualRoot.add(actual);
        root.add(actualRoot);
        lods.push({ lod: 'actual', groupRoot: actualRoot, isPine: true, group, actual });
      }
      for (const lod of ['full']) {
        const model = templates[species][lod][variant];
        const bark = new THREE.InstancedMesh(model.bark, barkMaterial, group.length);
        const leaves = new THREE.InstancedMesh(model.leaves, leafMaterials[species], group.length);
        bark.count = 0;
        leaves.count = 0;
        bark.castShadow = true;
        leaves.castShadow = true;
        for (let i = 0; i < group.length; i++) {
          const tree = group[i];
          const height = 9.1 + fract(Math.sin(tree.seed * 2.123) * 7143.31) * 5.7;
          const width = height * (.87 + fract(Math.sin(tree.seed * 4.731) * 3521.7) * .26) / 11.2;
          const scale = lod === 'far' ? width : width;
          dummy.position.set(tree.x, 0, tree.z);
          dummy.rotation.set(0, tree.seed * .0017, 0);
          dummy.scale.set(scale, height / 11.2, scale);
          dummy.updateMatrix();
          bark.setMatrixAt(i, dummy.matrix);
          leaves.setMatrixAt(i, dummy.matrix);
        }
        bark.instanceMatrix.needsUpdate = true;
        leaves.instanceMatrix.needsUpdate = true;
        const groupRoot = new THREE.Group();
        groupRoot.add(bark, leaves);
        root.add(groupRoot);
        lods.push({ lod, groupRoot, isPine: species === 5, group, bark, leaves });
      }
    }
    const farModel = buildFarBatch(items);
    const farBark = new THREE.Mesh(farModel.bark, farBarkMaterial);
    const farLeaves = new THREE.Mesh(farModel.leaves, farLeafMaterial);
    farBark.castShadow = false;
    farLeaves.castShadow = false;
    const farRoot = new THREE.Group();
    farRoot.name = 'Merged distant tree canopy';
    farRoot.add(farBark, farLeaves);
    root.add(farRoot);
    lods.push({ lod: 'far', groupRoot: farRoot });
    records.push({ centerX, centerZ, lods });
  }

  return {
    root,
    lastLodPosition: new THREE.Vector2(Infinity, Infinity),
    update(position, time = 0) {
      const movedForLod = Math.hypot(position.x - this.lastLodPosition.x, position.z - this.lastLodPosition.y) >= 10;
      if (movedForLod) this.lastLodPosition.set(position.x, position.z);
      const lodViewer = { x: this.lastLodPosition.x, z: this.lastLodPosition.y };
      setWind(barkMaterial, time);
      for (const material of leafMaterials) setWind(material, time);
      setWind(farBarkMaterial, time, lodViewer);
      setWind(farLeafMaterial, time, lodViewer);
      if (pineModel) for (const material of (Array.isArray(pineModel.material) ? pineModel.material : [pineModel.material])) setWind(material, time);
      for (const chunk of records) {
        const distance = Math.hypot(position.x - chunk.centerX, position.z - chunk.centerZ);
        const visible = distance < FAR_RANGE + CHUNK;
        for (const entry of chunk.lods) {
          const { lod, groupRoot } = entry;
          if (lod === 'far') {
            groupRoot.visible = visible;
            continue;
          }
          if (!movedForLod) continue;
          let count = 0;
          for (const tree of entry.group) {
            const treeDistance = Math.hypot(lodViewer.x - tree.x, lodViewer.z - tree.z);
            const inRange = lod === 'actual' ? treeDistance < 150 : treeDistance < FULL_RANGE && !(pineModel && entry.isPine && treeDistance < 150);
            if (!inRange) continue;
            const height = 9.1 + fract(Math.sin(tree.seed * 2.123) * 7143.31) * 5.7;
            if (lod === 'actual') {
              const scale = height / pineModel.height;
              const girth = .9 + fract(Math.sin(tree.seed * 4.731) * 3521.7) * .2;
              dummy.scale.set(scale * girth, scale, scale * girth);
            } else {
              const width = height * (.87 + fract(Math.sin(tree.seed * 4.731) * 3521.7) * .26) / 11.2;
              dummy.scale.set(width, height / 11.2, width);
            }
            dummy.position.set(tree.x, 0, tree.z);
            dummy.rotation.set(0, tree.seed * .0017, 0);
            dummy.updateMatrix();
            if (lod === 'actual') entry.actual.setMatrixAt(count, dummy.matrix);
            else {
              entry.bark.setMatrixAt(count, dummy.matrix);
              entry.leaves.setMatrixAt(count, dummy.matrix);
            }
            count++;
          }
          if (lod === 'actual') {
            entry.actual.count = count;
            entry.actual.instanceMatrix.needsUpdate = true;
          } else {
            entry.bark.count = count;
            entry.leaves.count = count;
            entry.bark.instanceMatrix.needsUpdate = true;
            entry.leaves.instanceMatrix.needsUpdate = true;
          }
          groupRoot.visible = count > 0;
        }
      }
    },
  };
}

