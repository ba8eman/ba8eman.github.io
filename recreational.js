import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ------------------------------------------------------------------ */
/*  Recreational — a Kerala backwater at sunset                        */
/*                                                                     */
/*  A kettuvallam poles itself slowly down a meandering channel while  */
/*  the projects wait on the banks. Same hand-made low-poly vocabulary */
/*  as the meadow next door, just lit by a setting sun instead.        */
/* ------------------------------------------------------------------ */

/* ----------------------------- the projects ----------------------------- */
/* Swap these for the real thing — add a `url` to turn a plaque into a real
   link, leave it off and it stays a dashed placeholder. Order is the order
   you drift past them. */

const PROJECTS = [
  { name: 'Project 01', note: 'placeholder' },
  { name: 'Project 02', note: 'placeholder' },
  { name: 'Project 03', note: 'placeholder' },
  { name: 'Project 04', note: 'placeholder' },
  { name: 'Project 05', note: 'placeholder' },
  { name: 'Project 06', note: 'placeholder' },
  { name: 'Project 07', note: 'placeholder' },
  { name: 'Project 08', note: 'placeholder' },
];

/* ------------------------------ the river ------------------------------ */

const RIVER_HALF = 5.2;      // half-width of open water
const WATER_HALF = RIVER_HALF + 0.4;
const GROUND_HALF = 34;      // half-width of the whole terrain slab
const Z_START = 24;          // where the boat pushes off
const Z_END = -104;          // where the trip loops — kept well short of the
                             // world's edge so the river never visibly stops

// The terrain runs a long way past the end of the trip. Everything between
// Z_END and WORLD_END exists purely to be swallowed by haze, so the boat is
// always sailing into more river rather than toward a horizon it can reach.
const WORLD_START = 50;
const WORLD_END = -200;
const WORLD_LEN = WORLD_START - WORLD_END;
const WORLD_MID = (WORLD_START + WORLD_END) / 2;
const SCATTER_END = WORLD_END + 8;   // scenery fills the fog too

const FOG_NEAR = 32;
const FOG_FAR = 100;                 // the edge at WORLD_END sits well beyond this

const SIGN_SPACING = 11.5;
const SIGN_FIRST_Z = -8;

const clock = new THREE.Clock();

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// the channel wanders a little on its way to the sun
function riverCenterX(z) {
  return Math.sin(z * 0.045) * 3.1 + Math.sin(z * 0.019 + 1.3) * 1.7;
}

// one continuous slab: a bowl carved below the waterline, banks rising either side
function groundHeight(x, z) {
  const d = Math.abs(x - riverCenterX(z));
  const wob =
    Math.sin(z * 0.17) * 0.2 +
    Math.cos(x * 0.21 + z * 0.09) * 0.17 +
    Math.sin((x + z) * 0.07) * 0.22;

  if (d < RIVER_HALF) {
    const t = d / RIVER_HALF;
    return -0.1 - 1.35 * (1 - t * t);
  }
  const up = (d - RIVER_HALF) * 0.62;
  return -0.1 + Math.min(up, 4.2) + wob * Math.min(1, up * 0.8);
}

/* ------------------------------- scene ------------------------------- */

const HORIZON = new THREE.Color(0xf4a262);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON.getHex(), FOG_NEAR, FOG_FAR);

// Expressed in the BOAT'S OWN frame, not world space. The hull is modelled
// facing +Z, so a camera trailing it sits at negative Z — get this sign wrong
// and the rotation parks the camera downstream, looking back up the river.
const CAM_OFFSET = new THREE.Vector3(-2.2, 1.75, -9.2);
const CAM_LOOK_Y = 1.5;
const UP = new THREE.Vector3(0, 1, 0);

function headingAt(z) {
  return Math.atan2(riverCenterX(z - 2.5) - riverCenterX(z), -2.5);
}

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 500);
{
  const start = CAM_OFFSET.clone().applyAxisAngle(UP, headingAt(Z_START));
  camera.position.set(
    riverCenterX(Z_START) + start.x,
    CAM_LOOK_Y + start.y,
    Z_START + start.z
  );
}

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(riverCenterX(Z_START), CAM_LOOK_Y, Z_START);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 26;
controls.minPolarAngle = Math.PI * 0.16;
controls.maxPolarAngle = Math.PI * 0.495;   // stay above the waterline
controls.enablePan = false;

let userInteracted = false;
const hint = document.getElementById('hint');
controls.addEventListener('start', () => {
  userInteracted = true;
  hint.style.opacity = '0';
});

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

/* -------------------------------- sky -------------------------------- */
/* direction of the sun, as seen from anywhere — it is "at infinity", so both
   the gradient and the disc are pinned to the camera and never grow */

const SUN_DIR = new THREE.Vector3(0.05, 0.05, -1).normalize();

const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color(0x3d4f86) },
    midColor: { value: new THREE.Color(0xe98a6a) },
    bottomColor: { value: new THREE.Color(0xf9b877) },
    glowColor: { value: new THREE.Color(0xffd79a) },
    sunDir: { value: SUN_DIR.clone() },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 bottomColor;
    uniform vec3 glowColor;
    uniform vec3 sunDir;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 c = mix(midColor, topColor, clamp(h * 1.7, 0.0, 1.0));
      c = mix(bottomColor, c, clamp((h + 0.04) / 0.22, 0.0, 1.0));
      float a = max(dot(d, sunDir), 0.0);
      c += glowColor * pow(a, 14.0) * 0.9;
      c += glowColor * pow(a, 3.0) * 0.22;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});

const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), skyMat);
sky.renderOrder = -1;
scene.add(sky);

// the sun itself: a flat disc plus a couple of additive haloes
const sunGroup = new THREE.Group();
sunGroup.renderOrder = 0;
{
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(11, 48),
    new THREE.MeshBasicMaterial({ color: 0xfff4cf, fog: false, depthWrite: false })
  );
  sunGroup.add(disc);

  const haloes = [
    { r: 17, c: 0xffd591, o: 0.3 },
    { r: 27, c: 0xff9e63, o: 0.17 },
    { r: 46, c: 0xff8452, o: 0.09 },
  ];
  for (const h of haloes) {
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(h.r, 40),
      new THREE.MeshBasicMaterial({
        color: h.c,
        transparent: true,
        opacity: h.o,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    glow.position.z = -0.1 * h.r;
    sunGroup.add(glow);
  }
}
scene.add(sunGroup);

/* ------------------------------- lights ------------------------------- */

const hemi = new THREE.HemisphereLight(0xffcf9a, 0x2f4a3a, 0.75);
scene.add(hemi);

// low, warm, raking light coming up the river from the sun
const sun = new THREE.DirectionalLight(0xffc387, 1.55);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -17;
sun.shadow.camera.right = 17;
sun.shadow.camera.top = 17;
sun.shadow.camera.bottom = -17;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0022;
scene.add(sun);
scene.add(sun.target);

// cool bounce from the sky opposite the sun, so shadowed sides aren't dead
const bounce = new THREE.DirectionalLight(0x8fb6e8, 0.4);
bounce.position.set(-6, 7, 10);
scene.add(bounce);

/* ------------------------------- terrain ------------------------------- */

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(GROUND_HALF * 2, WORLD_LEN, 84, 190);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, WORLD_MID);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const silt = new THREE.Color(0x4a3f2a);      // riverbed
  const mud = new THREE.Color(0x7c6a44);       // waterline
  const grass = new THREE.Color(0x4f7a38);     // bank
  const lush = new THREE.Color(0x35602f);      // deeper vegetation
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);

    const mottle = hash(x * 1.9, z * 1.9);
    if (y < -0.12) {
      tmp.copy(mud).lerp(silt, Math.min(1, -y / 1.4));
    } else {
      tmp.copy(mud).lerp(grass, Math.min(1, (y + 0.1) / 0.8));
      tmp.lerp(lush, Math.min(1, Math.max(0, (y - 0.5) / 2.6)));
      tmp.lerp(new THREE.Color(0x6f9b45), mottle * 0.3);
    }
    tmp.toArray(colors, i * 3);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })
  );
  mesh.receiveShadow = true;
  return mesh;
}

