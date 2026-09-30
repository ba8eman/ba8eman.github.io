import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ------------------------------------------------------------------ */
/*  Whiskers' Meadow — a small hand-made low-poly diorama              */
/*  A white cat wanders a bumpy green meadow scattered with flowers.  */
/* ------------------------------------------------------------------ */

const GROUND_RADIUS = 13;
const clock = new THREE.Clock();

// deterministic-ish pseudo random hash, used to mottle the terrain color
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// gentle rolling hills — shared by the ground mesh and anything that
// needs to sit flush on top of it (flowers, bushes, the cat's feet)
function terrainHeight(x, z) {
  return (
    Math.sin(x * 0.28) * 0.35 +
    Math.cos(z * 0.33) * 0.35 +
    Math.sin((x + z) * 0.15) * 0.25
  );
}

/* ------------------------------- scene ------------------------------- */

const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xbdeaff);
scene.background = skyColor;
scene.fog = new THREE.Fog(skyColor.getHex(), 22, 42);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(15, 12, 15);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 8;
controls.maxDistance = 30;
controls.minPolarAngle = Math.PI * 0.15;
controls.maxPolarAngle = Math.PI * 0.47;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

let userInteracted = false;
const hint = document.getElementById('hint');
controls.addEventListener('start', () => {
  userInteracted = true;
  controls.autoRotate = false;
  hint.style.opacity = '0';
});

// a second, HTML-based renderer for the floating sky links — real <a> tags
// so they stay crisp, accessible, and clickable, positioned in 3D space
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

/* ------------------------------- lights ------------------------------- */

const hemi = new THREE.HemisphereLight(0xbdeaff, 0x4d7a2f, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d0, 1.35);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0025;
sun.shadow.normalBias = 0.02; // stops speckled shadow acne, worst on mobile GPUs
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
fillLight.position.set(-10, 8, -8);
scene.add(fillLight);

/* ------------------------------- ground ------------------------------- */

function buildGround() {
  const segments = 64;
  const geometry = new THREE.CircleGeometry(GROUND_RADIUS, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const baseA = new THREE.Color(0x6bbf4a); // bright meadow green
  const baseB = new THREE.Color(0x3f8f3a); // deeper mossy green
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = terrainHeight(x, z);
    pos.setY(i, y);

    const mottle = hash(x * 1.7, z * 1.7);
    tmp.copy(baseA).lerp(baseB, (y + 0.6) / 1.2);
    tmp.lerp(new THREE.Color(0x8fd45a), mottle * 0.25);
    tmp.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

const ground = buildGround();
scene.add(ground);

// the true height of the rendered ground mesh at (x, z) — the mesh is made of
// flat faces, so this can differ from terrainHeight() between its vertices
const groundRay = new THREE.Raycaster();
const rayOrigin = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
function groundHeightAt(x, z) {
  rayOrigin.set(x, 10, z);
  groundRay.set(rayOrigin, DOWN);
  const hit = groundRay.intersectObject(ground, false)[0];
  return hit ? hit.point.y : terrainHeight(x, z);
}

/* ------------------------------- flowers ------------------------------- */

function randomPointOnGround(minR = 1.5, maxR = GROUND_RADIUS - 1) {
  const angle = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * (maxR - minR);
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  return { x, z, y: groundHeightAt(x, z) };
}

// every bloom and center material, so night can switch their glow on
const glowMaterials = [];

function makeFlower(petalColor) {
  const group = new THREE.Group();

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, 0.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x4c8a3a, flatShading: true })
  );
  stem.position.y = 0.2;
  stem.castShadow = true;
  group.add(stem);

  const bloomMat = new THREE.MeshStandardMaterial({
    color: petalColor,
    emissive: petalColor,
    emissiveIntensity: 0,
    flatShading: true,
  });
  glowMaterials.push(bloomMat);
  const petalGeo = new THREE.IcosahedronGeometry(0.09, 0);
  const petalOffsets = [
    [0, 0, 0.09],
    [0, 0, -0.09],
    [0.09, 0, 0],
    [-0.09, 0, 0],
  ];
  for (const [ox, oy, oz] of petalOffsets) {
    const petal = new THREE.Mesh(petalGeo, bloomMat);
    petal.position.set(ox, 0.42, oz);
    petal.scale.setScalar(0.85);
    petal.castShadow = true;
    group.add(petal);
  }

  const centerMat = new THREE.MeshStandardMaterial({
    color: 0xfff2a8,
    emissive: 0xfff2a8,
    emissiveIntensity: 0,
    flatShading: true,
  });
  glowMaterials.push(centerMat);
  const center = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), centerMat);
  center.position.y = 0.42;
  group.add(center);

  return group;
}

