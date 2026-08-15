import * as THREE from "three";

export interface EmptyParticleFieldController {
  setActive(active: boolean): void;
  cleanup(): void;
}

export interface EmptyParticleFieldOptions {
  revealCats?: boolean;
  canvasClassName?: string;
}

const PARTICLE_COUNT = 2_600;
const CAT_POINT_COUNT = 214;

function catPoint(index: number): [number, number] {
  if (index < 64) {
    const angle = index / 64 * Math.PI * 2;
    return [Math.cos(angle) * 0.34, 0.29 + Math.sin(angle) * 0.28];
  }

  if (index < 100) {
    const earIndex = index - 64;
    const side = earIndex < 18 ? -1 : 1;
    const t = (earIndex % 18) / 17;
    if (t < 0.5) {
      const local = t * 2;
      return [side * (0.18 + local * 0.16), 0.48 + local * 0.31];
    }
    const local = (t - 0.5) * 2;
    return [side * (0.34 - local * 0.25), 0.79 - local * 0.28];
  }

  if (index < 172) {
    const angle = (index - 100) / 72 * Math.PI * 2;
    return [Math.cos(angle) * 0.42, -0.22 + Math.sin(angle) * 0.54];
  }

  const t = (index - 172) / 41;
  const angle = t * Math.PI * 1.75 - 0.2;
  const radius = 0.22 + t * 0.42;
  return [0.34 + Math.cos(angle) * radius, -0.28 + Math.sin(angle) * radius * 0.72];
}

