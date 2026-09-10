import * as THREE from "three";
import type { ProjectedPixelCloud } from "./types";

export interface PointCloudMaterialUniforms extends Record<string, THREE.IUniform> {
  uPointSize: { value: number };
}

export interface PointCloudMaterialBundle {
  material: THREE.ShaderMaterial;
  uniforms: PointCloudMaterialUniforms;
}

export function makePointCloudMaterial(): PointCloudMaterialBundle {
  const uniforms: PointCloudMaterialUniforms = {
    uPointSize: { value: 1.55 }
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

const POINT_CLOUD_VERTEX_SHADER = /* glsl */ `
  uniform float uPointSize;

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
