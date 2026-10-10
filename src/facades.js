import * as THREE from '../vendor/three.module.js';

// A small family of architectural vocabularies. The values are carried as a
// vertex attribute so every footprint can share one draw call and one shader.
const palettes = [
  [0x986b57, 0xb17e66, 0x80594b, 0xc09476], // brick
  [0xc4b7a1, 0xd0c5b0, 0xb5a78f, 0xd8cdb9], // limestone
  [0x77766d, 0x8a8173, 0x665f57, 0x998c7c], // cast iron
  [0xa78f75, 0xb69b7c, 0x947e68, 0xc0a88b], // prewar masonry
  [0x80969b, 0x91a8ac, 0x70858a, 0xa0b3b4], // curtain wall
  [0x96958e, 0xa4a39c, 0x898982, 0xb1afa6], // postwar concrete
  [0x994f40, 0xa75c48, 0x884638, 0xb46b51], // townhouse brick
  [0x6e7775, 0x7b817d, 0x626a69, 0x858b86], // roofs
];

function stable(n) {
  const x = Math.sin((Number(n) || 0) * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function facadeStyle(b) {
  const rawYear = Number(b.style?.year);
  const year = rawYear > 0 ? rawYear : 1950;
  const cls = String(b.style?.class || '');
  const residential = /^[ABC]/.test(cls);
  // SoHo and the adjacent historic loft district: west of Broadway, north of
  // Canal. Property class distinguishes old commercial lofts from row houses.
  const castIronDistrict = b.cx > -350 && b.cx < 1050 && b.cz > -1250 && b.cz < 650;
  const historicLoft = year < 1900 && castIronDistrict && /^[MGL]/.test(cls);
  const postwarHome = year >= 1945 && /^(A|B|C|D|R)/.test(cls);
  const modernOffice = year >= 1950 && /^O/.test(cls) && b.h > 50;
  const modernTower = year >= 1980 && b.h > 100;
  let kind;
  if (modernOffice || modernTower) kind = 4;
  else if (historicLoft) kind = 2;
  else if (postwarHome) kind = 0;
  else if (year >= 1945) kind = 5;
  else if (residential && b.h < 27 && year < 1945) kind = 6;
  else if (year < 1910) kind = 0;
  else if (year < 1945) kind = (b.h > 42 || /^[D]/.test(cls)) ? 1 : 3;
  else kind = 5;

  const choices = palettes[kind];
  const color = new THREE.Color(choices[Math.floor(stable(b.id ?? b.bin ?? b.cx) * choices.length)]);
  // Small neighborhood drift keeps a block from reading as a repeated swatch.
  const tint = 0.94 + stable((b.id ?? 0) + 71) * 0.12;
  color.multiplyScalar(tint);
  return { kind, color };
}

// The three atlas maps are built by tools/prepare-facade-textures.py from the
// bundled CC0 ambientCG maps and one original curtain-wall tile. Each tile
// covers a 3 m x 3.3 m facade repeat.
let facadeTextures;
let facadeTexturePromise;
function getFacadeTextureMaps(THREEArg) {
  if (facadeTextures) return facadeTextures;
  const neutral = (rgb, color = false) => {
    const t = new THREEArg.DataTexture(new Uint8Array([...rgb,255]), 1, 1, THREEArg.RGBAFormat);
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREEArg.RepeatWrapping;
    if (color && 'colorSpace' in t) t.colorSpace = THREEArg.SRGBColorSpace;
    return t;
  };
  facadeTextures = {
    color: neutral([255, 255, 255], true),
    height: neutral([128, 128, 128]),
    roughness: neutral([225, 225, 225]),
  };
  return facadeTextures;
}

/**
 * Preload all facade maps. Safe to await in Node (which has no DOM/ImageLoader)
 * and useful to await before the first browser render to avoid neutral maps
 * appearing for a frame. createFacadeMaterial remains synchronous.
 */
export function loadFacadeTextures(THREEArg = THREE) {
  const maps = getFacadeTextureMaps(THREEArg);
  if (typeof document === 'undefined' || !THREEArg.TextureLoader) return Promise.resolve(maps);
  if (facadeTexturePromise) return facadeTexturePromise;
  const loader = new THREEArg.TextureLoader();
  facadeTexturePromise = Promise.all(['color', 'height', 'roughness'].map(name => new Promise((resolve, reject) => {
    const texture = loader.load(
      new URL(`../assets/facades/${name}.jpg`, import.meta.url).href,
      loaded => resolve(loaded),
      undefined,
      reject,
    );
    texture.wrapS = texture.wrapT = THREEArg.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREEArg.LinearMipmapLinearFilter;
    texture.magFilter = THREEArg.LinearFilter;
    texture.anisotropy = 8;
    if (name === 'color' && 'colorSpace' in texture) texture.colorSpace = THREEArg.SRGBColorSpace;
    maps[name] = texture;
  }))).then(() => maps);
  return facadeTexturePromise;
}

export function createFacadeMaterial(THREEArg, night) {
  const maps = getFacadeTextureMaps(THREEArg);
  const mat = new THREEArg.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.025,
    side: THREEArg.DoubleSide,
  });
  mat.onBeforeCompile = shader => {
    shader.uniforms.night = night;
    shader.uniforms.facadeColorMap = { value: maps.color };
    shader.uniforms.facadeHeightMap = { value: maps.height };
    shader.uniforms.facadeRoughnessMap = { value: maps.roughness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float facadeKind;\nvarying float vFacadeKind;\nvarying vec2 vFacadeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFacadeUv = uv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacadeKind = facadeKind;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFacadeKind;\nvarying vec2 vFacadeUv;\nuniform float night;\nuniform sampler2D facadeColorMap;\nuniform sampler2D facadeHeightMap;\nuniform sampler2D facadeRoughnessMap;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kind = floor(vFacadeKind + 0.5);
        vec2 cell = fract(vFacadeUv);
        // The atlas has 8 individually authored repeat tiles, with a narrow
        // inset that keeps mip filtering from bleeding neighboring materials.
        vec2 tile = vec2(mod(kind, 4.0), floor(kind / 4.0));
        vec2 atlasUv = (tile + vec2(0.018) + cell * 0.964) / vec2(4.0, 2.0);
        // Derive mip gradients from the unwrapped metric UVs. atlasUv wraps at
        // each floor and tile edge, so implicit derivatives there pick an
        // enormous mip footprint and shimmer or sample a neighboring tile.
        vec2 atlasGradX = dFdx(vFacadeUv) * vec2(0.964 / 4.0, 0.964 / 2.0);
        vec2 atlasGradY = dFdy(vFacadeUv) * vec2(0.964 / 4.0, 0.964 / 2.0);
        vec3 surfaceColor = textureGrad(facadeColorMap, atlasUv, atlasGradX, atlasGradY).rgb;
        // Vertex colors retain the PLUTO-derived building palette. Normalize
        // each authored tile by its measured linear-light mean so its real
        // mortar, stone grain and patina become surface detail without
        // multiplying the building color by the material's average albedo.
        vec3 tileMean = vec3(0.240, 0.240, 0.238);
        if (kind > 0.5) tileMean = vec3(0.248, 0.216, 0.163);
        if (kind > 1.5) tileMean = vec3(0.158, 0.155, 0.146);
        if (kind > 2.5) tileMean = vec3(0.248, 0.216, 0.163);
        if (kind > 3.5) tileMean = vec3(0.122, 0.195, 0.212);
        if (kind > 4.5) tileMean = vec3(0.248, 0.216, 0.163);
        if (kind > 5.5) tileMean = vec3(0.240, 0.240, 0.238);
        if (kind > 6.5) tileMean = vec3(0.119, 0.120, 0.108);
        diffuseColor.rgb *= surfaceColor / tileMean;
        float roof = step(6.5, kind);
        float screenCell = max(length(dFdx(vFacadeUv)), length(dFdy(vFacadeUv)));
        float detail = 1.0 - smoothstep(0.04, 0.20, screenCell);

        // Recessed window openings, with dark glass, a soft reflected sky and
        // narrow stone or metal frames. Dimensions are tied to the metric UVs.
        vec2 edgeAA = max(fwidth(vFacadeUv), vec2(0.003));
        float inset = smoothstep(0.105 - edgeAA.x, 0.105 + edgeAA.x, cell.x)
                    * (1.0 - smoothstep(0.895 - edgeAA.x, 0.895 + edgeAA.x, cell.x))
                    * smoothstep(0.13 - edgeAA.y, 0.13 + edgeAA.y, cell.y)
                    * (1.0 - smoothstep(0.84 - edgeAA.y, 0.84 + edgeAA.y, cell.y));
        float tall = step(1.5, kind) * (1.0 - step(2.5, kind));
        float glassKind = step(3.5, kind) * (1.0 - step(4.5, kind));
        float tallShape = smoothstep(0.19 - edgeAA.x, 0.19 + edgeAA.x, cell.x)
                        * (1.0 - smoothstep(0.81 - edgeAA.x, 0.81 + edgeAA.x, cell.x))
                        * smoothstep(0.075 - edgeAA.y, 0.075 + edgeAA.y, cell.y)
                        * (1.0 - smoothstep(0.91 - edgeAA.y, 0.91 + edgeAA.y, cell.y));
        float windowShape = mix(inset, tallShape, tall);
        // Preserve the correct mean glass coverage as individual openings
        // become smaller than a pixel. Otherwise the entire distant skyline
        // turns into solid masonry when the fine grid is filtered away.
        float windowAverage = mix(0.44, 0.58, glassKind);
        float windowCoverage = windowShape * detail + windowAverage * (1.0 - detail);
        float windowMask = windowCoverage * (1.0 - roof);
        float mullion = max(1.0 - smoothstep(0.018, 0.035 + edgeAA.x, abs(cell.x - 0.5)),
                            1.0 - smoothstep(0.018, 0.035 + edgeAA.y, abs(cell.y - 0.5))) * detail;
        float glass = (windowShape * detail * (1.0 - mullion * 0.82)
                     + windowAverage * (1.0 - detail)) * (1.0 - roof);
        vec3 reflected = mix(vec3(0.095, 0.15, 0.18), vec3(0.27, 0.37, 0.39),
                             smoothstep(0.04, 0.96, cell.y));
        reflected += vec3(0.075, 0.095, 0.09) * (0.5 + 0.5 * sin(vFacadeUv.y * 2.4));
        diffuseColor.rgb = mix(diffuseColor.rgb, reflected, glass * (0.88 + glassKind * 0.1));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.53, windowMask * mullion);

        // Masonry courses and alternating joints fade out before they alias.
        float masonry = (1.0 - step(0.5, kind)) + step(2.5, kind) * (1.0 - step(3.5, kind));
        masonry += step(5.5, kind) * (1.0 - step(6.5, kind));
        float course = 1.0 - smoothstep(0.012, 0.028, abs(fract(vFacadeUv.y * 3.0) - 0.5));
        float jointX = 1.0 - smoothstep(0.012, 0.028, abs(fract(vFacadeUv.x * 2.0 + floor(vFacadeUv.y * 3.0) * 0.5) - 0.5));
        float brickLine = max(course, jointX) * masonry * detail * (1.0 - windowMask);
        diffuseColor.rgb *= 1.0 - brickLine * 0.105;

        // Ledges, pilasters and floor bands separate the historical styles.
        float floorBand = 1.0 - smoothstep(0.022, 0.052, abs(fract(vFacadeUv.y) - 0.91));
        float pier = 1.0 - smoothstep(0.025, 0.06, abs(fract(vFacadeUv.x) - 0.04));
        float ornament = step(0.5, kind) * (1.0 - step(3.5, kind));
        diffuseColor.rgb *= 1.0 - detail * ornament * (floorBand * 0.10 + pier * 0.075);
        float slab = step(4.5, kind) * (1.0 - step(5.5, kind));
        diffuseColor.rgb *= 1.0 - floorBand * slab * detail * 0.13;
        float roofSeam = (1.0 - smoothstep(0.01, 0.035, abs(fract(vFacadeUv.x * 0.7) - 0.5))) * roof * detail;
        diffuseColor.rgb *= 1.0 - roofSeam * 0.10;

        float hash = fract(sin(dot(floor(vFacadeUv), vec2(127.1, 311.7))) * 43758.5453);
        float lamps = windowMask * (1.0 - glassKind) * step(0.59, hash) * night;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float atlasRoughness = textureGrad(facadeRoughnessMap, atlasUv, atlasGradX, atlasGradY).r;
        roughnessFactor *= mix(atlasRoughness, 0.19, glass);
      `)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        float castIron = step(1.5, kind) * (1.0 - step(2.5, kind));
        metalnessFactor = max(metalnessFactor, castIron * 0.18 * detail);
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Derivative bump mapping adds shallow mortar, stone and aggregate
        // relief without extra geometry or a tangent buffer on city meshes.
        float h0 = textureGrad(facadeHeightMap, atlasUv, atlasGradX, atlasGradY).r;
        vec2 dh = vec2(textureGrad(facadeHeightMap, atlasUv + atlasGradX, atlasGradX, atlasGradY).r - h0,
                       textureGrad(facadeHeightMap, atlasUv + atlasGradY, atlasGradX, atlasGradY).r - h0);
        vec3 sigmaX = normalize(dFdx(-vViewPosition));
        vec3 sigmaY = normalize(dFdy(-vViewPosition));
        vec3 r1 = cross(sigmaY, normal);
        vec3 r2 = cross(normal, sigmaX);
        float det = dot(sigmaX, r1) * faceDirection;
        vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
        normal = normalize(abs(det) * normal - grad * (0.055 * detail * (1.0 - windowMask)));
      `)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.63, 0.31) * lamps * 0.8;');
  };
  mat.customProgramCacheKey = () => 'birdway-facade-pbr-atlas-v2';
  return mat;
}
