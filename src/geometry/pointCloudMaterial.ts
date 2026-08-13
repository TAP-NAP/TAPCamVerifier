import * as THREE from "three";
import type { ProjectedPixelCloud } from "./types";

export interface PointCloudMaterialUniforms extends Record<string, THREE.IUniform> {
  uSplatWorldSize: { value: number };
  uViewportHeight: { value: number };
  uPixelRatio: { value: number };
  uMinPointSize: { value: number };
  uMaxPointSize: { value: number };
  uHoverPoint: { value: THREE.Vector3 };
  uHoverRadius: { value: number };
  uHoverStrength: { value: number };
  uRollDirection: { value: THREE.Vector2 };
  uPulsePoint: { value: THREE.Vector3 };
  uPulseProgress: { value: number };
}

export interface PointCloudMaterialBundle {
  material: THREE.ShaderMaterial;
  uniforms: PointCloudMaterialUniforms;
}

export function makePointCloudMaterial(
  cloud: ProjectedPixelCloud,
  targetDepth: number,
  maxPointSize: number
): PointCloudMaterialBundle {
  const splatWorldSize = splatWorldSizeForCloud(cloud, targetDepth);
  const hoverRadius = interactionRadiusForCloud(cloud, targetDepth);
  const uniforms: PointCloudMaterialUniforms = {
    uSplatWorldSize: { value: splatWorldSize },
    uViewportHeight: { value: 1 },
    uPixelRatio: { value: 1 },
    uMinPointSize: { value: 1.35 },
    uMaxPointSize: { value: Math.max(8, maxPointSize) },
    uHoverPoint: { value: new THREE.Vector3() },
    uHoverRadius: { value: hoverRadius },
    uHoverStrength: { value: 0 },
    uRollDirection: { value: new THREE.Vector2() },
    uPulsePoint: { value: new THREE.Vector3() },
    uPulseProgress: { value: -1 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POINT_CLOUD_VERTEX_SHADER,
    fragmentShader: POINT_CLOUD_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
    toneMapped: true
  });
  material.alphaToCoverage = true;

  return { material, uniforms };
}

export function representativeDepthForCloud(cloud: ProjectedPixelCloud): number {
  const pointCount = Math.floor(cloud.positions.length / 3);
  if (pointCount === 0) {
    return 1;
  }

  const maximumSamples = 4_096;
  const step = Math.max(1, Math.floor(pointCount / maximumSamples));
  const depths: number[] = [];
  for (let index = 0; index < pointCount; index += step) {
    const z = cloud.positions[index * 3 + 2];
    const depth = -z;
    if (Number.isFinite(depth) && depth > 0.000_001) {
      depths.push(depth);
    }
  }
  if (depths.length === 0) {
    return 1;
  }
  depths.sort((left, right) => left - right);
  return Math.max(0.25, depths[Math.floor(depths.length / 2)]);
}

export function splatWorldSizeForCloud(cloud: ProjectedPixelCloud, targetDepth: number): number {
  const safeDepth = Math.max(0.25, targetDepth);
  const safeFx = Math.max(Math.abs(cloud.fx), 0.000_001);
  const safeFy = Math.max(Math.abs(cloud.fy), 0.000_001);
  const sampleStep = Math.max(1, cloud.sampleStep);
  const horizontalFootprint = safeDepth * sampleStep / safeFx;
  const verticalFootprint = safeDepth * sampleStep / safeFy;
  const overlappingDiscDiameter = Math.max(horizontalFootprint, verticalFootprint) * 1.72;
  return clamp(overlappingDiscDiameter, safeDepth * 0.000_75, safeDepth * 0.045);
}

export function interactionRadiusForCloud(cloud: ProjectedPixelCloud, targetDepth: number): number {
  const splatSize = splatWorldSizeForCloud(cloud, targetDepth);
  return Math.max(splatSize * 9, targetDepth * 0.038);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const POINT_CLOUD_VERTEX_SHADER = /* glsl */ `
  uniform float uSplatWorldSize;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  uniform float uMinPointSize;
  uniform float uMaxPointSize;
  uniform vec3 uHoverPoint;
  uniform float uHoverRadius;
  uniform float uHoverStrength;
  uniform vec2 uRollDirection;
  uniform vec3 uPulsePoint;
  uniform float uPulseProgress;

  attribute vec3 color;

  varying vec3 vPointColor;
  varying float vEnergy;
  varying vec2 vRollOffset;

  void main() {
    float hoverDistance = distance(position, uHoverPoint);
    float hoverWeight = uHoverStrength * (1.0 - smoothstep(0.0, uHoverRadius, hoverDistance));

    float pulseEnabled = step(0.0, uPulseProgress) * step(uPulseProgress, 1.0);
    float pulseDistance = distance(position, uPulsePoint);
    float pulseRadius = uHoverRadius * mix(0.15, 2.45, clamp(uPulseProgress, 0.0, 1.0));
    float pulseWidth = max(uHoverRadius * 0.2, 0.0001);
    float pulseRing = pulseEnabled
      * (1.0 - smoothstep(pulseWidth * 0.35, pulseWidth, abs(pulseDistance - pulseRadius)))
      * (1.0 - clamp(uPulseProgress, 0.0, 1.0));

    float energy = clamp(hoverWeight * 0.88 + pulseRing, 0.0, 1.0);
    float tumbleEnvelope = hoverWeight * (0.42 + 0.58 * (1.0 - smoothstep(0.0, uHoverRadius * 0.72, hoverDistance)));
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);

    float projectedDiameter = uSplatWorldSize
      * uViewportHeight
      * uPixelRatio
      * projectionMatrix[1][1]
      / max(0.0001, -viewPosition.z)
      * 0.5;
    gl_PointSize = clamp(projectedDiameter, uMinPointSize, uMaxPointSize);
    gl_Position = projectionMatrix * viewPosition;

    vPointColor = color;
    vEnergy = energy;
    vRollOffset = uRollDirection * tumbleEnvelope;
  }
`;

const POINT_CLOUD_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vPointColor;
  varying float vEnergy;
  varying vec2 vRollOffset;

  void main() {
    vec2 centered = gl_PointCoord * 2.0 - 1.0;
    float radius = length(centered);
    if (radius > 1.0) {
      discard;
    }

    float softCoverage = 1.0 - smoothstep(0.84, 1.0, radius);
    float luminousCore = 1.0 - smoothstep(0.0, 0.72, length(centered - vRollOffset * 0.24));
    float luminance = dot(vPointColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 coolNeutral = vec3(luminance * 0.64, luminance * 0.82, luminance * 1.05);
    vec3 baseColor = mix(vPointColor, coolNeutral, 0.18);
    vec3 sourceChroma = vPointColor - vec3(luminance);
    vec3 selfLitColor = vPointColor * 1.24 + sourceChroma * 0.3 + vec3(0.09 + luminance * 0.2);
    vec3 finalColor = mix(baseColor, selfLitColor, smoothstep(0.0, 1.0, vEnergy) * 0.86);
    finalColor *= 0.94 + luminousCore * 0.14 + vEnergy * 0.26;

    gl_FragColor = vec4(finalColor, softCoverage * (0.9 + luminousCore * 0.1));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
