/**
 * UI Test Setup — jsdom environment for React Testing Library tests.
 *
 * Run: npx tsx test/ui/setup.ts
 */

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://localhost',
  pretendToBeVisual: true,
});

(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;

const g = globalThis as any;
try { g.navigator = dom.window.navigator; } catch { Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true }); }

g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
g.HTMLButtonElement = dom.window.HTMLButtonElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.getComputedStyle = dom.window.getComputedStyle;
g.CustomEvent = dom.window.CustomEvent;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.FocusEvent = dom.window.FocusEvent;
g.ClipboardEvent = dom.window.ClipboardEvent;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
g.cancelAnimationFrame = clearTimeout;
g.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.matchMedia = (query: string) => ({
  matches: query === '(prefers-reduced-motion: reduce)' ? false : false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// Canvas mock for QR code tests
const createCanvasMock = () => ({
  fillStyle: '',
  strokeStyle: '',
  fillRect() {},
  clearRect() {},
  getImageData() { return { data: new Uint8ClampedArray(0) }; },
  putImageData() {},
  setTransform() {},
  resetTransform() {},
});

const origGetContext = dom.window.HTMLCanvasElement.prototype.getContext;
dom.window.HTMLCanvasElement.prototype.getContext = function (contextType: string) {
  if (contextType === '2d') return createCanvasMock() as any;
  return origGetContext.call(this, contextType);
};