scene.add(buildTerrain());

/* -------------------------------- water -------------------------------- */
/* a grid strip bent to follow the meander. Y ripples and vertex brightness
   are refreshed every frame; the base colour (depth + the sun's gold column)
   is what gets modulated. */

const WATER_SEG_X = 30;
const WATER_SEG_Z = 180;

const waterGeo = new THREE.PlaneGeometry(WATER_HALF * 2, WORLD_LEN, WATER_SEG_X, WATER_SEG_Z);
waterGeo.rotateX(-Math.PI / 2);
waterGeo.translate(0, 0, WORLD_MID);

const waterPos = waterGeo.attributes.position;
const waterCount = waterPos.count;
const waterU = new Float32Array(waterCount);   // across-channel, -1..1
const waterZ = new Float32Array(waterCount);
const waterBase = new Float32Array(waterCount * 3);
const waterColors = new Float32Array(waterCount * 3);

{
  const deep = new THREE.Color(0x1d4a55);
  const shallow = new THREE.Color(0x3c7e72);
  const tmp = new THREE.Color();

  for (let i = 0; i < waterCount; i++) {
    const x = waterPos.getX(i);
    const z = waterPos.getZ(i);
    waterU[i] = x / WATER_HALF;
    waterZ[i] = z;

    // bend the whole row sideways onto the channel centreline
    waterPos.setX(i, x + riverCenterX(z));

    const edge = Math.abs(waterU[i]);
    tmp.copy(deep).lerp(shallow, Math.pow(edge, 2.2));
    tmp.toArray(waterBase, i * 3);
  }
}

waterGeo.setAttribute('color', new THREE.BufferAttribute(waterColors, 3));

const water = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.46,
    metalness: 0.08,
    // just sheer enough to see fish moving underneath
    transparent: true,
    opacity: 0.82,
  })
);
water.receiveShadow = true;
water.renderOrder = 1;   // before the wake and splash rings
scene.add(water);

const GOLD = new THREE.Color(0xf6b269);
const EMBER = new THREE.Color(0xe8944e);

const warmScratch = new THREE.Color();

function updateWater(t, boatX, boatZ) {
  const pos = waterGeo.attributes.position;
  const col = waterGeo.attributes.color;

  for (let i = 0; i < waterCount; i++) {
    const x = pos.getX(i);
    const z = waterZ[i];

    const ripple =
      Math.sin(z * 0.55 + t * 1.5) * 0.045 +
      Math.sin(x * 0.7 - t * 1.1) * 0.035 +
      Math.sin((x + z) * 0.33 + t * 0.7) * 0.03;
    pos.setY(i, ripple);

    // the sun lays a gold column down the middle, brightest at the horizon
    const across = (x - boatX) / 3.4;
    const column = Math.exp(-across * across);
    // Distance AHEAD OF THE BOAT, not absolute z. Keyed to z, the whole river
    // turned gold once the trip ran far enough downstream.
    const toHorizon = THREE.MathUtils.clamp((boatZ - z) / 110, 0, 1);
    let gold = column * Math.pow(toHorizon, 1.5) * 1.1;

    // crests catch the light, troughs don't
    const crest = THREE.MathUtils.clamp((ripple + 0.06) / 0.14, 0, 1);
    gold *= 0.45 + crest * 0.75;

    const j = i * 3;
    const shimmer = 0.82 + crest * 0.35;
    // reuse one Color — cloning here allocated once per vertex per frame
    warmScratch.copy(GOLD).lerp(EMBER, 1 - toHorizon);
    col.array[j] = THREE.MathUtils.lerp(waterBase[j] * shimmer, warmScratch.r, gold);
    col.array[j + 1] = THREE.MathUtils.lerp(waterBase[j + 1] * shimmer, warmScratch.g, gold);
    col.array[j + 2] = THREE.MathUtils.lerp(waterBase[j + 2] * shimmer, warmScratch.b, gold);
  }

  pos.needsUpdate = true;
  col.needsUpdate = true;
  waterGeo.computeVertexNormals();
}

/* ------------------------------ distant hills ------------------------------ */

function buildHills() {
  const group = new THREE.Group();
  const layers = [
    { z: -305, h: 22, c: 0x6a5f8e, n: 7, spread: 210 },
    { z: -268, h: 16, c: 0x4e4a72, n: 8, spread: 185 },
    { z: -238, h: 12, c: 0x3a3a5c, n: 9, spread: 165 },
  ];

  for (const L of layers) {
    const mat = new THREE.MeshBasicMaterial({ color: L.c, fog: false });
    for (let i = 0; i < L.n; i++) {
      const w = 26 + hash(i, L.z) * 40;
      const h = L.h * (0.55 + hash(i * 3.1, L.z) * 0.8);
      const shape = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4 + (i % 3), 1), mat);
      shape.position.set((i / (L.n - 1) - 0.5) * L.spread + hash(i, 7) * 12, h / 2 - 3, L.z);
      shape.rotation.y = hash(i, 11) * Math.PI;
      group.add(shape);
    }
  }
  return group;
}

scene.add(buildHills());

/* ------------------------------ coconut palms ------------------------------ */

const frondGeo = (() => {
  const g = new THREE.PlaneGeometry(2.9, 0.68, 10, 3);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const along = pos.getX(i);              // -1.45 .. 1.45
    const across = pos.getY(i);             // -0.34 .. 0.34
    const t = Math.max(0, (along + 1.45) / 2.9);   // 0 at base, 1 at tip
    const w = across * (1 - Math.pow(t, 2.4) * 0.92) * (0.45 + t * 0.9);
    const droop = Math.pow(t, 2.1) * 1.5;
    pos.setXYZ(i, along + 1.45, -droop + Math.abs(w) * 0.3, w);
  }
  g.computeVertexNormals();
  return g;
})();

function makeTrunkGeometry(height, lean) {
  const g = new THREE.CylinderGeometry(0.1, 0.21, height, 7, 7, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, (y + height / 2) / height);
    const notch = 1 + Math.sin(t * height * 3.2) * 0.07;
    pos.setX(i, pos.getX(i) * notch + Math.pow(t, 1.9) * lean);
    pos.setZ(i, pos.getZ(i) * notch);
  }
  g.translate(0, height / 2, 0);
  g.computeVertexNormals();
  return g;
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, flatShading: true, roughness: 0.95 });
const frondMats = [0x2c5c34, 0x35693a, 0x24512f].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, side: THREE.DoubleSide, roughness: 0.9 })
);
const coconutMat = new THREE.MeshStandardMaterial({ color: 0x4c3a24, flatShading: true });