function scatterFlowers(count) {
  const colors = [0xff8fc7, 0xff6fb0, 0x7fb8ff, 0x5aa1f2];
  for (let i = 0; i < count; i++) {
    const { x, y, z } = randomPointOnGround(1.2);
    const flower = makeFlower(colors[Math.floor(Math.random() * colors.length)]);
    flower.position.set(x, y, z);
    flower.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.6;
    flower.scale.setScalar(s);
    scene.add(flower);
  }
}

scatterFlowers(55);

/* -------------------------------- bushes -------------------------------- */

function makeBush() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d8b3f, flatShading: true });
  const blobCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < blobCount; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), mat);
    blob.position.set(
      (Math.random() - 0.5) * 0.35,
      0.22 + (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.35
    );
    blob.scale.setScalar(0.8 + Math.random() * 0.4);
    blob.castShadow = true;
    blob.receiveShadow = true;
    group.add(blob);
  }
  return group;
}

function makeTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, flatShading: true })
  );
  trunk.position.y = 0.45;
  trunk.castShadow = true;
  group.add(trunk);

  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x4fa441, flatShading: true });
  const tiers = [
    { y: 1.05, r: 0.55 },
    { y: 1.45, r: 0.42 },
    { y: 1.78, r: 0.3 },
  ];
  for (const t of tiers) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(t.r, 0), canopyMat);
    c.position.y = t.y;
    c.castShadow = true;
    group.add(c);
  }
  return group;
}

for (let i = 0; i < 10; i++) {
  const { x, y, z } = randomPointOnGround(3, GROUND_RADIUS - 0.8);
  const bush = makeBush();
  bush.position.set(x, y, z);
  bush.rotation.y = Math.random() * Math.PI * 2;
  scene.add(bush);
}

for (let i = 0; i < 6; i++) {
  const { x, y, z } = randomPointOnGround(GROUND_RADIUS - 3, GROUND_RADIUS - 0.5);
  const tree = makeTree();
  tree.position.set(x, y, z);
  tree.scale.setScalar(0.9 + Math.random() * 0.4);
  scene.add(tree);
}

/* -------------------------------- clouds -------------------------------- */

// clouds pick up a faint moonlit sheen at night instead of going rock-dark
const cloudMaterials = [];
function makeCloudMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: 0x8a96c8,
    emissiveIntensity: 0,
    flatShading: true,
  });
  cloudMaterials.push(mat);
  return mat;
}

function makeCloud() {
  const group = new THREE.Group();
  const mat = makeCloudMaterial(0xffffff);
  const puffs = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < puffs; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat);
    puff.position.set(i * 0.7 - puffs * 0.35, Math.random() * 0.2, (Math.random() - 0.5) * 0.4);
    puff.scale.set(1, 0.7, 1);
    group.add(puff);
  }
  return group;
}

const clouds = [];
for (let i = 0; i < 6; i++) {
  const cloud = makeCloud();
  cloud.position.set((Math.random() - 0.5) * 40, 9 + Math.random() * 4, (Math.random() - 0.5) * 40);
  cloud.scale.setScalar(0.8 + Math.random() * 0.9);
  scene.add(cloud);
  clouds.push({ mesh: cloud, speed: 0.15 + Math.random() * 0.2, offset: Math.random() * 100 });
}

/* ------------------------------ sky signs ------------------------------- */
/* floating nav links — a little puff cloud carrying a real, clickable label */

