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
(globalThis as any).navigator = dom.window.navigator;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLCanvasElement = dom.window.HTMLCanvasElement;
(globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).CustomEvent = dom.window.CustomEvent;
(globalThis as any).Event = dom.window.Event;
(globalThis as any).MouseEvent = dom.window.MouseEvent;
(globalThis as any).KeyboardEvent = dom.window.KeyboardEvent;
(globalThis as any).FocusEvent = dom.window.FocusEvent;
(globalThis as any).ClipboardEvent = dom.window.ClipboardEvent;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
(globalThis as any).cancelAnimationFrame = clearTimeout;
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(globalThis as any).IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(globalThis as any).matchMedia = (query: string) => ({
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
