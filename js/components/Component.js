// components/Component.js — tiny base class every UI panel extends.
//
// Convention: a Component owns exactly one root DOM element (this.el), receives its
// shared dependencies (the AppState store, the BleConnection, the ToastManager) once via
// the constructor, and reacts to state changes by listening to AppState events — it never
// reaches into another component directly. That's what keeps each panel independently
// understandable: "what does this render, and what state changes make it re-render" is
// answerable by reading one file.

export class Component {
  constructor(el, deps = {}) {
    this.el = el;
    this.state = deps.state || null;
    this.ble = deps.ble || null;
    this.toasts = deps.toasts || null;
  }

  // Override in subclasses to wire DOM event listeners (button clicks, etc).
  bindEvents() {}

  // Override in subclasses to subscribe to AppState events that should trigger a re-render.
  bindState() {}

  // Override in subclasses to do the actual DOM rendering.
  render() {}

  // Call once after construction: init() -> bindEvents() -> bindState() -> render().
  init() {
    this.bindEvents();
    this.bindState();
    this.render();
    return this;
  }

  qs(selector) {
    return this.el.querySelector(selector);
  }

  qsa(selector) {
    return Array.from(this.el.querySelectorAll(selector));
  }
}
