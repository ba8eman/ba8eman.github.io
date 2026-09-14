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

scene.add(buildGround());

/* ------------------------------- flowers ------------------------------- */

function randomPointOnGround(minR = 1.5, maxR = GROUND_RADIUS - 1) {
  const angle = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * (maxR - minR);
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  return { x, z, y: terrainHeight(x, z) };
}

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
    flatShading: true,
  });
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

  const center = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.06, 0),
    new THREE.MeshStandardMaterial({ color: 0xfff2a8, flatShading: true })
  );
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

function makeCloud() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
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

function makeSkySign({ text, href, placeholder = false, position, bobPhase = 0 }) {
  const group = new THREE.Group();
  group.position.copy(position);

  const puffMat = new THREE.MeshStandardMaterial({ color: 0xfffdf3, flatShading: true });
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
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
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
];

/* --------------------------------- cat --------------------------------- */

function makeCat() {
  const cat = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.8 });
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
  const legs = legPositions.map(([x, y, z]) => {
    const leg = new THREE.Mesh(legGeo, white);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    cat.add(leg);
    return leg;
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

  cat.scale.setScalar(1.1);
  return cat;
}

const cat = makeCat();
scene.add(cat);

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

  const groundY = terrainHeight(catState.position.x, catState.position.z);
  const hop = catState.mode === 'walk' ? Math.abs(Math.sin(catState.walkPhase)) * 0.09 : 0;
  cat.position.set(catState.position.x, groundY + hop, catState.position.z);
  cat.rotation.y = catState.heading;

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