// a handful of trunk shapes, shared between palms so we aren't rebuilding geometry
const trunkGeos = [
  makeTrunkGeometry(5.4, 1.5),
  makeTrunkGeometry(6.6, 2.4),
  makeTrunkGeometry(4.6, 0.9),
  makeTrunkGeometry(7.4, 3.1),
];

const palms = [];

function makePalm(seed) {
  const palm = new THREE.Group();
  const gi = Math.floor(hash(seed, 1.7) * trunkGeos.length) % trunkGeos.length;
  const geo = trunkGeos[gi];
  const height = [5.4, 6.6, 4.6, 7.4][gi];
  const lean = [1.5, 2.4, 0.9, 3.1][gi];

  const trunk = new THREE.Mesh(geo, trunkMat);
  trunk.castShadow = true;
  palm.add(trunk);

  // the crown rides on top of the bent trunk
  const crown = new THREE.Group();
  crown.position.set(lean, height, 0);
  crown.rotation.z = -0.3;   // keep the fan tilted the way the trunk leans
  palm.add(crown);

  const n = 7;
  for (let i = 0; i < n; i++) {
    const frond = new THREE.Mesh(frondGeo, frondMats[i % frondMats.length]);
    frond.rotation.y = (i / n) * Math.PI * 2 + hash(seed, i) * 0.3;
    frond.rotation.z = 0.5 + hash(seed * 2, i) * 0.45;
    frond.scale.setScalar(0.85 + hash(seed, i * 3.3) * 0.4);
    crown.add(frond);
  }

  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), coconutMat);
    nut.position.set(Math.cos(i * 2.2) * 0.22, -0.16, Math.sin(i * 2.2) * 0.22);
    crown.add(nut);
  }

  palm.userData.crown = crown;
  palm.userData.swayPhase = hash(seed, 5.5) * Math.PI * 2;
  palm.userData.crownRestZ = crown.rotation.z;
  palms.push(palm);
  return palm;
}

// line the banks, leaning out over the water
let palmSeed = 0;
for (let z = Z_START + 14; z > SCATTER_END; ) {
  // past the loop point the bank is only ever seen through haze, so thin it out
  const inHaze = z < Z_END;
  for (const side of [-1, 1]) {
    const n = inHaze ? 1 : 1 + Math.floor(hash(z, side) * 2);
    for (let k = 0; k < n; k++) {
      palmSeed += 1;
      const inset = RIVER_HALF + 0.9 + hash(palmSeed, z) * 7;
      const zz = z + (hash(palmSeed, 2.2) - 0.5) * 5;
      const x = riverCenterX(zz) + side * inset;
      const palm = makePalm(palmSeed);
      palm.position.set(x, groundHeight(x, zz) - 0.15, zz);
      // lean out over the river, with some scatter
      palm.rotation.y = (side < 0 ? 0 : Math.PI) + (hash(palmSeed, 9) - 0.5) * 1.5;
      palm.scale.setScalar(0.75 + hash(palmSeed, 4) * 0.5);
      scene.add(palm);
    }
  }
  z -= inHaze ? 11 : 6.5;
}

/* ------------------------------ bank clutter ------------------------------ */

const bushMat = new THREE.MeshStandardMaterial({ color: 0x2f5c32, flatShading: true, roughness: 1 });
const bushGeo = new THREE.IcosahedronGeometry(0.5, 0);

for (let i = 0; i < 200; i++) {
  const zz = Z_START + 16 - hash(i, 1.1) * (Z_START + 16 - SCATTER_END);
  const side = hash(i, 2.7) > 0.5 ? 1 : -1;
  const x = riverCenterX(zz) + side * (RIVER_HALF + 0.3 + hash(i, 3.3) * 9);
  const clump = new THREE.Group();
  const blobs = 2 + Math.floor(hash(i, 4.4) * 3);
  for (let b = 0; b < blobs; b++) {
    const blob = new THREE.Mesh(bushGeo, bushMat);
    blob.position.set((hash(i, b) - 0.5) * 0.7, 0.25 + hash(i, b * 2) * 0.2, (hash(i, b * 3) - 0.5) * 0.7);
    blob.scale.setScalar(0.5 + hash(i, b * 5) * 0.7);
    blob.castShadow = true;
    clump.add(blob);
  }
  clump.position.set(x, groundHeight(x, zz), zz);
  scene.add(clump);
}

// reeds right at the waterline
const reedMat = new THREE.MeshStandardMaterial({ color: 0x6f7f3a, flatShading: true });
const reedGeo = new THREE.CylinderGeometry(0.015, 0.03, 1.1, 4);
reedGeo.translate(0, 0.55, 0);   // stand it on its base, not its middle
const reeds = [];
for (let i = 0; i < 295; i++) {
  const zz = Z_START + 18 - hash(i, 5.1) * (Z_START + 18 - SCATTER_END);
  const side = hash(i, 6.2) > 0.5 ? 1 : -1;
  const x = riverCenterX(zz) + side * (RIVER_HALF - 0.5 + hash(i, 7.3) * 1.6);
  const reed = new THREE.Mesh(reedGeo, reedMat);
  reed.position.set(x, groundHeight(x, zz), zz);
  reed.scale.setScalar(0.6 + hash(i, 8) * 0.8);
  reed.userData.phase = hash(i, 9) * Math.PI * 2;
  scene.add(reed);
  reeds.push(reed);
}

// thatched huts, well back from the bank
function makeHut() {
  const hut = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.3, 1.9),
    new THREE.MeshStandardMaterial({ color: 0xd9c6a2, flatShading: true, roughness: 1 })
  );
  wall.position.y = 0.65;
  wall.castShadow = true;
  hut.add(wall);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.1, 1.35, 4),
    new THREE.MeshStandardMaterial({ color: 0x7d5a30, flatShading: true, roughness: 1 })
  );
  roof.position.y = 1.95;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  hut.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.9, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, flatShading: true })
  );
  door.position.set(0, 0.45, 0.97);
  hut.add(door);
  return hut;
}

for (let i = 0; i < 8; i++) {
  const zz = Z_START - 6 - i * 26 - hash(i, 3) * 8;
  const side = i % 2 === 0 ? -1 : 1;
  const x = riverCenterX(zz) + side * (RIVER_HALF + 7 + hash(i, 4) * 4);
  const hut = makeHut();
  hut.position.set(x, groundHeight(x, zz) - 0.1, zz);
  hut.rotation.y = (side < 0 ? 1 : -1) * (0.9 + hash(i, 5) * 0.6);
  scene.add(hut);
}

/* ------------------------------ on the water ------------------------------ */

// water hyacinth — the green rafts that choke every backwater
const hyacinthLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3f, flatShading: true, roughness: 0.9 });
const hyacinthBloomMat = new THREE.MeshStandardMaterial({ color: 0xb79ad8, flatShading: true });
const hyacinthLeafGeo = new THREE.IcosahedronGeometry(0.2, 0);
const hyacinthBloomGeo = new THREE.IcosahedronGeometry(0.07, 0);
const floaters = [];

