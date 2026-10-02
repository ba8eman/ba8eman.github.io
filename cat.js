import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  The white cat, shared by the meadow and the night shore.           */
/*  Modelled facing +Z, legs on hip pivots: [FL, FR, BL, BR].          */
/* ------------------------------------------------------------------ */

export function makeCat() {
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

// A soft round dot, shared by the fireflies, stars, comet and cat halo.
// Built from raw pixels rather than a canvas gradient: Safari dithers canvas
// gradients, and near the transparent edge that noise turns into bright
// rainbow specks once the texture is stretched over something big. Here
// every pixel is pure white and only the alpha fades, so nothing can tint it.
let glowTexture = null;
export function makeGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      // bright core out to a quarter of the radius, then fade to nothing
      const a = d < 0.25 ? 1 - 0.8 * d : Math.max(0, 0.8 * (1 - d) / 0.75);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  glowTexture = new THREE.DataTexture(data, size, size);
  glowTexture.magFilter = THREE.LinearFilter;
  glowTexture.minFilter = THREE.LinearMipmapLinearFilter;
  glowTexture.generateMipmaps = true;
  glowTexture.needsUpdate = true;
  return glowTexture;
}
