import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
  });
}
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

Object.defineProperty(globalThis, "self", {
  configurable: true,
  value: dom.window,
});

// JSDOM lacks the dialog lifecycle. Native modal inertness/Tab behavior needs a browser.
Object.defineProperties(dom.window.HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  },
  close: {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  },
});