for (let i = 0; i < 60; i++) {
  const zz = Z_START + 10 - hash(i, 11.1) * (Z_START + 10 - SCATTER_END);
  const u = (hash(i, 12.2) - 0.5) * 1.75;
  const clump = new THREE.Group();
  const leaves = 4 + Math.floor(hash(i, 13.3) * 4);
  for (let l = 0; l < leaves; l++) {
    const leaf = new THREE.Mesh(hyacinthLeafGeo, hyacinthLeafMat);
    leaf.position.set((hash(i, l) - 0.5) * 0.85, 0.06, (hash(i, l * 2) - 0.5) * 0.85);
    leaf.scale.set(1.1, 0.42, 1.1);
    clump.add(leaf);
  }
  if (hash(i, 14) > 0.55) {
    const bloom = new THREE.Mesh(hyacinthBloomGeo, hyacinthBloomMat);
    bloom.position.set(0, 0.2, 0);
    clump.add(bloom);
  }
  clump.position.set(riverCenterX(zz) + u * RIVER_HALF, 0.02, zz);
  clump.userData.side = u >= 0 ? 1 : -1;
  clump.userData.restU = u;
  clump.userData.u = u;
  clump.userData.z = zz;
  clump.userData.phase = hash(i, 15) * Math.PI * 2;
  scene.add(clump);
  floaters.push(clump);
}

// lily pads, with the occasional lotus
const padMat = new THREE.MeshStandardMaterial({ color: 0x2f6b40, flatShading: true, side: THREE.DoubleSide });
const padGeo = new THREE.CircleGeometry(0.34, 9, 0.25, Math.PI * 1.85);
padGeo.rotateX(-Math.PI / 2);
const lotusMat = new THREE.MeshStandardMaterial({ color: 0xffb3cd, flatShading: true });

for (let i = 0; i < 92; i++) {
  const zz = Z_START + 12 - hash(i, 16.1) * (Z_START + 12 - SCATTER_END);
  // pads can't move, so seed them clear of the lane the boat runs down
  const raw = (hash(i, 17.2) - 0.5) * 2;
  const u = (raw >= 0 ? 1 : -1) * (0.46 + Math.abs(raw) * 0.48);
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.set(riverCenterX(zz) + u * RIVER_HALF, 0.03, zz);
  pad.rotation.y = hash(i, 18) * Math.PI * 2;
  pad.scale.setScalar(0.7 + hash(i, 19) * 0.7);
  scene.add(pad);

  if (hash(i, 20) > 0.82) {
    const lotus = new THREE.Group();
    for (let p = 0; p < 5; p++) {
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), lotusMat);
      petal.position.set(Math.cos((p / 5) * Math.PI * 2) * 0.05, 0.12, Math.sin((p / 5) * Math.PI * 2) * 0.05);
      petal.rotation.x = Math.cos((p / 5) * Math.PI * 2) * 0.35;
      petal.rotation.z = Math.sin((p / 5) * Math.PI * 2) * 0.35;
      lotus.add(petal);
    }
    lotus.position.copy(pad.position);
    lotus.position.y = 0.06;
    scene.add(lotus);
  }
}

// bamboo channel markers driven into the shallows
const bambooMat = new THREE.MeshStandardMaterial({ color: 0x9a8f4f, flatShading: true });
for (let i = 0; i < 34; i++) {
  const zz = Z_START + 6 - hash(i, 21.1) * (Z_START + 6 - SCATTER_END);
  const side = hash(i, 22.2) > 0.5 ? 1 : -1;
  const x = riverCenterX(zz) + side * (RIVER_HALF - 0.8 - hash(i, 23.3) * 1.2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 5), bambooMat);
  pole.position.set(x, 0.9, zz);
  pole.rotation.z = (hash(i, 24) - 0.5) * 0.5;
  pole.rotation.x = (hash(i, 25) - 0.5) * 0.3;
  pole.castShadow = true;
  scene.add(pole);
}

// ducks
const DUCK_LANE = RIVER_HALF - 0.6;   // how far out a duck can paddle
const BOAT_CLEAR = 1.55;              // hull half-width plus a margin
const DUCK_ALERT_Z = 7;               // how far off it notices the boat

const duckBodyMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, flatShading: true });
const duckHeadMat = new THREE.MeshStandardMaterial({ color: 0x3c3a36, flatShading: true });
const duckBeakMat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, flatShading: true });
const ducks = [];

function makeDuck() {
  const duck = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), duckBodyMat);
  body.scale.set(1.25, 0.8, 1);
  body.castShadow = true;
  duck.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.24, 5), duckHeadMat);
  neck.position.set(0, 0.16, 0.14);
  neck.rotation.x = 0.25;
  duck.add(neck);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), duckHeadMat);
  head.position.set(0, 0.29, 0.19);
  duck.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), duckBeakMat);
  beak.position.set(0, 0.28, 0.28);
  beak.rotation.x = Math.PI / 2;
  duck.add(beak);
  return duck;
}

for (let i = 0; i < 16; i++) {
  const zz = Z_START - hash(i, 26.1) * (Z_START - SCATTER_END);
  const duck = makeDuck();
  // each duck picks a bank to favour, so it always breaks the same way
  const side = hash(i, 27.2) > 0.5 ? 1 : -1;
  duck.userData.side = side;
  duck.userData.restU = side * (0.12 + hash(i, 27.9) * 0.62);
  duck.userData.u = duck.userData.restU;
  duck.userData.vLat = 0;
  duck.userData.bobPhase = hash(i, 30.5) * Math.PI * 2;
  duck.userData.z = zz;
  duck.userData.phase = hash(i, 28.3) * Math.PI * 2;
  duck.userData.rate = 0.25 + hash(i, 29.4) * 0.3;
  scene.add(duck);
  ducks.push(duck);
}

/* --------------------------------- fish --------------------------------- */
/* Mostly you see them as shapes sliding under the surface. Now and then one
   breaks clear of the water — but only a tenth of the time. */

const FISH_COUNT = 34;
const JUMP_CHANCE = 0.1;   // of every surfacing, this fraction become jumps

const fishBodyGeo = new THREE.IcosahedronGeometry(0.17, 0);
fishBodyGeo.scale(0.5, 0.72, 1.6);

const fishTailGeo = new THREE.ConeGeometry(0.13, 0.26, 3);
fishTailGeo.rotateX(-Math.PI / 2);   // flare backwards, along -Z
fishTailGeo.scale(0.22, 1, 1);

const fishDorsalGeo = new THREE.ConeGeometry(0.08, 0.15, 3);
fishDorsalGeo.scale(0.2, 1, 1);

const fishBodyMat = new THREE.MeshStandardMaterial({
  color: 0xb9c9cc,
  flatShading: true,
  metalness: 0.45,
  roughness: 0.32,
  emissive: 0x4a3a20,
  emissiveIntensity: 0.5,
});
const fishFinMat = new THREE.MeshStandardMaterial({
  color: 0x8a9aa0,
  flatShading: true,
  side: THREE.DoubleSide,
  roughness: 0.6,
});

function makeFish() {
  const fish = new THREE.Group();
  // pitch lives on a child so the jump arc doesn't fight the yaw
  const pitch = new THREE.Group();
  fish.add(pitch);

  pitch.add(new THREE.Mesh(fishBodyGeo, fishBodyMat));

  const tail = new THREE.Mesh(fishTailGeo, fishFinMat);
  tail.position.z = -0.3;
  pitch.add(tail);

  const dorsal = new THREE.Mesh(fishDorsalGeo, fishFinMat);
  dorsal.position.set(0, 0.13, 0.02);
  pitch.add(dorsal);

  fish.userData.pitch = pitch;
  fish.userData.tail = tail;
  return fish;
}

