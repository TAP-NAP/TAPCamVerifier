import * as THREE from "three";
import {
  createParticleCatGeometries,
  particleCatAmbientOpacityForDeparture,
  particleCatCycleSeconds,
  particleCatCycleOpacity,
  particleCatExcitedHoldSeconds,
  particleCatExpression,
  particleCatFadeOutEndSeconds,
  particleCatMissedAppearancesAfterCycle,
  particleCatSafePosition,
  particleCatSizePixels,
  particleCatTiltDegrees,
  PARTICLE_CAT_COUNT,
  PARTICLE_CAT_DEFAULT_HOLD_SECONDS,
  PARTICLE_CAT_REVEALED_TIME_SECONDS,
  PARTICLE_ILLUMINATION_RADIUS_SCREEN,
  screenSpaceNdcDistance,
  shouldResetParticleCatTimer,
  smoothParticleCatExcitation,
  type ParticleCatBlockedRect,
  type ParticleCatExpression
} from "./particleCat";

export interface EmptyParticleFieldController {
  setActive(active: boolean): void;
  cleanup(): void;
}

export interface EmptyParticleFieldOptions {
  revealCats?: boolean;
  canvasClassName?: string;
}

const PARTICLE_COUNT = 2_600;
const TOUCH_SPOTLIGHT_SECONDS = 0.9;