function makeSkySign({ text, href, placeholder = false, sameTab = false, position, bobPhase = 0 }) {
  const group = new THREE.Group();
  group.position.copy(position);

  const puffMat = makeCloudMaterial(0xfffdf3);
  const puffGeo = new THREE.IcosahedronGeometry(0.34, 0);
  const puffLayout = [
    [0, 0, 0],
    [0.4, -0.05, 0.05],
    [-0.4, -0.05, -0.05],
    [0.12, 0.18, -0.15],
  ];
  for (const [x, y, z] of puffLayout) {
    const puff = new THREE.Mesh(puffGeo, puffMat);
    puff.position.set(x, y, z);
    puff.scale.set(1, 0.75, 1);
    puff.castShadow = true;
    group.add(puff);
  }

  // CSS2DRenderer drives `wrapper`'s inline transform every frame (for 3D
  // positioning), so hover/scale effects live on the inner `el` instead —
  // otherwise the per-frame inline style would stomp any CSS transition.
  const wrapper = document.createElement('div');
  const el = document.createElement(placeholder ? 'span' : 'a');
  el.className = 'sign-label' + (placeholder ? ' placeholder' : '');
  el.textContent = text;
  if (!placeholder) {
    el.href = href;
    if (!sameTab) {
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  }
  el.style.pointerEvents = 'auto';
  wrapper.appendChild(el);

  const label = new CSS2DObject(wrapper);
  label.position.set(0, -0.55, 0);
  group.add(label);

  group.userData.bobPhase = bobPhase;
  group.userData.baseY = position.y;
  scene.add(group);
  return group;
}

const skySigns = [
  makeSkySign({
    text: 'LinkedIn',
    href: 'https://www.linkedin.com/in/johnson-b-7b9351191/',
    position: new THREE.Vector3(-5.5, 6.8, -3.5),
    bobPhase: 0,
  }),
  makeSkySign({
    text: 'Blogs · soon',
    placeholder: true,
    position: new THREE.Vector3(5.5, 6.3, -2.5),
    bobPhase: Math.PI,
  }),
  // hidden for now — recreational.html is still there, uncomment to link it again
  // makeSkySign({
  //   text: 'Recreational',
  //   href: 'recreational.html',
  //   sameTab: true,
  //   position: new THREE.Vector3(0.4, 7.4, 4.6),
  //   bobPhase: Math.PI * 0.5,
  // }),
];

/* --------------------------------- cat --------------------------------- */

function makeCat() {
  const cat = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0, // turned up at night
    flatShading: true,
    roughness: 0.8,
  });
  const pink = new THREE.MeshStandardMaterial({ color: 0xffb6c9, flatShading: true });
  const black = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.85), white);
  body.position.y = 0.42;
  body.castShadow = true;
  cat.add(body);

  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.5);
  cat.add(head);

  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.38), white);
  headBox.castShadow = true;
  head.add(headBox);

  const earGeo = new THREE.ConeGeometry(0.13, 0.2, 4);
  const earL = new THREE.Mesh(earGeo, white);
  earL.position.set(-0.13, 0.24, 0.03);
  earL.rotation.y = Math.PI / 4;
  head.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.13;
  head.add(earR);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.07, 4), pink);
  nose.position.set(0, -0.02, 0.2);
  nose.rotation.x = Math.PI / 2;
  head.add(nose);

  const eyeGeo = new THREE.IcosahedronGeometry(0.035, 0);
  const eyeL = new THREE.Mesh(eyeGeo, black);
  eyeL.position.set(-0.11, 0.03, 0.19);
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.11;
  head.add(eyeR);

  const legGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
  const legPositions = [
    [-0.17, 0.16, 0.28],
    [0.17, 0.16, 0.28],
    [-0.17, 0.16, -0.28],
    [0.17, 0.16, -0.28],
  ];
  // each leg swings from a hip pivot, so a moving paw lifts off the ground
  // instead of dipping into it
  const legs = legPositions.map(([x, y, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x, y * 2, z);
    const leg = new THREE.Mesh(legGeo, white);
    leg.position.y = -y;
    leg.castShadow = true;
    hip.add(leg);
    cat.add(hip);
    return hip;
  });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.55, -0.42);
  cat.add(tailPivot);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.55, 5), white);
  tail.position.set(0, 0.18, -0.1);
  tail.rotation.x = -0.6;
  tail.castShadow = true;
  tailPivot.add(tail);

  cat.userData.legs = legs;
  cat.userData.tailPivot = tailPivot;
  cat.userData.head = head;
  cat.userData.whiteMat = white;

  cat.scale.setScalar(1.1);
  return cat;
}

const cat = makeCat();
cat.rotation.order = 'YXZ'; // turn first, then tilt to the slope
scene.add(cat);

// paw spots in the cat's own space (legs, times the cat's 1.1 scale)
const PAW_X = 0.17 * 1.1;
const PAW_Z = 0.28 * 1.1;

