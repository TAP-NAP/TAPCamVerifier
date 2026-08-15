import * as THREE from "three";

export interface EmptyParticleFieldController {
  setActive(active: boolean): void;
  cleanup(): void;
}

const PARTICLE_COUNT = 2_600;

export function mountEmptyParticleField(host: HTMLElement): EmptyParticleFieldController {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "dropzone-particle-canvas";
  host.replaceChildren(renderer.domElement);

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const phases = new Float32Array(PARTICLE_COUNT);
  const amplitudes = new Float32Array(PARTICLE_COUNT);
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aAmplitude", new THREE.BufferAttribute(amplitudes, 1));

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
      varying vec3 vColor;
      varying float vHover;

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
        gl_PointSize = (1.35 + hover * 3.4) * uPixelRatio;
        vColor = color;
        vHover = hover;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vHover;

      void main() {
        vec2 centered = gl_PointCoord * 2.0 - 1.0;
        float radius = length(centered);
        if (radius > 1.0) discard;
        float coverage = 1.0 - smoothstep(0.72, 1.0, radius);
        vec3 highlighted = mix(vColor, vec3(0.82, 1.0, 0.24), vHover * 0.92);
        float opacity = mix(0.26, 0.98, vHover);
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
  pointerSurface.addEventListener("pointerleave", handlePointerLeave);
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
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
