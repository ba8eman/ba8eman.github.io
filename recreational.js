import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeCat, makeGlowTexture } from './cat.js';

/* ------------------------------------------------------------------ */
/*  Recreational — a moonlit beach, glowing blue                       */
/*                                                                     */
/*  The meadow's cat walks the waterline at night. Every wave that     */
/*  breaks lights up with bioluminescent algae, the swash leaves a     */
/*  fading blue sheen on the wet sand, and each paw sparks where it    */
/*  lands. The projects wait on driftwood posts along the way.         */
/* ------------------------------------------------------------------ */

/* ----------------------------- the projects ----------------------------- */
/* Swap these for the real thing — add a `url` to turn a plaque into a real
   link, leave it off and it stays a dashed placeholder. Order is the order
   you walk past them. */

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

/* ------------------------------ the shore ------------------------------ */
/* The beach runs along Z. The sea is on +X, land on -X. `s` everywhere means
   "distance up the beach from the mean waterline": negative is sea. */

const Z_START = 20;           // where the walk begins
const Z_END = -112;           // where it loops, behind a fade

const SIGN_SPACING = 13;
const SIGN_FIRST_Z = -6;
const SIGN_S = 5.5;           // plaques stand this far up the sand

const WALK_S = 1.5;           // the cat keeps to the wet sand, where the swash reaches

// waves — shared between the shader and the JS that needs to know where the water is
const PERIOD = 7.0;           // seconds between waves reaching the sand
const CREST_GAP = 7.0;        // spacing of the breaking crests offshore
const RUN_MIN = -1.6;         // how far the backwash draws down
const RUN_PEAK = 0.32;        // fraction of a cycle spent rushing up the sand

const MOON_DIR = new THREE.Vector3(0.6, 0.15, -1).normalize();
const HORIZON = new THREE.Color(0.02, 0.045, 0.1);    // linear; also the fog
const ZENITH = new THREE.Color(0.002, 0.005, 0.018);
const MOON_COL = new THREE.Color(0.5, 0.58, 0.75);
const FOG_DENSITY = 0.016;

const clock = new THREE.Clock();

function fract(x) {
  return x - Math.floor(x);
}

function hash(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function h1(x) {
  return fract(Math.sin(x * 127.1) * 43758.5453);
}

function n1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h1(i) + (h1(i + 1) - h1(i)) * u;
}

function shoreX(z) {
  return 4 + Math.sin(z * 0.04) * 2.5 + Math.sin(z * 0.013 + 1) * 3;
}

// gentle slope up from the water, then the dunes
function sandH(s) {
  return s * 0.075 + THREE.MathUtils.smoothstep(s, 16, 34) * 2.2;
}

function waveCycle(z, t) {
  return t / PERIOD + z * 0.012 + Math.sin(z * 0.045) * 0.3;
}

// how far up the sand wave number k reaches at this stretch of beach
function runMax(k, z) {
  return 2.0 + 2.2 * n1(z * 0.09 + k * 7.31);
}

// a fast rush up, a slower slide back
function runAt(p, rmax) {
  const e = p < RUN_PEAK
    ? Math.sin((p / RUN_PEAK) * Math.PI * 0.5)
    : Math.cos(((p - RUN_PEAK) / (1 - RUN_PEAK)) * Math.PI * 0.5);
  return RUN_MIN + (rmax - RUN_MIN) * e;
}

// lerp between angles the short way round — headings here sit right on the ±PI seam
function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

function waterEdgeAt(z, t) {
  const c = waveCycle(z, t);
  return runAt(fract(c), runMax(Math.floor(c), z));
}

/* ------------------------------- scene ------------------------------- */

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HORIZON.clone(), FOG_DENSITY);

// Expressed in the CAT'S OWN frame: it is modelled facing +Z, so a
// camera trailing behind sits at negative Z, and +X is the land side.
const CAM_OFFSET = new THREE.Vector3(2.4, 2.4, -8.0);   // a few steps back and up from the cat
const CAM_LOOK_Y = 0.8;
const UP = new THREE.Vector3(0, 1, 0);

function walkPathAt(z) {
  return new THREE.Vector3(shoreX(z) - WALK_S, sandH(WALK_S), z);
}

function headingAt(z) {
  return Math.atan2(shoreX(z - 1) - shoreX(z), -1);
}

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
{
  const start = CAM_OFFSET.clone().applyAxisAngle(UP, headingAt(Z_START));
  const p = walkPathAt(Z_START);
  camera.position.set(p.x + start.x, p.y + CAM_LOOK_Y + start.y, p.z + start.z);
}

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

// the glow is the whole point, so it gets a bloom pass
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.5, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
{
  const p = walkPathAt(Z_START);
  controls.target.set(p.x, p.y + CAM_LOOK_Y, p.z);
}
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 24;
controls.minPolarAngle = Math.PI * 0.18;
controls.maxPolarAngle = Math.PI * 0.49;   // stay above the sand
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

/* ------------------------------ shader bits ------------------------------ */
/* The same wave maths as the JS above, so the sand, the sea and the cat
   all agree on where the water is. */

const f = (x) => x.toFixed(5);

const GLSL_COMMON = /* glsl */ `
  uniform float uTime;

  #define PERIOD ${f(PERIOD)}
  #define CREST_GAP ${f(CREST_GAP)}
  #define RUN_MIN ${f(RUN_MIN)}
  #define RUN_PEAK ${f(RUN_PEAK)}
  #define HALF_PI 1.5707963

  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n1(float x) {
    float i = floor(x), fr = fract(x);
    return mix(h1(i), h1(i + 1.0), fr * fr * (3.0 - 2.0 * fr));
  }
  float n2(vec2 p) {
    vec2 i = floor(p), fr = fract(p);
    vec2 u = fr * fr * (3.0 - 2.0 * fr);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x),
               mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
  }

  float shoreX(float z) { return 4.0 + sin(z * 0.04) * 2.5 + sin(z * 0.013 + 1.0) * 3.0; }
  float sandH(float s) { return s * 0.075 + smoothstep(16.0, 34.0, s) * 2.2; }
  float waveCycle(float z) { return uTime / PERIOD + z * 0.012 + sin(z * 0.045) * 0.3; }
  float runMax(float k, float z) { return 2.0 + 2.2 * n1(z * 0.09 + k * 7.31); }
  float runAt(float p, float rmax) {
    float e = p < RUN_PEAK
      ? sin(p / RUN_PEAK * HALF_PI)
      : cos((p - RUN_PEAK) / (1.0 - RUN_PEAK) * HALF_PI);
    return RUN_MIN + (rmax - RUN_MIN) * e;
  }
`;