const fishes = [];
for (let i = 0; i < FISH_COUNT; i++) {
  const fish = makeFish();
  const d = fish.userData;
  d.z = Z_START + 10 - hash(i, 41.1) * (Z_START + 10 - SCATTER_END);
  d.restU = (hash(i, 42.2) - 0.5) * 1.55;
  d.phase = hash(i, 43.3) * Math.PI * 2;
  d.speed = 0.5 + hash(i, 44.4) * 0.8;
  d.depth = -0.19 - hash(i, 45.5) * 0.16;   // shallow enough to read through the water
  d.wander = 0.18 + hash(i, 46.6) * 0.22;
  d.state = 'swim';
  d.timer = 2 + hash(i, 47.7) * 8;
  d.jumpT = 0;
  d.jumpDur = 0;
  d.jumpHeight = 0;
  fish.scale.setScalar(0.85 + hash(i, 48.8) * 0.65);
  scene.add(fish);
  fishes.push(fish);
}

/* splash rings, spawned as a fish leaves and re-enters the water */

const splashMat = new THREE.MeshBasicMaterial({
  color: 0xfff6e2,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const splashGeo = new THREE.RingGeometry(0.1, 0.18, 14);
splashGeo.rotateX(-Math.PI / 2);

const splashes = [];
for (let i = 0; i < 12; i++) {
  const ring = new THREE.Mesh(splashGeo, splashMat.clone());
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);
  splashes.push({ mesh: ring, life: 0 });
}
let splashCursor = 0;

function spawnSplash(x, z) {
  const sp = splashes[splashCursor];
  splashCursor = (splashCursor + 1) % splashes.length;
  sp.mesh.position.set(x, 0.05, z);
  sp.mesh.scale.setScalar(0.5);
  sp.mesh.visible = true;
  sp.life = 1;
}

function updateFish(dt, t) {
  for (const fish of fishes) {
    const d = fish.userData;

    d.z -= dt * d.speed;
    if (d.z > trip.z + 55 || d.z < trip.z - 155) {
      d.z = trip.z - 95 - Math.random() * 45;
      d.state = 'swim';
    }

    // weaving path, with the heading taken from the analytic derivative so
    // there is no frame-to-frame noise in it
    const w = t * 0.55 + d.phase;
    const uBase = d.restU + Math.sin(w) * d.wander;
    // they swim shallow now, so they have to go round the hull
    const nearBoat = 1 - Math.min(1, Math.abs(d.z - trip.z) / 5.5);
    const side = d.restU >= 0 ? 1 : -1;
    const u = THREE.MathUtils.lerp(
      uBase,
      side * Math.max(Math.abs(uBase), 1.9 / RIVER_HALF),
      nearBoat
    );
    const latV = Math.cos(w) * d.wander * 0.55 * RIVER_HALF;

    let y = d.depth;
    let pitchX = 0;

    if (d.state === 'swim') {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.timer = 4 + Math.random() * 9;
        // keep clear of the hull, and only a tenth of these become jumps
        const clearOfBoat = Math.abs(d.z - trip.z) > 5 || Math.abs(u * RIVER_HALF) > 2.2;
        if (clearOfBoat && Math.random() < JUMP_CHANCE) {
          d.state = 'jump';
          d.jumpT = 0;
          d.jumpDur = 0.7 + Math.random() * 0.35;
          d.jumpHeight = 0.55 + Math.random() * 0.45;
          spawnSplash(riverCenterX(d.z) + u * RIVER_HALF, d.z);
        }
      }
    } else {
      d.jumpT += dt;
      const p = d.jumpT / d.jumpDur;
      if (p >= 1) {
        d.state = 'swim';
        spawnSplash(riverCenterX(d.z) + u * RIVER_HALF, d.z);
      } else {
        y = d.depth + Math.sin(p * Math.PI) * (d.jumpHeight - d.depth + 0.22);
        pitchX = -0.85 * Math.cos(p * Math.PI);   // nose up, then down
      }
    }

    fish.position.set(riverCenterX(d.z) + u * RIVER_HALF, y, d.z);
    fish.rotation.y = Math.atan2(latV, -d.speed);
    d.pitch.rotation.x = pitchX;
    // tail beats faster mid-jump
    d.tail.rotation.y = Math.sin(t * (d.state === 'jump' ? 16 : 9) + d.phase) * 0.55;
  }

  for (const sp of splashes) {
    if (sp.life <= 0) continue;
    sp.life -= dt * 1.6;
    if (sp.life <= 0) {
      sp.mesh.visible = false;
      continue;
    }
    sp.mesh.scale.setScalar(0.5 + (1 - sp.life) * 2.4);
    sp.mesh.material.opacity = sp.life * 0.5;
  }
}

/* -------------------------------- birds -------------------------------- */

const birdMat = new THREE.MeshBasicMaterial({ color: 0x3b3550, fog: false });
const birdWingGeo = new THREE.BoxGeometry(0.62, 0.035, 0.12);
const birds = [];

for (let i = 0; i < 9; i++) {
  const bird = new THREE.Group();
  const left = new THREE.Mesh(birdWingGeo, birdMat);
  left.position.x = -0.3;
  bird.add(left);
  const right = new THREE.Mesh(birdWingGeo, birdMat);
  right.position.x = 0.3;
  bird.add(right);

  bird.userData.wings = [left, right];
  bird.userData.phase = hash(i, 31) * Math.PI * 2;
  bird.userData.radius = 16 + hash(i, 32) * 26;
  bird.userData.height = 12 + hash(i, 33) * 12;
  bird.userData.speed = 0.06 + hash(i, 34) * 0.05;
  bird.userData.zBase = -40 - hash(i, 35) * 60;
  bird.scale.setScalar(0.7 + hash(i, 36) * 0.8);
  scene.add(bird);
  birds.push(bird);
}

/* ---------------------------- the kettuvallam ---------------------------- */
/* hull built from cross-sections along its length: the ends taper to nothing
   and sweep upward, which is what gives a kettuvallam its silhouette */

function buildHull(length, halfWidth, depth, upturn) {
  const RINGS = 28;
  const rings = [];

  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    const z = (t - 0.5) * length;
    const taper = Math.pow(Math.max(0, Math.sin(t * Math.PI)), 0.7);
    const hw = halfWidth * taper;
    const d = depth * Math.pow(taper, 0.55);
    // the gunwale sweeps up toward both ends — gently, or the deck that
    // follows it turns into a big flat ramp
    const sheer = upturn * Math.pow(1 - Math.sin(t * Math.PI), 1.7);

    rings.push([
      new THREE.Vector3(-hw, sheer, z),
      new THREE.Vector3(-hw * 0.84, sheer - d * 0.5, z),
      new THREE.Vector3(0, sheer - d, z),
      new THREE.Vector3(hw * 0.84, sheer - d * 0.5, z),
      new THREE.Vector3(hw, sheer, z),
    ]);
  }

  const hullVerts = [];
  const deckVerts = [];
  const railVerts = [];
  const quad = (target, a, b, c, d) => {
    target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    target.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  const lift = (v, dy) => new THREE.Vector3(v.x, v.y + dy, v.z);

  for (let r = 0; r < RINGS; r++) {
    const A = rings[r];
    const B = rings[r + 1];
    for (let s2 = 0; s2 < 4; s2++) quad(hullVerts, A[s2], B[s2], B[s2 + 1], A[s2 + 1]);
    // deck sits just under the gunwale so you can't see into the hull
    quad(deckVerts, lift(A[0], -0.06), lift(B[0], -0.06), lift(B[4], -0.06), lift(A[4], -0.06));
    // rail: a thin ribbon that follows the gunwale instead of a straight box
    for (const idx of [0, 4]) {
      quad(railVerts, A[idx], B[idx], lift(B[idx], 0.08), lift(A[idx], 0.08));
    }
  }

  const mk = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  return { hull: mk(hullVerts), deck: mk(deckVerts), rail: mk(railVerts) };
}

