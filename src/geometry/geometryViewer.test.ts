import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { setLang, onLangChange, t } from "../i18n/i18n";
import { refreshPixelProjectionLabels } from "../ui/rendering";
import { mountGeometryViewer } from "./geometryViewer";
import { RISK_DISCONTINUITY_EDGE } from "./filtering";
import type { ProjectedPixelCloud } from "./types";

class Element extends EventTarget {
  textContent = "";
  innerHTML = "";
  className = "";
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: Element[] = [];
  parentElement: Element | null = null;
  selectors = new Map<string, Element[]>();
  value = "";
  disabled = false;
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, value: boolean) => value ? this.classes.add(name) : this.classes.delete(name)
  };
  append(child: Element) { this.children.push(child); child.parentElement = this; }
  remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string) { return this.selectors.get(selector) ?? []; }
  getBoundingClientRect() { return { width: 600, height: 800 }; }
}

const instances = vi.hoisted(() => ({ renderers: [] as any[], controls: [] as any[] }));
vi.mock("three", async (importOriginal) => ({
  ...await importOriginal<typeof THREE>(),
  WebGLRenderer: class {
    domElement = new Element();
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    clear() {}
    setViewport() {}
    setScissorTest() {}
    render = vi.fn();
    dispose = vi.fn();
    constructor() { instances.renderers.push(this); }
  }
}));
vi.mock("three/examples/jsm/controls/OrbitControls.js", async () => {
  const { EventDispatcher, Vector3 } = await import("three");
  return { OrbitControls: class extends EventDispatcher {
    target = new Vector3();
    update() {}
    dispose() {}
    constructor() { super(); instances.controls.push(this); }
  } };
});

afterEach(() => { vi.unstubAllGlobals(); setLang("en"); });

describe("geometry viewer language refresh", () => {
  it("updates text while retaining the filtered geometry, canvas, camera and working controls", () => {
    setLang("en");
    vi.stubGlobal("window", {
      devicePixelRatio: 1, matchMedia: () => ({ matches: true }),
      setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
    });
    vi.stubGlobal("document", { createElement: () => new Element() });
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const panel = new Element();
    const shell = new Element();
    const host = new Element();
    panel.append(shell); shell.append(host);
    const control = (selector: string, parent = shell): Element => {
      const element = new Element(); parent.selectors.set(selector, [element]); return element;
    };
    const toggle = control("[data-geometry-filter-toggle]");
    control("[data-geometry-filter-panel]");
    const reset = control("[data-geometry-reset]");
    const sensitivity = control("[data-geometry-filter-sensitivity]");
    const sensitivityLabel = control("[data-geometry-filter-sensitivity-label]");
    const visiblePoints = control("[data-geometry-visible-points]", panel);
    const activeFilter = control("[data-geometry-active-filter]", panel);
    const edges = control("[data-geometry-risk-show]");
    edges.dataset.geometryRiskShow = "edges";
    reset.dataset.geometryCopy = "geom.resetView";
    panel.selectors.set("[data-geometry-copy]", [reset]);
    panel.selectors.set("#geometryViewer", [host]);
    const description = control("[data-geometry-description]", panel);
    description.dataset.geometryDescription = "filter.edgesDesc";
    const view = control("[data-geometry-view-mode]", panel);
    view.dataset.geometryViewMode = "capture-camera";
    const sample = control("[data-geometry-sample]", panel);
    sample.dataset.geometrySample = "2";
    const localize = onLangChange(() => refreshPixelProjectionLabels(panel as unknown as HTMLElement));
    const cloud = {
      pointCount: 2, imageWidth: 2, imageHeight: 1, fx: 2, fy: 2, cx: 1, cy: 0.5,
      positions: new Float32Array([0, 0, -1, 0.5, 0, -1]),
      colors: new Uint8Array([10, 20, 30, 40, 50, 60]),
      riskFlags: new Uint16Array([0, RISK_DISCONTINUITY_EDGE]),
      outlierScores: new Uint8Array(2), discontinuityScores: new Uint8Array([0, 255])
    } as ProjectedPixelCloud;
    const cleanup = mountGeometryViewer(host as unknown as HTMLElement, cloud);
    try {
      const renderer = instances.renderers.at(-1)!;
      const controls = instances.controls.at(-1)!;
      const [scene, camera] = renderer.render.mock.calls[0] as [THREE.Scene, THREE.PerspectiveCamera];
      const pivot = scene.children[0];
      const points = pivot.children[0] as THREE.Points;
      const canvas = host.children[0];
      toggle.dispatchEvent(new Event("click"));
      sensitivity.value = "2";
      sensitivity.dispatchEvent(new Event("input"));
      edges.dispatchEvent(new Event("click"));
      expect(visiblePoints.textContent).toBe("1");
      const geometry = points.geometry;
      const positions = geometry.getAttribute("position");
      controls.dispatchEvent({ type: "start" });
      camera.position.set(0.2, 0.3, 0.4);
      const target = controls.target.clone();
      const projection = camera.projectionMatrix.clone();
      setLang("zh");
      expect(host.children[0]).toBe(canvas);
      expect(points.geometry).toBe(geometry);
      expect(points.geometry.getAttribute("position")).toBe(positions);
      expect(camera.position.toArray()).toEqual([0.2, 0.3, 0.4]);
      expect(camera.projectionMatrix.equals(projection)).toBe(true);
      expect(controls.target.equals(target)).toBe(true);
      expect(sensitivity.value).toBe("2");
      expect(sensitivityLabel.textContent).toBe(t("filter.high"));
      expect(toggle.attributes.get("aria-expanded")).toBe("true");
      expect(edges.attributes.get("aria-pressed")).toBe("false");
      expect(reset.textContent).toBe(t("geom.resetView"));
      expect(description.dataset.tooltip).toBe(t("filter.edgesDesc"));
      expect(description.attributes.get("aria-label")).toBe(t("filter.edgesDesc"));
      expect(view.textContent).toBe(t("geom.captureCamera"));
      expect(sample.textContent).toBe(t("geom.everyNPx", { n: 2 }));
      expect(activeFilter.textContent).toContain(t("filter.high"));
      edges.dispatchEvent(new Event("click"));
      expect(visiblePoints.textContent).toBe("2");
      reset.dispatchEvent(new Event("click"));
      expect(camera.position.toArray()).toEqual([0, 0, 0]);
    } finally {
      cleanup(); localize();
    }
  });
});