export function mountEmptyParticleField(
  host: HTMLElement,
  options: EmptyParticleFieldOptions = {}
): EmptyParticleFieldController {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = options.canvasClassName ?? "dropzone-particle-canvas";
  host.replaceChildren(renderer.domElement);

  const catCount = options.revealCats ? CAT_POINT_COUNT * 2 : 0;
  const totalParticleCount = PARTICLE_COUNT + catCount;
  const positions = new Float32Array(totalParticleCount * 3);
  const colors = new Float32Array(totalParticleCount * 3);
  const phases = new Float32Array(totalParticleCount);
  const amplitudes = new Float32Array(totalParticleCount);
  const catness = new Float32Array(totalParticleCount);
  const revealPhases = new Float32Array(totalParticleCount);
  let seed = 0x5a17c9e3;
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4_294_967_296;
  };

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const x = random() * 2.7 - 1.35;
    const branch = random() > 0.48 ? 1 : -1;
    const ribbon = Math.sin(x * 3.2 + branch * 0.8) * 0.12;
    const spread = (random() + random() + random() - 1.5) * 0.56;
    positions[index * 3] = x;
    positions[index * 3 + 1] = ribbon + spread + branch * 0.05;
    positions[index * 3 + 2] = (random() - 0.5) * 0.42;

    const warm = random();
    colors[index * 3] = warm > 0.82 ? 0.78 : 0.32;
    colors[index * 3 + 1] = warm > 0.82 ? 0.9 : 0.39;
    colors[index * 3 + 2] = warm > 0.82 ? 0.5 : 0.14;
    phases[index] = random() * Math.PI * 2;
    amplitudes[index] = 0.018 + random() * 0.052;
  }

  if (options.revealCats) {
    const cats = [
      { x: -0.72, y: 0.03, scale: 0.24, phase: 0.25 },
      { x: 0.68, y: -0.24, scale: 0.21, phase: 3.4 }
    ];
    cats.forEach((cat, catIndex) => {
      for (let pointIndex = 0; pointIndex < CAT_POINT_COUNT; pointIndex += 1) {
        const index = PARTICLE_COUNT + catIndex * CAT_POINT_COUNT + pointIndex;
        const [pointX, pointY] = catPoint(pointIndex);
        positions[index * 3] = cat.x + pointX * cat.scale;
        positions[index * 3 + 1] = cat.y + pointY * cat.scale;
        positions[index * 3 + 2] = 0.12 + (random() - 0.5) * 0.02;
        colors[index * 3] = 0.55;
        colors[index * 3 + 1] = 0.7;
        colors[index * 3 + 2] = 0.22;
        phases[index] = random() * Math.PI * 2;
        amplitudes[index] = 0.004 + random() * 0.007;
        catness[index] = 1;
        revealPhases[index] = cat.phase;
      }
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aAmplitude", new THREE.BufferAttribute(amplitudes, 1));
  geometry.setAttribute("aCat", new THREE.BufferAttribute(catness, 1));
  geometry.setAttribute("aRevealPhase", new THREE.BufferAttribute(revealPhases, 1));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uPointer: { value: new THREE.Vector2(10, 10) },
    uPointerActive: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec2 uPointer;
      uniform float uPointerActive;
      attribute float aPhase;
      attribute float aAmplitude;
      attribute float aCat;
      attribute float aRevealPhase;
      varying vec3 vColor;
      varying float vHover;
      varying float vCat;
      varying float vReveal;

      void main() {
        vec3 animated = position;
        animated.x += cos(uTime * 0.31 + aPhase * 1.7) * aAmplitude * 0.62;
        animated.y += sin(uTime * 0.43 + aPhase) * aAmplitude * 1.35;
        animated.z += sin(uTime * 0.25 + aPhase * 0.73) * aAmplitude;

        vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(animated, 1.0);
        vec2 ndc = clipPosition.xy / max(clipPosition.w, 0.0001);
        float distanceToPointer = distance(ndc, uPointer);
        float hover = uPointerActive * (1.0 - smoothstep(0.04, 0.42, distanceToPointer));
        animated.z += hover * 0.22;
        clipPosition = projectionMatrix * modelViewMatrix * vec4(animated, 1.0);

        gl_Position = clipPosition;
        float reveal = smoothstep(0.66, 1.0, 0.5 + 0.5 * sin(uTime * 0.21 + aRevealPhase));
        gl_PointSize = (1.35 + aCat * 0.35 + hover * 3.4) * uPixelRatio;
        vColor = color;
        vHover = hover;
        vCat = aCat;
        vReveal = reveal;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vHover;
      varying float vCat;
      varying float vReveal;

      void main() {
        vec2 centered = gl_PointCoord * 2.0 - 1.0;
        float radius = length(centered);
        if (radius > 1.0) discard;
        float coverage = 1.0 - smoothstep(0.72, 1.0, radius);
        vec3 highlighted = mix(vColor, vec3(0.82, 1.0, 0.24), vHover * 0.92);
        float ambientOpacity = mix(0.24, mix(0.018, 0.12, vReveal), vCat);
        float opacity = mix(ambientOpacity, 0.98, vHover);
        gl_FragColor = vec4(highlighted, coverage * opacity);
        #include <colorspace_fragment>
      }
    `
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const aspect = width / height;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    particles.scale.x = aspect / 1.35;
    renderer.setSize(width, height, false);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  let active = true;
  let animationFrame = 0;
  const render = (now: number): void => {
    if (!active) return;
    uniforms.uTime.value = reducedMotion ? 0 : now / 1000;
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(render);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    uniforms.uPointer.value.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -((event.clientY - rect.top) / rect.height * 2 - 1)
    );
    uniforms.uPointerActive.value = 1;
  };
  const handlePointerLeave = (): void => {
    uniforms.uPointerActive.value = 0;
  };
  const pointerSurface = host.parentElement ?? host;
  pointerSurface.addEventListener("pointermove", handlePointerMove);
  pointerSurface.addEventListener("pointerdown", handlePointerMove);
  pointerSurface.addEventListener("pointerleave", handlePointerLeave);
  pointerSurface.addEventListener("pointercancel", handlePointerLeave);
  animationFrame = window.requestAnimationFrame(render);

  return {
    setActive(nextActive: boolean): void {
      if (active === nextActive) return;
      active = nextActive;
      uniforms.uPointerActive.value = 0;
      if (active) {
        animationFrame = window.requestAnimationFrame(render);
      } else {
        window.cancelAnimationFrame(animationFrame);
      }
    },
    cleanup(): void {
      active = false;
      window.cancelAnimationFrame(animationFrame);
      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      pointerSurface.removeEventListener("pointerdown", handlePointerMove);
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);
      pointerSurface.removeEventListener("pointercancel", handlePointerLeave);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