/* -------------------------------- sky -------------------------------- */

const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uMoonDir: { value: MOON_DIR },
    uMoonCol: { value: MOON_COL },
    uHorizon: { value: HORIZON },
    uZenith: { value: ZENITH },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    uniform vec3 uMoonDir, uMoonCol, uHorizon, uZenith;
    varying vec3 vDir;

    void main() {
      vec3 d = normalize(vDir);
      float y = d.y;
      vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, y));
      if (y < 0.0) col = uHorizon;

      float m = max(dot(d, uMoonDir), 0.0);

      // stars, thinning toward the horizon and drowned out near the moon
      if (y > 0.0) {
        vec2 sp = vec2(atan(d.z, d.x), asin(y)) * 95.0;
        vec2 id = floor(sp);
        float h = h2(id);
        if (h > 0.982) {
          vec2 c = id + 0.5 + (vec2(h2(id + 7.1), h2(id + 3.3)) - 0.5) * 0.6;
          float star = smoothstep(0.16, 0.0, length(sp - c));
          float tw = 0.65 + 0.35 * sin(uTime * (1.0 + h * 3.0) + h * 60.0);
          float bright = 0.4 + 2.2 * pow(h2(id + 1.7), 6.0);
          col += vec3(0.8, 0.88, 1.0) * star * tw * bright
               * smoothstep(0.02, 0.25, y) * (1.0 - smoothstep(0.93, 0.99, m));
        }
      }

      // halo, then the disc itself
      col += uMoonCol * (pow(m, 18.0) * 0.03 + pow(m, 400.0) * 0.16);
      float disc = smoothstep(0.99905, 0.99925, m);
      vec3 rel = (d - uMoonDir) * 70.0;
      float maria = n2(rel.xy * 1.3 + 4.0) * 0.6 + n2(rel.yz * 2.7) * 0.4;
      col = mix(col, vec3(0.72, 0.74, 0.72) * (0.72 + 0.28 * maria), disc);

      // (no moon path painted below the horizon: the sea's own glitter fades
      // out well before it, so a painted one floated as a detached dashed line)

      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
});

const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat);
sky.renderOrder = -1;
scene.add(sky);

/* ------------------------------- lights ------------------------------- */

scene.add(new THREE.HemisphereLight(0x3a4c7a, 0x05070d, 0.55));

const moonLight = new THREE.DirectionalLight(0xa8bce6, 0.9);
scene.add(moonLight);
scene.add(moonLight.target);

// the algae lights the cat's paws from below
const footGlow = new THREE.PointLight(0x2aa4ff, 1, 4, 2);
scene.add(footGlow);

/* -------------------------- sand and sea -------------------------- */
/* One surface for both, so there is never a seam at the waterline. The
   fragment shader decides, per pixel, whether it is looking at dry sand, wet
   sand, a thin sheet of swash or open sea — and where the algae is lit. */

const STEPS = 40;   // paw prints the shader remembers
const stepUniforms = Array.from({ length: STEPS }, () => new THREE.Vector4(0, 0, -1000, 0));

const BEACH_W = 170;
const BEACH_L = 230;
const BEACH_SEG_X = 255;
const BEACH_SEG_Z = 345;
const CELL_X = BEACH_W / BEACH_SEG_X;
const CELL_Z = BEACH_L / BEACH_SEG_Z;

const beachGeo = new THREE.PlaneGeometry(BEACH_W, BEACH_L, BEACH_SEG_X, BEACH_SEG_Z);
beachGeo.rotateX(-Math.PI / 2);

const beachMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uMoonDir: { value: MOON_DIR },
    uMoonCol: { value: MOON_COL },
    uFogCol: { value: HORIZON },
    uSkyCol: { value: new THREE.Color(0.03, 0.055, 0.11) },
    uFogDensity: { value: FOG_DENSITY },
    uSteps: { value: stepUniforms },
    uCat: { value: new THREE.Vector2() },
  },
  vertexShader: /* glsl */ `
    ${GLSL_COMMON}
    varying vec3 vWorld;
    varying float vS;

    // swell, peaking at each crest with a steep shoreward face
    float seaY(float s, float z) {
      float d = RUN_MIN - s;
      float q = fract(waveCycle(z) + max(d, 0.0) / CREST_GAP);
      float shape = max(exp(-q * 4.0), smoothstep(0.86, 1.0, q));
      float amp = 0.05 + 0.34 * smoothstep(0.0, CREST_GAP * 0.8, d)
                              * smoothstep(CREST_GAP * 5.0, CREST_GAP * 1.4, d);
      float chop = sin(z * 0.31 + uTime * 0.9) * 0.04 + sin(s * 0.27 - uTime * 0.7) * 0.05;
      return -0.1 + amp * shape + chop * smoothstep(0.0, 6.0, d);
    }

    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      float s = shoreX(w.z) - w.x;
      float y = sandH(s);
      if (s < 1.0) y = max(y, seaY(s, w.z));
      w.y = y;
      vS = s;
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    #define STEPS ${STEPS}
    uniform vec3 uMoonDir, uMoonCol, uFogCol, uSkyCol;
    uniform float uFogDensity;
    uniform vec4 uSteps[STEPS];   // x, z, time placed, unused
    uniform vec2 uCat;
    varying vec3 vWorld;
    varying float vS;

    const vec3 BIO = vec3(0.03, 0.42, 1.0);
    const vec3 BIO_HOT = vec3(0.12, 0.7, 1.0);

    // scattered specks of algae, each twinkling on its own clock
    float specks(vec2 xz, float scale, float density) {
      vec2 g = xz * scale;
      vec2 id = floor(g);
      float h = h2(id);
      vec2 jit = vec2(h2(id + 3.1), h2(id + 7.7)) - 0.5;
      float d = length(fract(g) - 0.5 - jit * 0.6);
      float tw = 0.55 + 0.45 * sin(uTime * (1.3 + h * 4.0) + h * 40.0);
      return step(1.0 - density, h) * smoothstep(0.24, 0.0, d) * tw;
    }

    // small moving ripples, as a slope — enough to break the moon into a path
    vec2 ripples(vec2 p) {
      vec2 g = vec2(0.0);
      g += vec2(0.8, 0.6)  * 0.9 * cos(dot(p, vec2(0.8, 0.6)) * 0.9 + uTime * 1.1) * 0.22;
      g += vec2(-0.5, 0.9) * 1.7 * cos(dot(p, vec2(-0.5, 0.9)) * 1.7 + uTime * 1.6) * 0.12;
      g += vec2(0.95, -0.3)* 3.1 * cos(dot(p, vec2(0.95, -0.3)) * 3.1 + uTime * 2.3) * 0.06;
      g += vec2(0.2, 1.0)  * 5.3 * cos(dot(p, vec2(0.2, 1.0)) * 5.3 - uTime * 3.1) * 0.03;
      float e = 0.07;
      vec2 q = p * 2.2 + vec2(uTime * 0.4, -uTime * 0.3);
      g += vec2(n2(q + vec2(e, 0)) - n2(q - vec2(e, 0)), n2(q + vec2(0, e)) - n2(q - vec2(0, e))) / (2.0 * e) * 0.08;
      return g;
    }

    void main() {
      float z = vWorld.z;
      float s = vS;
      vec3 toCam = cameraPosition - vWorld;
      float dist = length(toCam);
      vec3 V = toCam / dist;
      vec3 geomN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      if (geomN.y < 0.0) geomN = -geomN;
      float near = smoothstep(55.0, 12.0, dist);   // fade fine detail before it shimmers

      // where is the water right now?
      float c = waveCycle(z);
      float k = floor(c);
      float p = fract(c);
      float rmax = runMax(k, z);
      float R = runAt(p, rmax);
      float covered = smoothstep(R + 0.06, R - 0.06, s);
      float sheet = s < RUN_MIN ? 1.0 : clamp((R - s) / 1.6, 0.0, 1.0);

      /* ---- sand ---- */
      float grain = n2(vWorld.xz * 3.0) * 0.6 + n2(vWorld.xz * 23.0) * 0.4 * near;
      float wetLine = 3.8 + n1(z * 0.07) * 0.7;
      float wet = smoothstep(wetLine + 0.9, wetLine - 0.2, s);
      vec3 albedo = vec3(0.6, 0.57, 0.53) * (0.82 + 0.3 * grain);
      albedo *= mix(1.0, 0.45, wet);

      // footprints press darker hollows into the sand
      float pressed = 0.0;
      float stepGlow = 0.0;
      for (int i = 0; i < STEPS; i++) {
        vec4 st = uSteps[i];
        float age = uTime - st.z;
        vec2 rel = vWorld.xz - st.xy;
        float foot = smoothstep(0.085, 0.03, length(rel));
        pressed = max(pressed, foot * exp(-age * 0.04));
        float ring = exp(-abs(length(rel) - age * 0.55) * 16.0) * exp(-age * 1.6);
        stepGlow += foot * exp(-age * 0.45) * 1.6 + ring * 0.7;
      }
      albedo *= 1.0 - pressed * 0.35;

      vec2 bump = (vec2(n2(vWorld.xz * 6.0 + 0.5), n2(vWorld.xz * 6.0 + 9.1)) - 0.5) * 0.25 * near;
      vec3 sandN = normalize(geomN + vec3(bump.x, 0.0, bump.y));
      vec3 ambient = vec3(0.02, 0.03, 0.06);
      vec3 sandCol = albedo * (uMoonCol * max(dot(sandN, uMoonDir), 0.0) * 0.38 + ambient);

      // wet sand is a dull mirror
      vec3 Rs = reflect(-V, sandN);
      float wetSpec = pow(max(dot(Rs, uMoonDir), 0.0), 60.0) * 0.12;
      sandCol += wet * (uMoonCol * wetSpec + uSkyCol * 0.15);

      // the cat's shadow, thrown away from the moon
      vec2 away = -normalize(uMoonDir.xz);
      vec2 rel = vWorld.xz - uCat;
      float along = clamp(dot(rel, away), 0.0, 1.8);
      float across = length(rel - away * along);
      float width = 0.24 * (1.0 - along / 1.8 * 0.3);
      sandCol *= 1.0 - 0.5 * smoothstep(width + 0.12, width - 0.06, across) * (1.0 - along / 1.8 * 0.6);

      /* ---- water ---- */
      vec2 g = ripples(vWorld.xz) * mix(0.35, 1.0, smoothstep(RUN_MIN + 1.0, RUN_MIN - 3.0, s));
      vec3 waterN = normalize(geomN + vec3(-g.x, 0.0, -g.y));
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(waterN, V), 0.0), 5.0);
      vec3 Rw = reflect(-V, waterN);
      float md = max(dot(Rw, uMoonDir), 0.0);
      float spec = pow(md, 2200.0) * 1.5 + pow(md, 220.0) * 0.02;
      spec *= smoothstep(130.0, 75.0, dist);
      vec3 waterCol = vec3(0.003, 0.008, 0.02) + uSkyCol * fres * 0.8 + uMoonCol * spec;

      vec3 col = mix(sandCol, waterCol, covered * mix(0.45, 1.0, sheet));

      /* ---- bioluminescence ---- */
      float glow = 0.0;

      // breaking crests coming in: a sharp lit line with churned foam behind it
      float d = RUN_MIN - s;
      if (d > 0.0) {
        float cq = c + d / CREST_GAP;
        float q = fract(cq);
        float kq = floor(cq);
        float crest = exp(-q * 26.0) * smoothstep(1.0, 0.985, q);
        float churn = exp(-q * 5.0) * smoothstep(1.0, 0.97, q);
        float streak = n2(vec2(z * 1.3, d * 2.2 - uTime * 0.6));
        float breaking = smoothstep(CREST_GAP * 2.4, CREST_GAP * 0.35, d);
        float patchy = 0.35 + 0.9 * smoothstep(0.25, 0.75, n2(vec2(z * 0.16, kq * 3.7)));
        glow += breaking * patchy * (crest * 3.2 + churn * streak * streak * 1.5);
        // the swell further out only catches a little
        float far = (1.0 - breaking) * smoothstep(CREST_GAP * 6.0, CREST_GAP * 2.0, d);
        glow += far * crest * 0.35 * n2(vec2(z * 0.4, kq));
        // drifting plankton in open water
        glow += specks(vWorld.xz + vec2(uTime * 0.05, 0.0), 2.5, 0.05) * 0.5 * near;
      }

      // the leading edge of the swash, brightest while it is still rushing up
      float behindEdge = R - s;
      if (behindEdge > 0.0) {
        float rushing = p < RUN_PEAK ? 1.0 : 1.0 - smoothstep(RUN_PEAK, RUN_PEAK + 0.4, p) * 0.85;
        float lace = 0.55 + 0.9 * n2(vec2(z * 1.1, k * 5.3 + uTime * 0.2));
        glow += exp(-behindEdge * 5.0) * rushing * lace * 2.2;
        // streaks of algae tumbling in the thin sheet behind it
        float foam = n2(vec2(z * 1.6, s * 2.6 - p * 9.0));
        glow += smoothstep(RUN_MIN - 1.0, RUN_MIN + 0.5, s) * (foam * foam * foam * 1.8 + 0.1) * (1.0 - p * 0.7);
      }

      // after the water drains away, the sand it touched keeps glowing for a bit
      if (s > R) {
        float after = 0.0;
        if (p > RUN_PEAK && s < rmax) {
          float pe = RUN_PEAK + (1.0 - RUN_PEAK) * acos(clamp((s - RUN_MIN) / (rmax - RUN_MIN), 0.0, 1.0)) / HALF_PI;
          after = exp(-(p - pe) * PERIOD * 0.75);
        }
        float rprev = runMax(k - 1.0, z);
        if (s < rprev) {
          float pe = RUN_PEAK + (1.0 - RUN_PEAK) * acos(clamp((s - RUN_MIN) / (rprev - RUN_MIN), 0.0, 1.0)) / HALF_PI;
          after = max(after, exp(-(p + 1.0 - pe) * PERIOD * 0.75));
        }
        float sp = mix(0.12, specks(vWorld.xz, 9.0, 0.45), near);
        glow += after * (sp * 2.4 + 0.12);
      }

      // stranded algae: the wet sand is never fully dark, and a line of it marks the tide
      float strand = mix(0.04, specks(vWorld.xz, 11.0, 0.3), near);
      glow += wet * strand * 0.45;
      glow += exp(-abs(s - wetLine) * 3.0) * mix(0.08, specks(vWorld.xz * vec2(1.0, 0.5), 14.0, 0.6), near) * 0.9;

      // every paw print on wet sand lights up, and in the swash it flares
      glow += stepGlow * wet * (0.6 + covered * 1.4) * (0.6 + 0.6 * specks(vWorld.xz, 16.0, 0.6));

      vec3 bio = mix(BIO, BIO_HOT, smoothstep(1.2, 4.0, glow)) * glow * 0.75;

      // fog: the glow cuts through the haze a little better than everything else
      float fogF = exp(-pow(dist * uFogDensity, 2.0));
      float fogGlow = exp(-pow(dist * uFogDensity * 0.7, 2.0));
      col = mix(uFogCol, col, fogF) + bio * fogGlow;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
  fog: false,
});

const beach = new THREE.Mesh(beachGeo, beachMat);
beach.frustumCulled = false;
scene.add(beach);

// the surface travels with the cat; snapping to the grid keeps the vertices
// from swimming as it moves, and the shader works in world space throughout
function placeBeach(z) {
  const cx = shoreX(z) + 15;
  const cz = z - 62;
  beach.position.set(Math.round(cx / CELL_X) * CELL_X, 0, Math.round(cz / CELL_Z) * CELL_Z);
}

/* ------------------------------ distant land ------------------------------ */

function buildHeadlands() {
  const group = new THREE.Group();
  const layers = [
    { z: -330, h: 26, c: 0x0b1222, n: 6, x0: -190, x1: 30 },
    { z: -290, h: 17, c: 0x080d19, n: 7, x0: -170, x1: 10 },
    { z: -255, h: 10, c: 0x050911, n: 7, x0: -150, x1: -10 },
  ];

  for (const L of layers) {
    const mat = new THREE.MeshBasicMaterial({ color: L.c, fog: false });
    for (let i = 0; i < L.n; i++) {
      const w = 24 + hash(i, L.z) * 36;
      const h = L.h * (0.55 + hash(i * 3.1, L.z) * 0.8);
      const shape = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4 + (i % 3), 1), mat);
      shape.position.set(L.x0 + (i / (L.n - 1)) * (L.x1 - L.x0) + hash(i, 7) * 10, h / 2 - 3, L.z);
      shape.rotation.y = hash(i, 11) * Math.PI;
      group.add(shape);
    }
  }
  return group;
}

const headlands = buildHeadlands();
scene.add(headlands);

/* ------------------------------ fishing boats ------------------------------ */
/* A couple of small boats out past the breakers off the cat's right, lamps
   lit. They keep pace with the walk, as if working the same stretch of
   water, so they stay in view. Built along local +X (the bow), then turned
   to run parallel to the shore. */

const boatHullMat = new THREE.MeshStandardMaterial({ color: 0x1b2532, roughness: 0.9, flatShading: true });
const boatTrimMat = new THREE.MeshStandardMaterial({ color: 0x5a6b7d, roughness: 0.8, flatShading: true });
const boatCabinMat = new THREE.MeshStandardMaterial({ color: 0x2c3442, roughness: 0.9, flatShading: true });
const boatWindowMat = new THREE.MeshBasicMaterial({ color: 0xffb35c });
const boatLampMat = new THREE.MeshBasicMaterial({ color: 0xffe0a8 });

const boatHullGeo = (() => {
  // side profile: flat deck, a sheer rising to the bow, a raked stem
  const shape = new THREE.Shape();
  shape.moveTo(-1.9, 0.55);
  shape.lineTo(1.4, 0.55);
  shape.lineTo(2.3, 0.8);
  shape.lineTo(1.5, -0.25);
  shape.lineTo(-1.7, -0.25);
  shape.lineTo(-2.0, 0.2);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false });
  g.translate(0, 0, -0.65);
  // pinch the front into a pointed bow
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x > 0.8) pos.setZ(i, pos.getZ(i) * Math.max(0.04, 1 - (x - 0.8) / 1.5));
  }
  g.computeVertexNormals();
  return g;
})();

function makeBoatLight(color, size) {
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false, // lamps carry through the haze
    })
  );
  glow.scale.setScalar(size);
  return glow;
}

function makeBoat() {
  const boat = new THREE.Group();
  const rocker = new THREE.Group(); // rolls and pitches on the swell
  boat.add(rocker);

  rocker.add(new THREE.Mesh(boatHullGeo, boatHullMat));

  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.34), boatTrimMat);
  rail.position.set(-0.2, 0.58, 0);
  rocker.add(rail);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.95), boatCabinMat);
  cabin.position.set(-0.85, 0.95, 0);
  rocker.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 1.1), boatTrimMat);
  roof.position.set(-0.85, 1.39, 0);
  rocker.add(roof);

  // lit windows, both sides of the cabin
  const windowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.97), boatWindowMat);
  windowStrip.position.set(-0.85, 1.05, 0);
  rocker.add(windowStrip);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.3, 5), boatTrimMat);
  mast.position.set(0.35, 1.7, 0);
  rocker.add(mast);

  // a lamp at the masthead and one hung at the stern
  const lamps = [];
  for (const [x, y, size] of [[0.35, 2.9, 0.65], [-1.75, 1.0, 0.45]]) {
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), boatLampMat);
    bulb.position.set(x, y, 0);
    rocker.add(bulb);
    const glow = makeBoatLight(0xffb35c, size);
    glow.position.copy(bulb.position);
    rocker.add(glow);
    lamps.push(glow);
  }

  // the masthead lamp's reflection: a long streak lying on the water,
  // turned toward the camera each frame
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 5),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      color: 0xffa64d,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  streak.rotation.x = -Math.PI / 2;
  const streakPivot = new THREE.Group();
  streakPivot.add(streak);
  streak.position.z = 2.6; // stretch from under the boat toward the viewer
  streakPivot.position.y = 0.12;
  boat.add(streakPivot);

  boat.userData = { rocker, lamps, streakPivot };
  return boat;
}

// how far ahead of the cat along the shore, and how far out past the waterline
const BOAT_SPOTS = [
  { ahead: 55, out: 35, yaw: 0.25, phase: 0 },     // well offshore, a hazy silhouette
  { ahead: 80, out: 60, yaw: -0.35, phase: 2.1 },  // out near the horizon, mostly just its lamps
];

const boats = BOAT_SPOTS.map((spot) => {
  const boat = makeBoat();
  boat.userData.spot = spot;
  boat.userData.z = Z_START - spot.ahead;
  scene.add(boat);
  return boat;
});

function updateBoats(dt, t, catZ) {
  for (const boat of boats) {
    const { spot, rocker, lamps, streakPivot } = boat.userData;
    const wantZ = catZ - spot.ahead;
    // drift along with the walk; jump when the walk loops back to the start
    if (Math.abs(wantZ - boat.userData.z) > 30) boat.userData.z = wantZ;
    boat.userData.z += (wantZ - boat.userData.z) * Math.min(1, dt * 0.4);

    const z = boat.userData.z;
    boat.position.set(shoreX(z) + spot.out, -0.08 + Math.sin(t * 0.8 + spot.phase) * 0.06, z);
    boat.rotation.y = Math.PI / 2 + spot.yaw; // bow runs along the shore
    rocker.rotation.x = Math.sin(t * 0.7 + spot.phase) * 0.06;
    rocker.rotation.z = Math.sin(t * 0.55 + spot.phase * 1.7) * 0.04;

    for (const lamp of lamps) {
      lamp.material.opacity = 0.8 + 0.12 * Math.sin(t * 7 + spot.phase + lamp.position.x);
    }

    // point the reflection streak at the camera
    const toCam = Math.atan2(camera.position.x - boat.position.x, camera.position.z - boat.position.z);
    streakPivot.rotation.y = toCam - boat.rotation.y;
  }
}

/* ------------------------------ palms at the back ------------------------------ */
/* Mostly silhouettes against the sky, so they're kept dark and simple. */

const frondGeo = (() => {
  const g = new THREE.PlaneGeometry(2.9, 0.68, 10, 3);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const along = pos.getX(i);
    const across = pos.getY(i);
    const t = Math.max(0, (along + 1.45) / 2.9);
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

const TRUNKS = [
  { h: 5.4, lean: 1.5 },
  { h: 6.6, lean: 2.4 },
  { h: 4.6, lean: 0.9 },
  { h: 7.4, lean: 3.1 },
].map((t) => ({ ...t, geo: makeTrunkGeometry(t.h, t.lean) }));

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b2622, flatShading: true, roughness: 1 });
const frondMats = [0x13221a, 0x182a1f, 0x0f1c15].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, side: THREE.DoubleSide, roughness: 1 })
);

const palms = [];

function makePalm(seed) {
  const palm = new THREE.Group();
  const trunk = TRUNKS[Math.floor(hash(seed, 1.7) * TRUNKS.length) % TRUNKS.length];
  palm.add(new THREE.Mesh(trunk.geo, trunkMat));

  const crown = new THREE.Group();
  crown.position.set(trunk.lean, trunk.h, 0);
  crown.rotation.z = -0.3;
  palm.add(crown);

  const n = 7;
  for (let i = 0; i < n; i++) {
    const frond = new THREE.Mesh(frondGeo, frondMats[i % frondMats.length]);
    frond.rotation.y = (i / n) * Math.PI * 2 + hash(seed, i) * 0.3;
    frond.rotation.z = 0.5 + hash(seed * 2, i) * 0.45;
    frond.scale.setScalar(0.85 + hash(seed, i * 3.3) * 0.4);
    crown.add(frond);
  }

  palm.userData.crown = crown;
  palm.userData.swayPhase = hash(seed, 5.5) * Math.PI * 2;
  palm.userData.crownRestZ = crown.rotation.z;
  palms.push(palm);
  return palm;
}

let palmSeed = 0;
for (let z = Z_START + 40; z > Z_END - 90; z -= 4 + hash(z, 3) * 5) {
  palmSeed += 1;
  const s = 19 + hash(palmSeed, z) * 14;
  const palm = makePalm(palmSeed);
  palm.position.set(shoreX(z) - s, sandH(s) - 0.15, z);
  // lean out toward the sea, with some scatter
  palm.rotation.y = Math.PI + (hash(palmSeed, 9) - 0.5) * 1.6;
  palm.scale.setScalar(0.8 + hash(palmSeed, 4) * 0.5);
  scene.add(palm);
}

/* ------------------------------ rocks and driftwood ------------------------------ */

const rockMat = new THREE.MeshStandardMaterial({ color: 0x343844, flatShading: true, roughness: 0.95 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, flatShading: true, roughness: 1 });

for (let i = 0; i < 46; i++) {
  const z = Z_START + 30 - hash(i, 1.3) * (Z_START - Z_END + 110);
  const s = 7 + hash(i, 2.9) * 12;
  const r = 0.25 + Math.pow(hash(i, 4.1), 2) * 1.1;
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
  rock.position.set(shoreX(z) - s, sandH(s) + r * 0.25, z);
  rock.scale.set(1, 0.55 + hash(i, 5) * 0.4, 0.8 + hash(i, 6) * 0.5);
  rock.rotation.set(hash(i, 7) * 3, hash(i, 8) * 3, 0);
  scene.add(rock);
}

for (let i = 0; i < 14; i++) {
  const z = Z_START + 20 - hash(i, 9.1) * (Z_START - Z_END + 80);
  const s = 4.8 + hash(i, 3.7) * 6;
  const len = 1.2 + hash(i, 1.1) * 2.2;
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, len, 6), woodMat);
  log.position.set(shoreX(z) - s, sandH(s) + 0.07, z);
  log.rotation.order = 'YXZ';   // lay it down first, then turn it
  log.rotation.set(0, hash(i, 2.2) * Math.PI, Math.PI / 2);
  scene.add(log);
}

/* -------------------------------- the cat -------------------------------- */
/* the same white cat from the meadow, in its night-time glow */

const cat = makeCat();
// no glow or halo here, just a faint self-light so the white cat still
// reads as white with the moon behind it
cat.userData.whiteMat.emissiveIntensity = 0.1;
scene.add(cat);

// paw spots in the cat's own space (legs, times the cat's 1.1 scale)
const PAW_X = 0.17 * 1.1;
const PAW_Z = 0.28 * 1.1;

/* ------------------------------ splashes of light ------------------------------ */
/* little sparks kicked up by the feet when they land in the swash */

const SPARK_COUNT = 240;
const sparkPos = new Float32Array(SPARK_COUNT * 3);
const sparkCol = new Float32Array(SPARK_COUNT * 3);
const sparkVel = new Float32Array(SPARK_COUNT * 3);
const sparkLife = new Float32Array(SPARK_COUNT);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(
  sparkGeo,
  new THREE.PointsMaterial({
    size: 0.07,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
sparks.frustumCulled = false;
scene.add(sparks);

let sparkCursor = 0;

function kickSparks(x, z, n, power) {
  for (let i = 0; i < n; i++) {
    const j = sparkCursor;
    sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.12;
    sparkPos[j * 3] = x + Math.cos(a) * r;
    sparkPos[j * 3 + 1] = sandH(WALK_S) + 0.03;
    sparkPos[j * 3 + 2] = z + Math.sin(a) * r;
    sparkVel[j * 3] = Math.cos(a) * (0.3 + Math.random() * 0.6) * power;
    sparkVel[j * 3 + 1] = (0.8 + Math.random() * 1.4) * power;
    sparkVel[j * 3 + 2] = Math.sin(a) * (0.3 + Math.random() * 0.6) * power;
    sparkLife[j] = 0.6 + Math.random() * 0.6;
  }
}

function updateSparks(dt) {
  for (let i = 0; i < SPARK_COUNT; i++) {
    if (sparkLife[i] <= 0) {
      sparkCol[i * 3] = sparkCol[i * 3 + 1] = sparkCol[i * 3 + 2] = 0;
      continue;
    }
    sparkLife[i] -= dt;
    sparkVel[i * 3 + 1] -= 6 * dt;
    sparkPos[i * 3] += sparkVel[i * 3] * dt;
    sparkPos[i * 3 + 1] = Math.max(sandH(WALK_S), sparkPos[i * 3 + 1] + sparkVel[i * 3 + 1] * dt);
    sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
    const b = Math.max(0, sparkLife[i]) * 2.6;
    sparkCol[i * 3] = 0.15 * b;
    sparkCol[i * 3 + 1] = 0.75 * b;
    sparkCol[i * 3 + 2] = 1.0 * b;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

/* ---------------------------- project plaques ---------------------------- */
/* a driftwood post up the sand with a jar of glowing algae hung on it, plus a
   real DOM label so the text stays crisp and clickable */

const postMat = new THREE.MeshStandardMaterial({ color: 0x5c5248, flatShading: true, roughness: 1 });
const boardMat = new THREE.MeshStandardMaterial({ color: 0x8a7d6a, flatShading: true, roughness: 0.95 });
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x9fd8ff,
  transparent: true,
  opacity: 0.25,
  roughness: 0.1,
  depthWrite: false,
});

const signs = [];

PROJECTS.forEach((project, i) => {
  const z = SIGN_FIRST_Z - i * SIGN_SPACING;
  const x = shoreX(z) - SIGN_S;
  const group = new THREE.Group();
  group.position.set(x, sandH(SIGN_S), z);
  group.rotation.y = Math.PI * 0.5 + (hash(i, 3) - 0.5) * 0.3;   // board faces the water

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), postMat);
  post.position.y = 1.05;
  post.rotation.z = (hash(i, 1) - 0.5) * 0.12;
  group.add(post);

  const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 0.07), boardMat);
  board.position.set(0, 2.0, 0.07);
  board.rotation.x = -0.15;
  group.add(board);

  const jar = new THREE.Group();
  jar.position.set(0.5, 1.45, 0.14);
  const algae = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.075, 1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 3.0) })
  );
  algae.position.y = -0.03;
  jar.add(algae);
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), glassMat));
  group.add(jar);

  const wrapper = document.createElement('div');
  const isLink = Boolean(project.url);
  const el = document.createElement(isLink ? 'a' : 'span');
  el.className = 'sign-label shore' + (isLink ? '' : ' placeholder');
  if (isLink) {
    el.href = project.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  }
  el.style.pointerEvents = 'auto';

  const nameEl = document.createElement('span');
  nameEl.className = 'shore-name';
  nameEl.textContent = project.name;
  el.appendChild(nameEl);

  if (project.note) {
    const noteEl = document.createElement('span');
    noteEl.className = 'shore-note';
    noteEl.textContent = project.note;
    el.appendChild(noteEl);
  }
  wrapper.appendChild(el);

  const label = new CSS2DObject(wrapper);
  label.position.set(0, 2.85, 0);
  group.add(label);

  scene.add(group);
  signs.push({ group, wrapper, el, z, algae, phase: hash(i, 8) * 6 });
});

/* ------------------------------ walking ------------------------------ */

const WALK_SPEED = 1.15;
const GLIDE_SPEED = 6.5;      // a trot, when skipping between plaques
const STRIDE = 6.4;           // radians of walk cycle per unit travelled

const trip = {
  z: Z_START,
  walking: true,
  glideTo: null,
  phase: 0,
  stride: 0,           // eases in and out, so stopping isn't a freeze-frame
  lastSin: 0,
  stepCursor: 0,
};

const fade = document.getElementById('wrap-fade');
let fadeAmount = 0;
let pendingWrap = false;

function forgetFootprints() {
  for (const st of stepUniforms) st.z = -1000;
}

function placeFootprint(x, z, t) {
  const st = stepUniforms[trip.stepCursor];
  trip.stepCursor = (trip.stepCursor + 1) % STEPS;
  st.set(x, z, t, 0);
}

function updateCat(dt, t) {
  const before = trip.z;
  if (trip.glideTo !== null) {
    const diff = trip.glideTo - trip.z;
    const ease = Math.min(1, Math.abs(diff) / 2.5);   // slow to a walk on arrival
    const step = Math.sign(diff) * Math.min(Math.abs(diff), GLIDE_SPEED * Math.max(ease, 0.2) * dt);
    trip.z += step;
    if (Math.abs(diff) < 0.05) {
      trip.z = trip.glideTo;
      trip.glideTo = null;
    }
  } else if (trip.walking) {
    trip.z -= WALK_SPEED * dt;
  }
  const moved = Math.abs(trip.z - before);
  const goingBack = trip.z > before;

  // loop the walk behind a short fade instead of snapping
  if (trip.z < Z_END && !pendingWrap) pendingWrap = true;
  if (pendingWrap) {
    fadeAmount = Math.min(1, fadeAmount + dt * 1.6);
    if (fadeAmount >= 1) {
      trip.z = Z_START;
      pendingWrap = false;
      forgetFootprints();
    }
  } else if (fadeAmount > 0) {
    fadeAmount = Math.max(0, fadeAmount - dt * 1.2);
  }
  if (fade) fade.style.opacity = String(fadeAmount);

  const here = walkPathAt(trip.z);
  const heading = headingAt(trip.z) + (goingBack ? Math.PI : 0);

  trip.stride = THREE.MathUtils.lerp(trip.stride, moved > 1e-4 ? 1 : 0, Math.min(1, dt * 5));
  trip.phase += moved * STRIDE;
  const sw = Math.sin(trip.phase);
  const swing = sw * 0.5 * trip.stride;
  const { legs } = cat.userData;
  legs[0].rotation.x = swing;    // front-left
  legs[3].rotation.x = swing;    // back-right
  legs[1].rotation.x = -swing;   // front-right
  legs[2].rotation.x = -swing;   // back-left
  cat.userData.tailPivot.rotation.y = Math.sin(t * (trip.stride > 0.5 ? 6 : 2)) * 0.35;
  cat.userData.head.rotation.y = Math.sin(t * 0.7) * 0.12;

  cat.position.copy(here);
  cat.position.y += Math.abs(Math.cos(trip.phase)) * 0.015 * trip.stride;
  cat.rotation.y = lerpAngle(cat.rotation.y, heading, Math.min(1, dt * 6));

  // a diagonal pair of paws lands each time the legs pass each other
  const edge = waterEdgeAt(trip.z, t);
  const inWater = edge > WALK_S;
  if (moved > 1e-4 && Math.sign(sw) !== Math.sign(trip.lastSin)) {
    const pair = sw > 0 ? [[-PAW_X, PAW_Z], [PAW_X, -PAW_Z]] : [[PAW_X, PAW_Z], [-PAW_X, -PAW_Z]];
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const [lx, lz] of pair) {
      // local +X is (fz, -fx) once turned to the heading
      const px = here.x + fz * lx + fx * lz;
      const pz = here.z - fx * lx + fz * lz;
      placeFootprint(px, pz, t);
      kickSparks(px, pz, inWater ? 9 : 2, inWater ? 0.7 : 0.35);
    }
  }
  trip.lastSin = sw;

  // light the cat from below, harder when the swash is round its paws
  const pawDeep = THREE.MathUtils.clamp((edge - WALK_S) / 1.2, 0, 1);
  footGlow.position.set(here.x, here.y + 0.05, here.z);
  footGlow.intensity = THREE.MathUtils.lerp(footGlow.intensity, 0.4 + pawDeep * 1.6, Math.min(1, dt * 4));

  return here;
}

/* ---------------------------- plaque visibility ---------------------------- */

function updateSigns(catZ, t) {
  for (const sign of signs) {
    const dz = sign.z - catZ;          // positive = already passed
    let opacity = 0;
    if (dz < 10 && dz > -24) {
      opacity = THREE.MathUtils.clamp((24 + dz) / 7, 0, 1) * THREE.MathUtils.clamp((10 - dz) / 7, 0, 1);
    }
    sign.wrapper.style.opacity = opacity.toFixed(3);
    sign.wrapper.style.display = opacity < 0.02 ? 'none' : '';

    const near = dz > -10 && dz < 5;
    sign.el.classList.toggle('active', near);
    const pulse = (near ? 1.3 : 0.8) + Math.sin(t * 1.7 + sign.phase) * 0.25;
    sign.algae.material.color.setRGB(0.2 * pulse, 1.4 * pulse, 3.0 * pulse);
  }
}

/* ------------------------------ navigation ------------------------------ */

const playBtn = document.getElementById('nav-play');
const prevBtn = document.getElementById('nav-prev');
const nextBtn = document.getElementById('nav-next');

function setWalking(on) {
  trip.walking = on;
  if (playBtn) {
    playBtn.textContent = on ? '❙❙' : '▶';
    playBtn.setAttribute('aria-label', on ? 'pause the walk' : 'keep walking');
  }
}

function goToSign(step) {
  // where the cat should stop to be level with a plaque
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
  if (best < 2.5 || Math.sign(stops[idx] - trip.z) !== Math.sign(-step)) idx += step;
  idx = THREE.MathUtils.clamp(idx, 0, stops.length - 1);
  trip.glideTo = stops[idx];
  hint.style.opacity = '0';
}

if (playBtn) playBtn.addEventListener('click', () => setWalking(!trip.walking));
if (prevBtn) prevBtn.addEventListener('click', () => goToSign(-1));
if (nextBtn) nextBtn.addEventListener('click', () => goToSign(1));

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToSign(1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToSign(-1);
  else if (e.key === ' ') {
    e.preventDefault();
    setWalking(!trip.walking);
  }
});

setWalking(true);

/* ------------------------------- camera ------------------------------- */
/* the camera follows behind the cat. OrbitControls still owns the offset,
   so dragging works — we just translate target and camera by the same delta. */

const camTarget = controls.target.clone();
const idealOffset = new THREE.Vector3();

function updateCamera(dt, pos, heading, t) {
  const desired = pos.clone();
  desired.y += CAM_LOOK_Y;

  const delta = desired.clone().sub(camTarget);
  camTarget.copy(desired);
  controls.target.add(delta);
  camera.position.add(delta);

  if (!userInteracted) {
    idealOffset.set(
      CAM_OFFSET.x + Math.sin(t * 0.11) * 1.3,
      CAM_OFFSET.y + Math.sin(t * 0.08) * 0.35,
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
  composer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function render() {
  composer.render();
  labelRenderer.render(scene, camera);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  const pos = updateCat(dt, t);
  updateCamera(dt, pos, headingAt(trip.z), t);
  updateSigns(trip.z, t);
  updateSparks(dt);
  updateBoats(dt, t, trip.z);

  placeBeach(trip.z);
  beachMat.uniforms.uTime.value = t;
  beachMat.uniforms.uCat.value.set(pos.x, pos.z);
  skyMat.uniforms.uTime.value = t;

  // sky and far land sit at infinity: pin them to the camera
  sky.position.copy(camera.position);
  headlands.position.set(0, 0, trip.z);

  moonLight.target.position.copy(pos);
  moonLight.position.copy(pos).addScaledVector(MOON_DIR, 30);

  // palms in the night breeze
  for (const palm of palms) {
    const sway = Math.sin(t * 0.5 + palm.userData.swayPhase) * 0.04;
    palm.userData.crown.rotation.z = palm.userData.crownRestZ + sway;
    palm.userData.crown.rotation.y = sway * 0.6;
  }

  controls.update();
  render();
  requestAnimationFrame(animate);
}

placeBeach(Z_START);
cat.position.copy(walkPathAt(Z_START));
cat.rotation.y = headingAt(Z_START);
render();
document.getElementById('loading').classList.add('hidden');
animate();

if (!userInteracted) {
  setTimeout(() => {
    if (!userInteracted) hint.style.opacity = '1';
  }, 500);
}