// the slender upswept beak at each end — the kettuvallam's signature
function makeBeak(mat) {
  const geo = new THREE.TorusGeometry(0.72, 0.05, 4, 16, Math.PI * 0.62);
  const beak = new THREE.Mesh(geo, mat);
  beak.scale.set(1, 1, 0.3);   // flatten it into a blade, not a tube
  beak.castShadow = true;
  return beak;
}

const CANOPY_R = 0.58;
const CANOPY_LEN = 3.0;

function makeBoat() {
  const boat = new THREE.Group();

  const { hull, deck, rail } = buildHull(6.8, 0.78, 0.66, 0.4);

  const hullMesh = new THREE.Mesh(
    hull,
    new THREE.MeshStandardMaterial({
      color: 0x2a211c,
      flatShading: true,
      roughness: 0.55,
      side: THREE.DoubleSide,
    })
  );
  hullMesh.castShadow = true;
  boat.add(hullMesh);

  const deckMesh = new THREE.Mesh(
    deck,
    new THREE.MeshStandardMaterial({ color: 0x8a6a42, flatShading: true, roughness: 0.9 })
  );
  deckMesh.receiveShadow = true;
  boat.add(deckMesh);

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xc9a05a,
    flatShading: true,
    metalness: 0.25,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const railMesh = new THREE.Mesh(rail, trimMat);
  boat.add(railMesh);

  // upswept beaks at bow and stern. The torus arc is built in the XY plane,
  // so it has to be turned a quarter turn to sweep along the hull, not across it.
  const beakMat = new THREE.MeshStandardMaterial({
    color: 0x3a2c22,
    flatShading: true,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  for (const end of [1, -1]) {
    const beak = makeBeak(beakMat);
    beak.rotation.y = end * Math.PI * 0.5;
    beak.position.set(0, 0.3, end * 4.02);
    boat.add(beak);
  }

  /* the arched palm-thatch canopy */
  const canopy = new THREE.Group();
  canopy.position.set(0, 0.04, -0.25);

  const thatchGeo = new THREE.CylinderGeometry(
    CANOPY_R, CANOPY_R, CANOPY_LEN, 14, 1, true, Math.PI / 2, Math.PI
  );
  thatchGeo.rotateX(Math.PI / 2);   // axis along the boat, dome facing up
  const thatch = new THREE.Mesh(
    thatchGeo,
    new THREE.MeshStandardMaterial({
      color: 0xb98d4e,
      flatShading: true,
      roughness: 1,
      side: THREE.DoubleSide,
    })
  );
  thatch.castShadow = true;
  canopy.add(thatch);

  // darker bamboo ribs strapping the thatch down
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x6d4f28, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(CANOPY_R + 0.02, 0.032, 4, 14, Math.PI),
      ribMat
    );
    rib.position.z = -CANOPY_LEN / 2 + i * (CANOPY_LEN / 4);
    canopy.add(rib);
  }

  // end curtains, so the canopy reads as enclosed
  const curtainMat = new THREE.MeshStandardMaterial({
    color: 0xa87f44,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  for (const z of [-CANOPY_LEN / 2, CANOPY_LEN / 2]) {
    const curtain = new THREE.Mesh(
      new THREE.CircleGeometry(CANOPY_R, 14, 0, Math.PI),
      curtainMat
    );
    curtain.position.z = z;
    canopy.add(curtain);
  }
  boat.add(canopy);

  // a warm lantern hanging at the prow — the one thing that isn't sunlight
  const lantern = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.13, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd98a })
  );
  lantern.add(glass);
  const lanternLight = new THREE.PointLight(0xffb45c, 2.4, 4.5, 2);
  lantern.add(lanternLight);
  lantern.position.set(0, 0.66, 2.35);
  boat.add(lantern);

  const hook = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x4a3a28, flatShading: true })
  );
  hook.position.set(0, 0.92, 2.35);
  boat.add(hook);

  /* the boatman, poling from the stern */
  const man = new THREE.Group();
  man.position.set(0, 0.02, -2.45);

  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, flatShading: true, roughness: 0.85 });
  const mundu = new THREE.MeshStandardMaterial({ color: 0xf4efe4, flatShading: true, roughness: 0.95 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.19), skin);
  torso.position.y = 0.72;
  torso.castShadow = true;
  man.add(torso);

  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.52, 7), mundu);
  wrap.position.y = 0.3;
  wrap.castShadow = true;
  man.add(wrap);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), skin);
  head.position.y = 1.05;
  head.castShadow = true;
  man.add(head);

  const hair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.135, 0), new THREE.MeshStandardMaterial({ color: 0x241a14, flatShading: true }));
  hair.position.y = 1.09;
  hair.scale.set(1, 0.72, 1);
  man.add(hair);

  const armGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.46, 5);
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.17, 0.9, 0);
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.y = -0.23;
    pivot.add(arm);
    man.add(pivot);
    arms.push(pivot);
  }

  // the pole: pivots from his hands, dips into the water behind the boat
  const polePivot = new THREE.Group();
  polePivot.position.set(0.42, 0.9, -0.05);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.042, 3.2, 5),
    new THREE.MeshStandardMaterial({ color: 0xa8935a, flatShading: true })
  );
  pole.position.y = -1.35;
  pole.castShadow = true;
  polePivot.add(pole);
  man.add(polePivot);

  boat.add(man);

  boat.userData.arms = arms;
  boat.userData.polePivot = polePivot;
  boat.userData.man = man;
  boat.userData.lantern = lanternLight;
  return boat;
}

const boat = makeBoat();
scene.add(boat);

/* ------------------------------ boat wake ------------------------------ */

