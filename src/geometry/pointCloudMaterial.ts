import * as THREE from "three";
import type { ProjectedPixelCloud } from "./types";

export interface PointCloudMaterialUniforms extends Record<string, THREE.IUniform> {
  uSplatWorldSize: { value: number };
  uViewportHeight: { value: number };
  uPixelRatio: { value: number };
  uPointSize: { value: number };
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
    uPointSize: { value: 1.55 },
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
    toneMapped: false
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
  uniform float uPointSize;
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
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * viewPosition;

    vPointColor = color;
  }
`;

const POINT_CLOUD_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vPointColor;

  void main() {
    vec2 centered = gl_PointCoord * 2.0 - 1.0;
    float radius = length(centered);
    if (radius > 1.0) {
      discard;
    }

    float softCoverage = 1.0 - smoothstep(0.72, 1.0, radius);
    gl_FragColor = vec4(vPointColor, softCoverage);
    #include <colorspace_fragment>
  }
`;