// --- simple wander AI -----------------------------------------------
const catState = {
  position: new THREE.Vector3(0, 0, 0),
  heading: 0,
  target: null,
  mode: 'idle', // 'idle' | 'walk'
  timer: 1,
  walkPhase: 0,
  speed: 1.4,
};

function pickNewTarget() {
  const { x, z } = randomPointOnGround(0.5, GROUND_RADIUS - 2);
  catState.target = new THREE.Vector3(x, 0, z);
}

function angleLerp(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function updateCat(dt) {
  if (catState.mode === 'idle') {
    catState.timer -= dt;
    if (catState.timer <= 0) {
      pickNewTarget();
      catState.mode = 'walk';
    }
  } else if (catState.mode === 'walk' && catState.target) {
    const toTarget = new THREE.Vector3().subVectors(catState.target, catState.position);
    const dist = toTarget.length();

    if (dist < 0.15) {
      catState.mode = 'idle';
      catState.timer = 1 + Math.random() * 2.5;
      catState.walkPhase = 0;
    } else {
      toTarget.normalize();
      const step = Math.min(dist, catState.speed * dt);
      catState.position.addScaledVector(toTarget, step);
      const desiredHeading = Math.atan2(toTarget.x, toTarget.z);
      catState.heading = angleLerp(catState.heading, desiredHeading, Math.min(1, dt * 6));
      catState.walkPhase += dt * 9;
    }
  }

  // stand on the actual ground: sample under each paw, sit at their average
  // height and tilt the body to match the slope
  const { x: px, z: pz } = catState.position;
  const sin = Math.sin(catState.heading);
  const cos = Math.cos(catState.heading);
  const pawHeight = (lx, lz) =>
    groundHeightAt(px + lx * cos + lz * sin, pz - lx * sin + lz * cos);
  const frontLeft = pawHeight(-PAW_X, PAW_Z);
  const frontRight = pawHeight(PAW_X, PAW_Z);
  const backLeft = pawHeight(-PAW_X, -PAW_Z);
  const backRight = pawHeight(PAW_X, -PAW_Z);

  const pitch = Math.atan2((backLeft + backRight) - (frontLeft + frontRight), 4 * PAW_Z);
  const roll = Math.atan2((frontRight + backRight) - (frontLeft + backLeft), 4 * PAW_X);
  cat.position.set(px, (frontLeft + frontRight + backLeft + backRight) / 4, pz);
  cat.rotation.set(pitch, catState.heading, roll);

  const legs = cat.userData.legs;
  if (catState.mode === 'walk') {
    const swing = Math.sin(catState.walkPhase) * 0.5;
    legs[0].rotation.x = swing; // front-left
    legs[3].rotation.x = swing; // back-right
    legs[1].rotation.x = -swing; // front-right
    legs[2].rotation.x = -swing; // back-left
  } else {
    for (const leg of legs) leg.rotation.x *= 0.85;
  }

  const t = clock.elapsedTime;
  cat.userData.tailPivot.rotation.y = Math.sin(t * (catState.mode === 'walk' ? 6 : 2)) * 0.35;
  cat.userData.head.rotation.y = Math.sin(t * 0.7) * 0.12;
}

catState.timer = 0.5;

/* ------------------------------ fireflies ------------------------------ */

function makeGlowTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

const FIREFLY_COUNT = 45;
const fireflySeeds = [];
const fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
const fireflyColors = new Float32Array(FIREFLY_COUNT * 3);
for (let i = 0; i < FIREFLY_COUNT; i++) {
  const { x, y, z } = randomPointOnGround(1, GROUND_RADIUS - 1);
  fireflySeeds.push({
    x, z,
    y: y + 0.4 + Math.random() * 1.8,
    phase: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.4,
  });
}

const fireflyGeo = new THREE.BufferGeometry();
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
fireflyGeo.setAttribute('color', new THREE.BufferAttribute(fireflyColors, 3));

const fireflies = new THREE.Points(
  fireflyGeo,
  new THREE.PointsMaterial({
    color: 0xdfff7a,
    size: 0.55,
    map: makeGlowTexture(),
    vertexColors: true, // per-fly brightness, so each one blinks on its own
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
fireflies.visible = false;
scene.add(fireflies);

function updateFireflies(t) {
  if (!fireflies.visible) return;
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const s = fireflySeeds[i];
    const a = t * s.speed + s.phase;
    fireflyPositions[i * 3] = s.x + Math.sin(a) * 0.7;
    fireflyPositions[i * 3 + 1] = s.y + Math.sin(a * 1.7) * 0.3;
    fireflyPositions[i * 3 + 2] = s.z + Math.cos(a * 0.8) * 0.7;
    const blink = Math.max(0, Math.sin(t * 1.4 + s.phase * 3));
    fireflyColors[i * 3] = fireflyColors[i * 3 + 1] = fireflyColors[i * 3 + 2] = 0.15 + blink * 0.85;
  }
  fireflyGeo.attributes.position.needsUpdate = true;
  fireflyGeo.attributes.color.needsUpdate = true;
}

/* ------------------------------ night sky ------------------------------ */
/*  Twinkling stars on a dome, and now and then a comet streaking across.   */

const SKY_RADIUS = 60; // stays inside the camera's far plane at max zoom-out

const STAR_COUNT = 500;
const starPositions = new Float32Array(STAR_COUNT * 3);
const starColors = new Float32Array(STAR_COUNT * 3);
const starTwinkle = [];
for (let i = 0; i < STAR_COUNT; i++) {
  // the camera looks down on the meadow, so the "sky" it sees is mostly the
  // backdrop around the ground; spread stars below the horizon too — the
  // ground hides the ones behind it
  const theta = Math.random() * Math.PI * 2;
  const y = -0.6 + Math.random() * 1.6;
  const r = Math.sqrt(1 - y * y);
  starPositions[i * 3] = Math.cos(theta) * r * SKY_RADIUS;
  starPositions[i * 3 + 1] = y * SKY_RADIUS;
  starPositions[i * 3 + 2] = Math.sin(theta) * r * SKY_RADIUS;
  starTwinkle.push({
    base: 0.45 + Math.random() * 0.55,
    speed: 0.8 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
  });
}

const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({
    color: 0xeef2ff,
    size: 3.2,
    sizeAttenuation: false, // pixel-sized, however far away
    map: makeGlowTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
stars.visible = false;
scene.add(stars);

function updateStars(t) {
  if (!stars.visible) return;
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = starTwinkle[i];
    const b = s.base * (0.75 + 0.25 * Math.sin(t * s.speed + s.phase));
    starColors[i * 3] = starColors[i * 3 + 1] = starColors[i * 3 + 2] = b;
  }
  starGeo.attributes.color.needsUpdate = true;
}

// a comet is a bright head trailed by a line of fading dots along its path.
// It lives in the camera's own space, so it always crosses the visible sky
// above the meadow, however the view is turned.
const COMET_DEPTH = 80; // in front of the camera, behind everything else
const COMET_CHANCE = 0.1;         // chance a visit gets a comet at all
const COMET_SECONDS = 2.8;        // time to cross the sky
const COMET_TAIL = 70;
const COMET_TAIL_SPACING = 0.14;

const cometPositions = new Float32Array(COMET_TAIL * 3);
const cometColors = new Float32Array(COMET_TAIL * 3);
const cometGeo = new THREE.BufferGeometry();
cometGeo.setAttribute('position', new THREE.BufferAttribute(cometPositions, 3));
cometGeo.setAttribute('color', new THREE.BufferAttribute(cometColors, 3));

const cometTail = new THREE.Points(
  cometGeo,
  new THREE.PointsMaterial({
    color: 0xd6e4ff,
    size: 4,
    sizeAttenuation: false,
    map: makeGlowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
const cometHead = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
cometHead.scale.setScalar(1.6);

const comet = new THREE.Group();
comet.add(cometTail, cometHead);
comet.visible = false;
camera.add(comet);
scene.add(camera); // so its children render

const cometState = { age: 0, start: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0 };
// rolled once per visit; a lucky visit sees one comet after a few seconds
// of night (whether it starts at night or is switched to it later)
let cometPending = Math.random() < COMET_CHANCE;
let cometWait = 3 + Math.random() * 7;

function launchComet() {
  // half the visible height and width at the comet's depth
  const halfH = COMET_DEPTH * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfW = halfH * camera.aspect;
  // enter from one side, in the upper part of the view, drifting downward
  const side = Math.random() < 0.5 ? 1 : -1;
  cometState.start.set(-side * halfW * 1.05, halfH * (0.5 + Math.random() * 0.4), -COMET_DEPTH);
  cometState.dir.set(side, -(0.15 + Math.random() * 0.2), 0).normalize();
  cometState.speed = halfW * (0.55 + Math.random() * 0.25); // crosses in ~3s at any aspect
  cometState.age = 0;
  comet.visible = true;
}

function updateComet(dt, glow) {
  if (!comet.visible) {
    if (!cometPending || glow < 0.5) return; // comets only at night
    cometWait -= dt;
    if (cometWait <= 0) {
      cometPending = false;
      launchComet();
    }
    return;
  }

  cometState.age += dt;
  const life = cometState.age / COMET_SECONDS;
  if (life >= 1) {
    comet.visible = false;
    return;
  }

  // fade in, then out, over the crossing
  const fade = Math.min(1, life * 5, (1 - life) * 4) * glow;
  const travelled = cometState.age * cometState.speed;
  cometHead.position.copy(cometState.start).addScaledVector(cometState.dir, travelled);
  cometHead.material.opacity = fade;

  for (let i = 0; i < COMET_TAIL; i++) {
    const back = Math.min(travelled, i * COMET_TAIL_SPACING);
    const p = cometHead.position;
    cometPositions[i * 3] = p.x - cometState.dir.x * back;
    cometPositions[i * 3 + 1] = p.y - cometState.dir.y * back;
    cometPositions[i * 3 + 2] = p.z - cometState.dir.z * back;
    const b = fade * (1 - i / COMET_TAIL) ** 1.6;
    cometColors[i * 3] = cometColors[i * 3 + 1] = cometColors[i * 3 + 2] = b;
  }
  cometGeo.attributes.position.needsUpdate = true;
  cometGeo.attributes.color.needsUpdate = true;
}

/* ----------------------------- time of day ----------------------------- */
/*  By default the sky follows the visitor's local clock. Picking day or   */
/*  night in the top-right capsule overrides that for the rest of the      */
/*  visit; ?sky=day|night in the URL does the same on load. Changes fade.  */

const SKY_PRESETS = {
  day: {
    sky: 0xbdeaff, hemiSky: 0xbdeaff, hemiGround: 0x4d7a2f, hemiIntensity: 0.9,
    sun: 0xfff2d0, sunIntensity: 1.35, sunPos: [8, 14, 6], fillIntensity: 0.25,
    exposure: 1.15, glow: 0,
  },
  // a soft blue moonlit night: the "sun" becomes a cool moon
  night: {
    sky: 0x26386b, hemiSky: 0x7088d0, hemiGround: 0x2a4050, hemiIntensity: 0.8,
    sun: 0xc4d4ff, sunIntensity: 0.65, sunPos: [-6, 14, -8], fillIntensity: 0.15,
    exposure: 1.1, glow: 1,
  },
};

// the cat's night glow: a soft white halo plus a small light that
// brightens the grass around it as it wanders
const catHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // skip the depth test: the halo is a flat card that cuts through the
    // grass, and on phones (lower depth precision) that intersection shows
    // up as speckled "dirt" across the glow
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
);
catHalo.renderOrder = 1; // after the scene, so it simply adds light on top
catHalo.position.y = 0.5;
catHalo.scale.setScalar(2.2);
catHalo.visible = false;
cat.add(catHalo);

const catLight = new THREE.PointLight(0xffffff, 0, 3.5, 2);
catLight.position.y = 0.7;
cat.add(catLight);

function clockSkyPhase() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}

function toSkyValues(p) {
  return {
    sky: new THREE.Color(p.sky),
    hemiSky: new THREE.Color(p.hemiSky),
    hemiGround: new THREE.Color(p.hemiGround),
    sun: new THREE.Color(p.sun),
    sunPos: new THREE.Vector3(...p.sunPos),
    hemiIntensity: p.hemiIntensity,
    sunIntensity: p.sunIntensity,
    fillIntensity: p.fillIntensity,
    exposure: p.exposure,
    glow: p.glow,
  };
}

function lerpSkyValues(a, b, t) {
  const out = {};
  for (const key in a) {
    out[key] = typeof a[key] === 'number'
      ? a[key] + (b[key] - a[key]) * t
      : a[key].clone().lerp(b[key], t);
  }
  return out;
}

function setSkyValues(v) {
  skyColor.copy(v.sky); // shared with scene.background
  scene.fog.color.copy(v.sky);
  hemi.color.copy(v.hemiSky);
  hemi.groundColor.copy(v.hemiGround);
  hemi.intensity = v.hemiIntensity;
  sun.color.copy(v.sun);
  sun.intensity = v.sunIntensity;
  sun.position.copy(v.sunPos);
  fillLight.intensity = v.fillIntensity;
  renderer.toneMappingExposure = v.exposure;
  // html too, so overscroll and any gap below the canvas match the sky
  document.documentElement.style.background = document.body.style.background = `#${v.sky.getHexString()}`;

  for (const m of glowMaterials) m.emissiveIntensity = v.glow * 0.9;
  for (const m of cloudMaterials) m.emissiveIntensity = v.glow * 0.35;
  cat.userData.whiteMat.emissiveIntensity = v.glow * 0.55;
  catHalo.material.opacity = v.glow * 0.55;
  catHalo.visible = v.glow > 0.01;
  catLight.intensity = v.glow * 0.7;
  fireflies.material.opacity = v.glow;
  fireflies.visible = v.glow > 0.01;
  stars.material.opacity = v.glow;
  stars.visible = v.glow > 0.01;
}

const SKY_FADE_SECONDS = 1.2;
let skyPhase = null;
let skyCurrent = null;
let skyFrom = null;
let skyTo = null;
let skyBlend = 1;

function showSky(phase, instant = false) {
  if (phase === skyPhase) return;
  skyPhase = phase;
  document.body.dataset.sky = phase; // lets the CSS recolor the UI
  syncSkyButtons();
  skyTo = toSkyValues(SKY_PRESETS[phase]);
  if (instant || !skyCurrent) {
    skyCurrent = skyTo;
    skyBlend = 1;
    setSkyValues(skyCurrent);
  } else {
    skyFrom = skyCurrent;
    skyBlend = 0;
  }
}

function updateSky(dt) {
  if (skyBlend >= 1) return;
  skyBlend = Math.min(1, skyBlend + dt / SKY_FADE_SECONDS);
  const eased = skyBlend * skyBlend * (3 - 2 * skyBlend); // smoothstep
  skyCurrent = lerpSkyValues(skyFrom, skyTo, eased);
  setSkyValues(skyCurrent);
}

// follow the clock until the visitor picks a look themselves
const urlSky = new URLSearchParams(window.location.search).get('sky');
let skyPickedByHand = Boolean(SKY_PRESETS[urlSky]);

// the pressed button always shows what's on screen, picked or not
const skyButtons = document.querySelectorAll('#sky-toggle button');
function syncSkyButtons() {
  for (const btn of skyButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.sky === skyPhase));
  }
}

for (const btn of skyButtons) {
  btn.addEventListener('click', () => {
    skyPickedByHand = true;
    showSky(btn.dataset.sky);
  });
}

showSky(skyPickedByHand ? urlSky : clockSkyPhase(), true);

// check once a minute so a long-open tab drifts from day into night
setInterval(() => {
  if (!skyPickedByHand) showSky(clockSkyPhase());
}, 60_000);

/* ------------------------------- animation ------------------------------- */

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);

  updateCat(dt);
  updateSky(dt);
  updateFireflies(clock.elapsedTime);
  updateStars(clock.elapsedTime);
  updateComet(dt, skyCurrent.glow);

  for (const c of clouds) {
    c.mesh.position.x += Math.sin(clock.elapsedTime * 0.05 + c.offset) * dt * c.speed;
    c.mesh.position.z += Math.cos(clock.elapsedTime * 0.04 + c.offset) * dt * c.speed;
  }

  for (const sign of skySigns) {
    sign.position.y = sign.userData.baseY + Math.sin(clock.elapsedTime * 0.9 + sign.userData.bobPhase) * 0.18;
    sign.rotation.y = Math.sin(clock.elapsedTime * 0.3 + sign.userData.bobPhase) * 0.15;
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

renderer.render(scene, camera);
labelRenderer.render(scene, camera);
document.getElementById('loading').classList.add('hidden');
animate();

if (!userInteracted) {
  setTimeout(() => {
    if (!userInteracted) hint.style.opacity = '1';
  }, 400);
}