const wakeMat = new THREE.MeshBasicMaterial({
  color: 0xfff0d0,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const wakeGeo = new THREE.RingGeometry(0.3, 0.45, 18);
wakeGeo.rotateX(-Math.PI / 2);

const wakes = [];
for (let i = 0; i < 14; i++) {
  const ring = new THREE.Mesh(wakeGeo, wakeMat.clone());
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);
  wakes.push({ mesh: ring, life: 0 });
}
let wakeCursor = 0;
let wakeTimer = 0;

function spawnWake(x, z) {
  const w = wakes[wakeCursor];
  wakeCursor = (wakeCursor + 1) % wakes.length;
  w.mesh.position.set(x, 0.05, z);
  w.mesh.scale.setScalar(0.6);
  w.mesh.visible = true;
  w.life = 1;
}

/* ---------------------------- project plaques ---------------------------- */
/* a post at the waterline with an angled board, plus a real DOM label so the
   text stays crisp and clickable */

const postMat = new THREE.MeshStandardMaterial({ color: 0x6a4d2e, flatShading: true, roughness: 0.95 });
const boardMat = new THREE.MeshStandardMaterial({ color: 0xd9b579, flatShading: true, roughness: 0.9 });

const signs = [];

PROJECTS.forEach((project, i) => {
  const z = SIGN_FIRST_Z - i * SIGN_SPACING;
  const side = i % 2 === 0 ? -1 : 1;
  const x = riverCenterX(z) + side * (RIVER_HALF + 0.75);
  const groundY = groundHeight(x, z);

  const group = new THREE.Group();
  group.position.set(x, groundY, z);
  // face the board across the water
  group.rotation.y = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 2.5, 6), postMat);
  post.position.y = 1.1;
  post.castShadow = true;
  group.add(post);

  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.08), boardMat);
  board.position.set(0, 2.1, 0.07);
  board.rotation.x = -0.18;
  board.castShadow = true;
  group.add(board);

  // little oil lamp on the post, because dusk
  const lamp = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshBasicMaterial({ color: 0xffca7a })
  );
  lamp.position.set(0.55, 1.6, 0.1);
  group.add(lamp);

  const wrapper = document.createElement('div');
  const isLink = Boolean(project.url);
  const el = document.createElement(isLink ? 'a' : 'span');
  el.className = 'sign-label bank' + (isLink ? '' : ' placeholder');
  if (isLink) {
    el.href = project.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  }
  el.style.pointerEvents = 'auto';

  const nameEl = document.createElement('span');
  nameEl.className = 'bank-name';
  nameEl.textContent = project.name;
  el.appendChild(nameEl);

  if (project.note) {
    const noteEl = document.createElement('span');
    noteEl.className = 'bank-note';
    noteEl.textContent = project.note;
    el.appendChild(noteEl);
  }
  wrapper.appendChild(el);

  const label = new CSS2DObject(wrapper);
  label.position.set(0, 3.0, 0);
  group.add(label);

  scene.add(group);
  signs.push({ group, wrapper, el, z, x, lamp, index: i });
});

/* ------------------------------ boat motion ------------------------------ */

const DRIFT_SPEED = 1.55;
const GLIDE_SPEED = 13;

const trip = {
  z: Z_START,
  drifting: true,
  glideTo: null,
};

// Everything that drifts falls behind over a trip. Redistribute it while the
// screen is faded out, otherwise the next run starts in empty water.
function reseedDrifters() {
  const anywhere = (from) => from - Math.random() * (from - SCATTER_END);
  for (const f of floaters) {
    f.userData.z = anywhere(Z_START + 12);
    f.userData.u = f.userData.restU;
  }
  for (const duck of ducks) {
    duck.userData.z = anywhere(Z_START + 8);
    duck.userData.u = duck.userData.restU;
    duck.userData.vLat = 0;
  }
  for (const fish of fishes) {
    fish.userData.z = anywhere(Z_START + 10);
    fish.userData.state = 'swim';
    fish.userData.timer = 2 + Math.random() * 8;
  }
}

function boatPathAt(z) {
  return new THREE.Vector3(riverCenterX(z), 0, z);
}

const fade = document.getElementById('wrap-fade');
let fadeAmount = 0;
let pendingWrap = false;

function updateBoat(dt, t) {
  if (trip.glideTo !== null) {
    const diff = trip.glideTo - trip.z;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), GLIDE_SPEED * dt);
    trip.z += step;
    if (Math.abs(diff) < 0.15) {
      trip.z = trip.glideTo;
      trip.glideTo = null;
    }
  } else if (trip.drifting) {
    trip.z -= DRIFT_SPEED * dt;
  }

  // loop the journey behind a short fade instead of snapping
  if (trip.z < Z_END && !pendingWrap) pendingWrap = true;

  if (pendingWrap) {
    fadeAmount = Math.min(1, fadeAmount + dt * 1.8);
    if (fadeAmount >= 1) {
      trip.z = Z_START;
      pendingWrap = false;
      reseedDrifters();
    }
  } else if (fadeAmount > 0) {
    fadeAmount = Math.max(0, fadeAmount - dt * 1.3);
  }
  if (fade) fade.style.opacity = String(fadeAmount);

  const here = boatPathAt(trip.z);
  const ahead = boatPathAt(trip.z - 2.5);
  const dir = ahead.clone().sub(here);

  const bobY = Math.sin(t * 1.1) * 0.045 + Math.sin(t * 1.9 + 1.2) * 0.025;
  boat.position.set(here.x, 0.3 + bobY, here.z);
  boat.rotation.y = Math.atan2(dir.x, dir.z);
  boat.rotation.z = Math.sin(t * 0.85) * 0.035;
  boat.rotation.x = Math.sin(t * 1.35 + 0.6) * 0.02;

  // poling: a slow push, then a recovery
  const stroke = (t * 0.55) % 1;
  const push = Math.sin(stroke * Math.PI * 2);
  boat.userData.polePivot.rotation.x = 0.5 + push * 0.42;
  boat.userData.polePivot.rotation.z = 0.2 + push * 0.07;
  for (const arm of boat.userData.arms) arm.rotation.x = -0.6 + push * 0.45;
  boat.userData.man.rotation.y = Math.sin(t * 0.55 * Math.PI * 2) * 0.12;
  boat.userData.lantern.intensity = 2.2 + Math.sin(t * 7.3) * 0.25;

  return here;
}

/* ---------------------------- plaque visibility ---------------------------- */
/* only show the plaques we are actually near — keeps the DOM quiet and lets
   them emerge out of the haze as the boat comes round */

function updateSigns(boatZ) {
  for (const sign of signs) {
    const dz = sign.z - boatZ;          // negative = already passed
    let opacity = 0;
    if (dz < 10 && dz > -22) {
      opacity = THREE.MathUtils.clamp((22 + dz) / 6, 0, 1) * THREE.MathUtils.clamp((10 - dz) / 8, 0, 1);
    }
    sign.wrapper.style.opacity = opacity.toFixed(3);
    sign.wrapper.style.display = opacity < 0.02 ? 'none' : '';

    const near = dz > -12 && dz < 6;
    sign.el.classList.toggle('active', near);
    sign.lamp.material.color.setHex(near ? 0xfff0bb : 0xffca7a);
  }
}

/* ------------------------------ navigation ------------------------------ */

const playBtn = document.getElementById('nav-play');
const prevBtn = document.getElementById('nav-prev');
const nextBtn = document.getElementById('nav-next');

function setDrifting(on) {
  trip.drifting = on;
  if (playBtn) {
    playBtn.textContent = on ? '❙❙' : '▶';
    playBtn.setAttribute('aria-label', on ? 'pause the drift' : 'resume the drift');
  }
}

function goToSign(step) {
  // where the boat should sit to be level with a plaque
  const stops = signs.map((s) => s.z + 1.5);
  let idx = 0;
  let best = Infinity;
  stops.forEach((z, i) => {
    const d = Math.abs(z - trip.z);
    if (d < best) {
      best = d;
      idx = i;
    }
  });
  // if we're already basically at that stop, move on to the neighbour
  if (best < 2.5 || Math.sign(stops[idx] - trip.z) !== Math.sign(-step)) idx += step;
  idx = THREE.MathUtils.clamp(idx, 0, stops.length - 1);
  trip.glideTo = stops[idx];
  hint.style.opacity = '0';
}

if (playBtn) playBtn.addEventListener('click', () => setDrifting(!trip.drifting));
if (prevBtn) prevBtn.addEventListener('click', () => goToSign(-1));
if (nextBtn) nextBtn.addEventListener('click', () => goToSign(1));

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToSign(1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToSign(-1);
  else if (e.key === ' ') {
    e.preventDefault();
    setDrifting(!trip.drifting);
  }
});

setDrifting(true);

