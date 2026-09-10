import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { mountEmptyParticleField, type EmptyParticleFieldController } from "./emptyParticleField";

const rendererState = vi.hoisted(() => ({ fail: false, instances: [] as any[] }));
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof THREE>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = Object.assign(new EventTarget(), { className: "", remove: vi.fn() });
      setPixelRatio = vi.fn();
      setClearColor = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = vi.fn();
      constructor() {
        if (rendererState.fail) throw new Error("WebGL unavailable");
        rendererState.instances.push(this);
      }
    }
  };
});
vi.mock("./particleCat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./particleCat")>();
  const { BufferGeometry } = await import("three");
  return {
    ...actual,
    createParticleCatGeometries: async () => ({
      smile: new BufferGeometry(), sleepy: new BufferGeometry(),
      crying: new BufferGeometry(), pouting: new BufferGeometry()
    })
  };
});

let page: EventTarget;
let host: HTMLElement;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let field: EmptyParticleFieldController | undefined;

beforeEach(() => {
  rendererState.fail = false;
  rendererState.instances = [];
  nextFrame = 0;
  frames = new Map();
  page = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 1,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id)
  });
  vi.stubGlobal("window", page);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  host = Object.assign(new EventTarget(), {
    classList: { contains: () => false },
    replaceChildren: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 })
  }) as unknown as HTMLElement;
});
afterEach(() => {
  field?.cleanup();
  field = undefined;
  vi.unstubAllGlobals();
});

function transition(type: string, persisted: boolean): void {
  page.dispatchEvent(Object.assign(new Event(type), { persisted }));
}
function renderFrame(time: number): void {
  const scheduled = [...frames.values()];
  frames.clear();
  scheduled.forEach((callback) => callback(time));
}

describe("particle field page lifecycle", () => {
  it("lets page setup continue when WebGL is unavailable", () => {
    rendererState.fail = true;
    field = mountEmptyParticleField(host, { revealCats: true });
    const selectFile = vi.fn();
    host.addEventListener("click", selectFile);
    host.dispatchEvent(new Event("click"));
    expect(selectFile).toHaveBeenCalledOnce();
    expect(host.replaceChildren).not.toHaveBeenCalled();
    expect(() => { field!.setActive(false); field!.cleanup(); }).not.toThrow();
  });

  it("resumes the same scene and cats after BFCache, respecting caller visibility", async () => {
    field = mountEmptyParticleField(host, { revealCats: true });
    await Promise.resolve();
    renderFrame(1000);
    const renderer = rendererState.instances[0];
    const scene = renderer.render.mock.calls[0][0] as THREE.Scene;
    const objects = [...scene.children];
    expect(objects).toHaveLength(2);
    transition("pagehide", true);
    expect(frames.size).toBe(0);
    expect(renderer.dispose).not.toHaveBeenCalled();
    transition("pageshow", true);
    expect(frames.size).toBe(1);
    renderFrame(1100);
    expect(renderer.render.mock.calls[1][0]).toBe(scene);
    expect(scene.children).toEqual(objects);
    expect(host.replaceChildren).toHaveBeenCalledOnce();

    field.setActive(false);
    transition("pagehide", true);
    transition("pageshow", true);
    expect(frames.size).toBe(0);
    field.setActive(true);
    expect(frames.size).toBe(1);
  });

  it("disposes once on a final departure and cannot restart a disposed field", () => {
    field = mountEmptyParticleField(host);
    const renderer = rendererState.instances[0];
    transition("pagehide", false);
    field.cleanup();
    field.setActive(true);
    transition("pageshow", true);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.domElement.remove).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
