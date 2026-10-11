import * as THREE from '../vendor/three.module.js';

const HUDSON = [[-3000, 2600], [-2700, 1500], [-2500, 0], [-2600, -1600], [-2700, -3500]];
const EAST_RIVER = [[1900, 1700], [1900, 1500], [1900, 1200], [2100, 950], [2250, 500], [2500, -500], [2800, -1700], [3100, -2000], [2900, -1000], [2600, 0], [2350, 900], [2100, 1300], [2050, 1500], [1900, 1700]];
const HARBOR = [[-1700, 2200], [-2200, 3000], [-3100, 3600], [-4000, 4200], [-5000, 5100], [-5600, 6000], [-5000, 6700], [-4200, 6200], [-3500, 5200], [-2900, 4000], [-2000, 3100]];
const FAR = 12000;

function pathLengths(points) {
 const lengths = [0];
 for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
 return lengths;
}

function routePosition(route, distance) {
 const {points, lengths, total} = route;
 let d = ((distance % total) + total) % total;
 let segment = 1;
 while (segment < lengths.length - 1 && lengths[segment] < d) segment++;
 const a = points[segment - 1], b = points[segment], span = lengths[segment] - lengths[segment - 1];
 const t = span > 0 ? (d - lengths[segment - 1]) / span : 0;
 return {x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: Math.atan2(b[0] - a[0], b[1] - a[1])};
}

function validateWaterRoute(points, map, closed) {
 if (!map?.onLand) return;
 const legs = closed ? points.map((point, i) => [point, points[(i + 1) % points.length]]) : points.slice(1).map((point, i) => [points[i], point]);
 for (const [a, b] of legs) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20);
  for (let i = 0; i <= steps; i++) {
   const t = i / steps;
   if (map.onLand(a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t)) throw new Error('A harbor boat route intersects mapped land.');
  }
 }
}

function addBox(out, x, y, z, width, height, depth, color) {
 const x0 = x - width / 2, x1 = x + width / 2, y0 = y - height / 2, y1 = y + height / 2, z0 = z - depth / 2, z1 = z + depth / 2;
 const faces = [
  [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],
  [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
  [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],
 ];
 for (const face of faces) for (const i of [0,1,2,0,2,3]) {out.positions.push(...face[i]);out.colors.push(color.r,color.g,color.b);}
}

function addBow(out, width, y0, y1, z0, z1, color) {
 const x = width / 2, points = [[-x,y0,z0],[x,y0,z0],[x,y1,z0],[-x,y1,z0],[0,y0,z1],[0,y1,z1]];
 const triangles = [[0,1,4],[1,2,5],[1,5,4],[2,3,5],[3,0,4],[3,4,5],[0,3,2],[0,2,1]];
 for (const tri of triangles) for (const i of tri) {out.positions.push(...points[i]);out.colors.push(color.r,color.g,color.b);}
}

function makeBoatGeometry(kind, hullColor) {
 const out = {positions: [], colors: []}, hull = new THREE.Color(hullColor);
 const deck = new THREE.Color(kind === 'ferry' ? 0xeee9d9 : 0xb7ad91);
 const cabin = new THREE.Color(kind === 'ferry' ? 0xe4e5dc : 0xd4d0bd);
 const windows = new THREE.Color(0x294c59), roof = new THREE.Color(kind === 'ferry' ? 0x2a7280 : 0x565f5a);
 const scale = kind === 'ferry' ? 1 : .76;
 const L = 28 * scale, W = 7.6 * scale;
 addBox(out, 0, .75, -1.3 * scale, W, 1.25 * scale, L - 5 * scale, hull);
 addBow(out, W, .12 * scale, 1.37 * scale, 10.8 * scale, L * .56, hull);
 addBox(out, 0, 1.43 * scale, -1.2 * scale, W + .24, .18 * scale, L - 4.2 * scale, deck);
 if (kind === 'ferry') {
  addBox(out, 0, 2.75 * scale, -1.2 * scale, 4.55 * scale, 2.45 * scale, 12.5 * scale, cabin);
  addBox(out, 0, 4.05 * scale, -1.2 * scale, 4.9 * scale, .24 * scale, 13.1 * scale, roof);
  addBox(out, 0, 4.92 * scale, -1.0 * scale, 3.3 * scale, 1.35 * scale, 7.8 * scale, cabin);
  addBox(out, 0, 5.64 * scale, -1.0 * scale, 3.6 * scale, .18 * scale, 8.0 * scale, roof);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) addBox(out, side * 2.3 * scale, 2.82 * scale, (-5 + i * 2.05) * scale, .075 * scale, .9 * scale, 1.42 * scale, windows);
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) addBox(out, side * 1.68 * scale, 5.0 * scale, (-3.4 + i * 2.4) * scale, .055 * scale, .76 * scale, 1.7 * scale, windows);
 } else {
  addBox(out, 0, 2.35 * scale, -5.0 * scale, 4.0 * scale, 2.3 * scale, 5.2 * scale, cabin);
  addBox(out, 0, 3.59 * scale, -5.0 * scale, 4.35 * scale, .2 * scale, 5.5 * scale, roof);
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) addBox(out, side * 2.02 * scale, 2.48 * scale, (-6.4 + i * 1.4) * scale, .06 * scale, .75 * scale, .9 * scale, windows);
  // A compact aft deckhouse and boom make the workboats read as harbor craft.
  addBox(out, 0, 1.85 * scale, 5.0 * scale, 3.2 * scale, .6 * scale, 4.2 * scale, hull);
  addBox(out, .55 * scale, 3.0 * scale, 3.1 * scale, .22 * scale, 2.7 * scale, .22 * scale, roof);
  addBox(out, .55 * scale, 4.2 * scale, 4.0 * scale, .22 * scale, .22 * scale, 2.0 * scale, roof);
 }
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
 geometry.setAttribute('color', new THREE.Float32BufferAttribute(out.colors, 3));
 geometry.computeVertexNormals();
 return geometry;
}