/* ------------------------------- camera ------------------------------- */
/* the camera rides behind the boat. OrbitControls still owns the offset, so
   dragging works — we just translate target and camera by the same delta. */

const camTarget = new THREE.Vector3(riverCenterX(Z_START), CAM_LOOK_Y, Z_START);
const idealOffset = new THREE.Vector3();

function updateCamera(dt, boatPos, heading, t) {
  const desired = boatPos.clone();
  desired.y += CAM_LOOK_Y;

  const delta = desired.clone().sub(camTarget);
  camTarget.copy(desired);
  controls.target.add(delta);
  camera.position.add(delta);

  if (!userInteracted) {
    // gentle cinematic framing: trailing, a touch off to one side, breathing
    idealOffset.set(
      CAM_OFFSET.x + Math.sin(t * 0.13) * 1.4,
      CAM_OFFSET.y + Math.sin(t * 0.09) * 0.3,
      CAM_OFFSET.z
    );
    idealOffset.applyAxisAngle(UP, heading);
    const want = controls.target.clone().add(idealOffset);
    camera.position.lerp(want, Math.min(1, dt * 0.9));
  }
}

/* ------------------------------ animation ------------------------------ */

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

const sunWorld = new THREE.Vector3();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  const boatPos = updateBoat(dt, t);
  updateCamera(dt, boatPos, boat.rotation.y, t);
  updateWater(t, boatPos.x, boatPos.z);
  updateSigns(trip.z);

  // sky and sun sit at infinity: pin them to the camera
  sky.position.copy(camera.position);
  sunWorld.copy(camera.position).addScaledVector(SUN_DIR, 240);
  sunGroup.position.copy(sunWorld);
  sunGroup.lookAt(camera.position);
  skyMat.uniforms.sunDir.value.copy(SUN_DIR);

  // keep the shadow frustum around the boat
  sun.target.position.copy(boatPos);
  sun.position.copy(boatPos).addScaledVector(SUN_DIR, -26);
  sun.position.y = boatPos.y + 13;

  // palms in the evening breeze
  for (const palm of palms) {
    const sway = Math.sin(t * 0.55 + palm.userData.swayPhase) * 0.045;
    palm.userData.crown.rotation.z = palm.userData.crownRestZ + sway;
    palm.userData.crown.rotation.y = sway * 0.6;
  }

  for (const reed of reeds) {
    reed.rotation.z = Math.sin(t * 1.4 + reed.userData.phase) * 0.12;
  }

  // floating things bob and drift downstream, recycling at the far end
  for (const f of floaters) {
    const d = f.userData;
    d.z -= dt * 0.22;
    if (d.z > trip.z + 55 || d.z < trip.z - 155) {
      d.z = trip.z - 95 - Math.random() * 45;   // back into the haze ahead
      d.u = d.restU;
    }

    // the rafts don't flee, the bow wave just pushes them aside
    const shove = 1 - Math.min(1, Math.abs(d.z - trip.z) / 5);
    const clearU = Math.max(Math.abs(d.restU), 1.85 / RIVER_HALF);
    const targetU = THREE.MathUtils.lerp(d.restU, d.side * Math.min(0.96, clearU), shove);
    d.u = THREE.MathUtils.lerp(d.u, targetU, Math.min(1, dt * (0.5 + shove * 4)));

    const u = d.u + Math.sin(t * 0.25 + d.phase) * 0.04;
    f.position.set(
      riverCenterX(d.z) + u * RIVER_HALF,
      0.02 + Math.sin(t * 1.3 + d.phase) * 0.03,
      d.z
    );
    f.rotation.y = Math.sin(t * 0.18 + d.phase) * 0.5 + shove * d.side * 0.45;
  }

  for (const duck of ducks) {
    const d = duck.userData;
    // 0 when the boat is far off, 1 when it is right alongside
    const alarm = 1 - Math.min(1, Math.abs(d.z - trip.z) / DUCK_ALERT_Z);

    const fwd = d.rate + alarm * 0.95;   // a spurt while it gets out of the way
    d.z -= dt * fwd;
    if (d.z > trip.z + 55 || d.z < trip.z - 155) {
      d.z = trip.z - 95 - Math.random() * 45;
      d.u = d.restU;
      d.vLat = 0;
    }

    // hold a lane normally; swing wide enough to clear the hull when alarmed
    const clearU = Math.max(Math.abs(d.restU), BOAT_CLEAR / DUCK_LANE);
    const targetU = THREE.MathUtils.lerp(
      d.restU,
      d.side * Math.min(0.95, clearU + alarm * 0.18),
      alarm
    );
    // bolts away quickly, wanders back at its leisure
    const pull = 0.9 + alarm * 5.5;
    d.u = THREE.MathUtils.lerp(d.u, targetU, Math.min(1, dt * pull));

    // Accumulate the paddling phase. Writing sin(t * freq) with a freq that
    // changes each frame jumps the argument by tens of radians and the duck
    // buzzes; integrating the frequency keeps it continuous.
    d.bobPhase += dt * (2.2 + alarm * 4);

    const u = d.u + Math.sin(t * 0.4 + d.phase) * 0.06 * (1 - alarm);
    duck.position.set(
      riverCenterX(d.z) + u * DUCK_LANE,
      0.09 + Math.sin(d.bobPhase) * 0.03,
      d.z
    );

    // Lateral speed taken from how far it still has to go, not from
    // differencing successive positions — a numerical derivative of a lerp
    // spikes whenever the frame time wobbles, which showed up as rocking.
    const latV = (targetU - d.u) * DUCK_LANE * pull;
    d.vLat += (latV - d.vLat) * Math.min(1, dt * 5);
    duck.rotation.y = Math.atan2(d.vLat, -fwd);
    const roll = Math.abs(d.vLat) < 0.05 ? 0 : d.vLat;
    duck.rotation.z = -THREE.MathUtils.clamp(roll * 0.1, -0.28, 0.28);
  }

  updateFish(dt, t);

  for (const bird of birds) {
    const a = t * bird.userData.speed + bird.userData.phase;
    bird.position.set(
      Math.cos(a) * bird.userData.radius,
      bird.userData.height + Math.sin(a * 2.1) * 1.4,
      bird.userData.zBase + Math.sin(a) * bird.userData.radius * 0.5
    );
    bird.rotation.y = -a + Math.PI / 2;
    const flap = Math.sin(t * 7 + bird.userData.phase) * 0.5;
    bird.userData.wings[0].rotation.z = flap;
    bird.userData.wings[1].rotation.z = -flap;
  }

  // wake rings off the prow
  wakeTimer -= dt;
  if (wakeTimer <= 0 && (trip.drifting || trip.glideTo !== null)) {
    wakeTimer = 0.42;
    const prow = boatPathAt(trip.z - 3.2);
    spawnWake(prow.x, prow.z);
  }
  for (const w of wakes) {
    if (w.life <= 0) continue;
    w.life -= dt * 0.45;
    if (w.life <= 0) {
      w.mesh.visible = false;
      continue;
    }
    w.mesh.scale.setScalar(0.6 + (1 - w.life) * 2.6);
    w.mesh.material.opacity = w.life * 0.26;
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateWater(0, riverCenterX(Z_START), Z_START);
renderer.render(scene, camera);
labelRenderer.render(scene, camera);
document.getElementById('loading').classList.add('hidden');
animate();

if (!userInteracted) {
  setTimeout(() => {
    if (!userInteracted) hint.style.opacity = '1';
  }, 500);
}