export function mountEmptyParticleField(
  host: HTMLElement,
  options: EmptyParticleFieldOptions = {}
): EmptyParticleFieldController {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const useClickSpotlight = window.matchMedia("(hover: none)").matches
    || window.matchMedia("(pointer: coarse)").matches;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = options.canvasClassName ?? "dropzone-particle-canvas";
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
    uPointerActive: { value: 0 },
    uViewportAspect: { value: 1 },
    uCatPositionA: { value: new THREE.Vector2(10, 10) },
    uCatPositionB: { value: new THREE.Vector2(10, 10) },
    uCatHalfSizeA: { value: new THREE.Vector2(0.1, 0.1) },
    uCatHalfSizeB: { value: new THREE.Vector2(0.1, 0.1) },
    uCatPresenceA: { value: 0 },
    uCatPresenceB: { value: 0 }
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
      uniform float uViewportAspect;
      uniform vec2 uCatPositionA;
      uniform vec2 uCatPositionB;
      uniform vec2 uCatHalfSizeA;
      uniform vec2 uCatHalfSizeB;
      uniform float uCatPresenceA;
      uniform float uCatPresenceB;
      attribute float aPhase;
      attribute float aAmplitude;
      varying vec3 vColor;
      varying float vHover;
      varying float vCatOcclusion;

      void main() {
        vec3 animated = position;
        animated.x += cos(uTime * 0.31 + aPhase * 1.7) * aAmplitude * 0.62;
        animated.y += sin(uTime * 0.43 + aPhase) * aAmplitude * 1.35;
        animated.z += sin(uTime * 0.25 + aPhase * 0.73) * aAmplitude;

        vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(animated, 1.0);
        vec2 ndc = clipPosition.xy / max(clipPosition.w, 0.0001);
        vec2 pointerDelta = ndc - uPointer;
        pointerDelta.x *= uViewportAspect;
        float distanceToPointer = length(pointerDelta);
        float hover = uPointerActive * (1.0 - smoothstep(0.035, ${PARTICLE_ILLUMINATION_RADIUS_SCREEN.toFixed(2)}, distanceToPointer));
        animated.z += hover * 0.22;
        clipPosition = projectionMatrix * modelViewMatrix * vec4(animated, 1.0);

        gl_Position = clipPosition;
        vec2 catDeltaA = (ndc - uCatPositionA) / max(uCatHalfSizeA, vec2(0.0001));
        vec2 catDeltaB = (ndc - uCatPositionB) / max(uCatHalfSizeB, vec2(0.0001));
        float catOcclusionA = uCatPresenceA * (1.0 - smoothstep(0.72, 1.42, length(catDeltaA)));
        float catOcclusionB = uCatPresenceB * (1.0 - smoothstep(0.72, 1.42, length(catDeltaB)));
        vCatOcclusion = max(catOcclusionA, catOcclusionB);
        gl_PointSize = (1.35 + hover * 3.4) * uPixelRatio;
        vColor = color;
        vHover = hover;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vHover;
      varying float vCatOcclusion;

      void main() {
        vec2 centered = gl_PointCoord * 2.0 - 1.0;
        float radius = length(centered);
        if (radius > 1.0) discard;
        float coverage = 1.0 - smoothstep(0.72, 1.0, radius);
        vec3 highlighted = mix(vColor, vec3(0.82, 1.0, 0.24), vHover * 0.92);
        float ambientOpacity = 0.24 * (1.0 - vCatOcclusion * 0.88);
        float opacity = mix(ambientOpacity, 0.98, vHover);
        gl_FragColor = vec4(highlighted, coverage * opacity);
        #include <colorspace_fragment>
      }
    `
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  let viewportWidth = 1;
  let viewportHeight = 1;
  let viewportAspect = 1;
  let catSizePixels = 72;
  let disposed = false;
  interface CatState {
    points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    material: THREE.ShaderMaterial;
    ambientOpacity: { value: number };
    excitation: { value: number };
    positionNdc: [number, number];
    tiltDegrees: number;
    appearanceStartedAt: number;
    hasPlaced: boolean;
    hasResetTimer: boolean;
    holdSeconds: number;
    missedAppearances: number;
    wasDiscovered: boolean;
    renderedExcitation: number;
    expression: ParticleCatExpression;
    geometries: Record<ParticleCatExpression, THREE.BufferGeometry>;
  }
  const catStates: CatState[] = [];
  const catPositionUniforms = [uniforms.uCatPositionA, uniforms.uCatPositionB];
  const catHalfSizeUniforms = [uniforms.uCatHalfSizeA, uniforms.uCatHalfSizeB];
  const catPresenceUniforms = [uniforms.uCatPresenceA, uniforms.uCatPresenceB];

  const touchBlockedRects = (): ParticleCatBlockedRect[] => {
    if (!useClickSpotlight) return [];
    const hostRect = host.getBoundingClientRect();
    const selectors = host.classList.contains("hero-particles")
      ? [
          ".landing-topbar",
          ".hero-lockup",
          ".hero-kicker",
          "#landing-title",
          ".hero-body",
          ".scroll-cue",
          ".landing-progress"
        ]
      : [".landing-topbar", ".verification-overview", ".dropzone-copy"];
    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return [];
        return [{
          left: rect.left - hostRect.left,
          top: rect.top - hostRect.top,
          right: rect.right - hostRect.left,
          bottom: rect.bottom - hostRect.top
        }];
      })
    );
  };

  const placeCat = (catIndex: number, randomizePose = false): void => {
    const cat = catStates[catIndex];
    if (!cat) return;
    catSizePixels = particleCatSizePixels(viewportWidth, viewportHeight);
    if (randomizePose) {
      const otherPositions = cat.hasPlaced ? [cat.positionNdc] : [];
      cat.positionNdc = particleCatSafePosition(
        viewportWidth,
        viewportHeight,
        catSizePixels,
        random,
        otherPositions,
        touchBlockedRects()
      );
      cat.tiltDegrees = particleCatTiltDegrees(random);
      cat.expression = particleCatExpression(random);
      cat.points.geometry = cat.geometries[cat.expression];
      cat.hasPlaced = true;
    }
    const worldSize = catSizePixels * 2 / viewportHeight;
    cat.points.scale.set(worldSize, worldSize, 1);
    cat.points.position.x = cat.positionNdc[0] * viewportAspect;
    cat.points.position.y = cat.positionNdc[1];
    cat.points.rotation.z = THREE.MathUtils.degToRad(cat.tiltDegrees);
    catPositionUniforms[catIndex].value.set(...cat.positionNdc);
    catHalfSizeUniforms[catIndex].value.set(
      catSizePixels / viewportWidth * 0.46,
      catSizePixels / viewportHeight * 0.46
    );
  };

  if (options.revealCats) {
    void createParticleCatGeometries().then((catGeometries) => {
      if (disposed) {
        Object.values(catGeometries).forEach((catGeometry) => catGeometry.dispose());
        return;
      }
      for (let catIndex = 0; catIndex < PARTICLE_CAT_COUNT; catIndex += 1) {
        const ambientOpacity = { value: 0.24 };
        const excitation = { value: 0 };
        const catMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uPixelRatio: { value: pixelRatio },
            uAmbientOpacity: ambientOpacity,
            uExcitation: excitation,
            uPresence: { value: 0 }
          },
          vertexColors: true,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.NormalBlending,
          toneMapped: false,
          vertexShader: /* glsl */ `
            uniform float uPixelRatio;
            uniform float uExcitation;
            varying vec3 vColor;
            varying float vExcitation;
            void main() {
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = (1.35 + uExcitation * 3.4) * uPixelRatio;
              vColor = color;
              vExcitation = uExcitation;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform float uAmbientOpacity;
            uniform float uPresence;
            varying vec3 vColor;
            varying float vExcitation;
            void main() {
              vec2 centered = gl_PointCoord * 2.0 - 1.0;
              float radius = length(centered);
              if (radius > 1.0) discard;
              float coverage = 1.0 - smoothstep(0.72, 1.0, radius);
              vec3 excitedColor = mix(vColor, vec3(0.82, 1.0, 0.24), vExcitation * 0.42);
              float opacity = mix(uAmbientOpacity, 0.98, vExcitation);
              gl_FragColor = vec4(excitedColor, coverage * opacity * uPresence);
              #include <colorspace_fragment>
            }
          `
        });
        const points = new THREE.Points(catGeometries.smile, catMaterial);
        points.position.z = 0.45;
        points.renderOrder = 2;
        scene.add(points);
        catStates.push({
          points,
          material: catMaterial,
          ambientOpacity,
          excitation,
          positionNdc: catIndex === 0 ? [-0.68, 0.3] : [0.68, 0.14],
          tiltDegrees: 0,
          appearanceStartedAt: performance.now() / 1000,
          hasPlaced: false,
          hasResetTimer: false,
          holdSeconds: PARTICLE_CAT_DEFAULT_HOLD_SECONDS,
          missedAppearances: 0,
          wasDiscovered: false,
          renderedExcitation: 0,
          expression: "smile",
          geometries: catGeometries
        });
        placeCat(catIndex, true);
      }
    }).catch(() => {
      // The ambient field remains usable if the decorative easter egg cannot load.
    });
  }

  const resize = (): void => {
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const aspect = width / height;
    viewportWidth = width;
    viewportHeight = height;
    viewportAspect = aspect;
    uniforms.uViewportAspect.value = aspect;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    particles.scale.x = aspect / 1.35;
    renderer.setSize(width, height, false);
    catStates.forEach((_, catIndex) => placeCat(catIndex));
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  let active = true;
  let animationFrame = 0;
  let previousRenderSeconds = 0;
  let clickSpotlightExpiresAt = 0;
  const render = (now: number): void => {
    if (!active) return;
    const elapsedSeconds = now / 1000;
    const deltaSeconds = previousRenderSeconds > 0
      ? Math.min(0.1, elapsedSeconds - previousRenderSeconds)
      : 1 / 60;
    previousRenderSeconds = elapsedSeconds;
    uniforms.uTime.value = reducedMotion ? 0 : elapsedSeconds;
    if (useClickSpotlight && elapsedSeconds >= clickSpotlightExpiresAt) {
      uniforms.uPointerActive.value = 0;
    }
    catStates.forEach((cat, catIndex) => {
      let catElapsedSeconds = Math.max(0, elapsedSeconds - cat.appearanceStartedAt);
      if (!reducedMotion && catElapsedSeconds >= particleCatCycleSeconds(cat.holdSeconds)) {
        cat.missedAppearances = particleCatMissedAppearancesAfterCycle(
          cat.missedAppearances,
          cat.wasDiscovered
        );
        placeCat(catIndex, true);
        cat.appearanceStartedAt = elapsedSeconds;
        cat.hasResetTimer = false;
        cat.holdSeconds = PARTICLE_CAT_DEFAULT_HOLD_SECONDS;
        cat.wasDiscovered = false;
        catElapsedSeconds = 0;
      }
      const pointerDistance = screenSpaceNdcDistance(
        [uniforms.uPointer.value.x, uniforms.uPointer.value.y],
        cat.positionNdc,
        viewportAspect
      );
      const hoverReveal = uniforms.uPointerActive.value
        * (1 - THREE.MathUtils.smoothstep(
          pointerDistance,
          PARTICLE_ILLUMINATION_RADIUS_SCREEN * 0.28,
          PARTICLE_ILLUMINATION_RADIUS_SCREEN
        ));
      const targetExcitation = catElapsedSeconds < particleCatFadeOutEndSeconds(cat.holdSeconds)
        ? hoverReveal
        : 0;
      if (targetExcitation > 0.02) {
        cat.wasDiscovered = true;
        cat.missedAppearances = 0;
      }
      if (!reducedMotion && shouldResetParticleCatTimer(
        catElapsedSeconds,
        cat.hasResetTimer,
        targetExcitation,
        cat.holdSeconds
      )) {
        cat.holdSeconds = particleCatExcitedHoldSeconds(random);
        cat.appearanceStartedAt = elapsedSeconds - PARTICLE_CAT_REVEALED_TIME_SECONDS;
        cat.hasResetTimer = true;
        catElapsedSeconds = PARTICLE_CAT_REVEALED_TIME_SECONDS;
      }
      const cycleIntensity = particleCatCycleOpacity(
        catElapsedSeconds,
        reducedMotion,
        cat.holdSeconds
      );
      const hostTop = host.getBoundingClientRect().top;
      const departureProgress = host.classList.contains("hero-particles")
        ? THREE.MathUtils.clamp(-hostTop / Math.max(1, viewportHeight * 0.22), 0, 1)
        : 0;
      cat.ambientOpacity.value = particleCatAmbientOpacityForDeparture(
        cat.missedAppearances,
        departureProgress
      );
      cat.renderedExcitation = reducedMotion
        ? targetExcitation
        : smoothParticleCatExcitation(cat.renderedExcitation, targetExcitation, deltaSeconds);
      cat.excitation.value = cat.renderedExcitation;
      const catPresence = reducedMotion ? 1 : cycleIntensity;
      const catPresenceUniform = cat.material.uniforms.uPresence;
      if (catPresenceUniform) catPresenceUniform.value = catPresence;
      catPresenceUniforms[catIndex].value = Math.max(
        catPresence * 0.26,
        cat.renderedExcitation * catPresence
      );
    });
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(render);
  };

  const updatePointer = (event: Event): boolean => {
    if (!(event instanceof PointerEvent)) return false;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (
      event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom
    ) {
      uniforms.uPointerActive.value = 0;
      return false;
    }
    uniforms.uPointer.value.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -((event.clientY - rect.top) / rect.height * 2 - 1)
    );
    uniforms.uPointerActive.value = 1;
    return true;
  };
  const handlePointerMove = (event: Event): void => {
    if (useClickSpotlight) return;
    updatePointer(event);
  };
  const handlePointerDown = (event: Event): void => {
    if (!updatePointer(event)) return;
    if (useClickSpotlight) {
      clickSpotlightExpiresAt = performance.now() / 1000 + TOUCH_SPOTLIGHT_SECONDS;
    }
  };
  const handlePointerLeave = (): void => {
    uniforms.uPointerActive.value = 0;
  };
  const pointerSurface: Window | HTMLElement = options.revealCats
    ? window
    : (host.parentElement ?? host);
  pointerSurface.addEventListener("pointermove", handlePointerMove);
  pointerSurface.addEventListener("pointerdown", handlePointerDown);
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
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      pointerSurface.removeEventListener("pointerdown", handlePointerDown);
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);
      pointerSurface.removeEventListener("pointercancel", handlePointerLeave);
      resizeObserver.disconnect();
      const catGeometries = new Set<THREE.BufferGeometry>();
      catStates.forEach((cat) => {
        scene.remove(cat.points);
        Object.values(cat.geometries).forEach((catGeometry) => catGeometries.add(catGeometry));
        cat.material.dispose();
      });
      catGeometries.forEach((catGeometry) => catGeometry.dispose());
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