function makeWake() {
 const positions = [];
 const streak = (a, b, widthA, widthB) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length, nz = dx / length;
  const p = [
   [a[0] + nx * widthA, .035, a[1] + nz * widthA], [a[0] - nx * widthA, .035, a[1] - nz * widthA],
   [b[0] - nx * widthB, .025, b[1] - nz * widthB], [b[0] + nx * widthB, .025, b[1] + nz * widthB],
  ];
  for (const i of [0, 1, 2, 0, 2, 3]) positions.push(...p[i]);
 };
 for (const side of [-1, 1]) {
  streak([side * 1.15, -13], [side * 1.75, -16.5], .13, .15);
  streak([side * 1.95, -18.5], [side * 2.65, -22.5], .13, .14);
  streak([side * 2.95, -24.5], [side * 3.8, -29], .12, .035);
 }
 streak([-.1, -14], [.1, -17], .12, .1);
 streak([-.08, -20], [.16, -23], .1, .06);
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
 geometry.computeVertexNormals();
 return geometry;
}

/** Build a handful of ferries and workboats on tested water-only harbor lanes. */
export function makeBoats(scene, map) {
 const hudsonRoundTrip = [...HUDSON, ...HUDSON.slice(1, -1).reverse()];
 const routes = [
  {name: 'Hudson ferry lane', points: hudsonRoundTrip, loop: true},
  {name: 'East River ferry lane', points: EAST_RIVER, loop: false},
  {name: 'Harbor workboat loop', points: HARBOR, loop: true},
 ];
 routes.forEach(route => validateWaterRoute(route.points, map, route.loop));
 const routeData = routes.map(route => {
  const points = route.loop ? [...route.points, route.points[0]] : route.points;
  const lengths = pathLengths(points);
  return {...route, points, lengths, total: lengths.at(-1)};
 });
 const ferries = [
  {route: 0, start: .12, speed: 8.4, kind: 'ferry', color: 0x174957},
  {route: 0, start: .61, speed: 7.6, kind: 'ferry', color: 0x174957},
  {route: 1, start: .19, speed: 7.1, kind: 'ferry', color: 0x1b5360},
  {route: 1, start: .70, speed: 6.5, kind: 'ferry', color: 0x1b5360},
  {route: 2, start: .08, speed: 5.4, kind: 'workboat', color: 0x793f32},
  {route: 2, start: .56, speed: 4.6, kind: 'workboat', color: 0x665d48},
 ];
 const root = new THREE.Group(); root.name = 'Harbor ferries and workboats'; scene.add(root);
 const boats = ferries.map((boat, index) => {
  const route = routeData[boat.route], group = new THREE.Group();
  const geometry = makeBoatGeometry(boat.kind, boat.color);
  const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .72, metalness: .04});
  const hull = new THREE.Mesh(geometry, material); hull.castShadow = true; group.add(hull);
  const wakeMaterial = new THREE.MeshBasicMaterial({color: 0xdbe6df, transparent: true, opacity: boat.kind === 'ferry' ? .2 : .16, depthWrite: false, side: THREE.DoubleSide});
  const wake = new THREE.Mesh(makeWake(), wakeMaterial); group.add(wake);
  root.add(group);
  return {route, group, hull, material, speed: boat.speed, distance: route.total * boat.start, phase: index * 2.7};
 });
 const update = (dt = 0, position = null, night = 0) => {
  const step = Math.max(0, Math.min(.05, Number(dt) || 0));
  for (const boat of boats) {
   boat.distance += boat.speed * step;
   const p = routePosition(boat.route, boat.distance), visible = !position || (p.x - position.x) ** 2 + (p.z - position.z) ** 2 < FAR * FAR;
   boat.group.visible = visible;
   if (!visible) continue;
   boat.group.position.set(p.x, -.84 + .035 * Math.sin(boat.phase + boat.distance * .035), p.z);
   boat.group.rotation.y = p.heading;
   boat.hull.material.emissive.set(0x081015);
   boat.hull.material.emissiveIntensity = Math.max(0, Math.min(1, night)) * .22;
  }
 };
 update(0, null, 0);
 return {root, update};
}
