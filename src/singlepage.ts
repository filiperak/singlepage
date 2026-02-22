import { pathToRegexp, Key } from 'path-to-regexp';

// ---------------------------------------------------------------------------
// Environment guards
// ---------------------------------------------------------------------------

const hasDocument = typeof document !== 'undefined';
const hasWindow = typeof window !== 'undefined';
const hasHistory = typeof history !== 'undefined';

const clickEvent: string =
  hasDocument && ('ontouchstart' in document) ? 'touchstart' : 'click';

const isLocation = hasWindow && !!window.location;
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageOptions {
  window?: Window & typeof globalThis;
  decodeURLComponents?: boolean;
  popstate?: boolean;
  click?: boolean;
  hashbang?: boolean;
  dispatch?: boolean;
}

export type Callback = (ctx: Context, next: () => void) => void;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export class Context {
  public readonly page: PageInstance;
  public canonicalPath: string;
  public path: string;
  public title: string;
  public state: Record<string, unknown>;
  public querystring: string;
  public pathname: string;
  public params: Record<string, string | undefined>;
  public hash: string;
  public handled: boolean = true;
  public init: boolean = false;
  public routePath: string = '';

  constructor(path: string, state: Record<string, unknown> | undefined, pageInstance: PageInstance) {
    this.page = pageInstance;
    const win = pageInstance.getWindow();
    const hashbang = pageInstance.isHashbang();
    const pageBase = pageInstance.getBase();

    if (path[0] === '/' && path.indexOf(pageBase) !== 0) {
      path = pageBase + (hashbang ? '#!' : '') + path;
    }

    const i = path.indexOf('?');

    this.canonicalPath = path;
    const re = new RegExp('^' + escapeRegExp(pageBase));
    this.path = path.replace(re, '') || '/';
    if (hashbang) this.path = this.path.replace('#!', '') || '/';

    this.title = hasDocument && win ? win.document.title : '';
    this.state = state ?? {};
    this.state['path'] = path;
    this.querystring = ~i
      ? pageInstance.decodeURLComponent(path.slice(i + 1))
      : '';
    this.pathname = pageInstance.decodeURLComponent(~i ? path.slice(0, i) : path);
    this.params = {};
    this.hash = '';

    if (!hashbang) {
      if (!~this.path.indexOf('#')) return;
      const parts = this.path.split('#');
      this.path = this.pathname = parts[0];
      this.hash = pageInstance.decodeURLComponent(parts[1]) || '';
      this.querystring = this.querystring.split('#')[0];
    }
  }

  pushState(): void {
    const page = this.page;
    const win = page.getWindow();
    if (!win) return;
    page.incrementLen();
    if (hasHistory) {
      win.history.pushState(
        this.state,
        this.title,
        page.isHashbang() && this.path !== '/' ? '#!' + this.path : this.canonicalPath
      );
    }
  }

  save(): void {
    const page = this.page;
    const win = page.getWindow();
    if (!win) return;
    if (hasHistory) {
      win.history.replaceState(
        this.state,
        this.title,
        page.isHashbang() && this.path !== '/' ? '#!' + this.path : this.canonicalPath
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export class Route {
  public readonly path: string;
  public readonly regexp: RegExp;
  public readonly keys: Key[];
  private readonly page: PageInstance;

  constructor(path: string, options: { sensitive?: boolean; strict?: boolean } = {}, pageInstance: PageInstance) {
    this.page = pageInstance;
    const opts = {
      sensitive: options.sensitive ?? false,
      strict: options.strict ?? pageInstance.isStrict(),
    };
    this.path = path === '*' ? '(.*)' : path;
    this.keys = [];
    this.regexp = pathToRegexp(this.path, this.keys, opts);
  }

  middleware(fn: Callback): Callback {
    return (ctx: Context, next: () => void) => {
      if (this.match(ctx.path, ctx.params)) {
        ctx.routePath = this.path;
        fn(ctx, next);
        return;
      }
      next();
    };
  }

  match(path: string, params: Record<string, string | undefined>): boolean {
    const qsIndex = path.indexOf('?');
    const pathname = ~qsIndex ? path.slice(0, qsIndex) : path;
    const m = this.regexp.exec(decodeURIComponent(pathname));

    if (!m) return false;

    delete params[0];

    for (let i = 1; i < m.length; i++) {
      const key = this.keys[i - 1];
      const val = this.page.decodeURLComponent(m[i]);
      if (val !== undefined || !Object.prototype.hasOwnProperty.call(params, key.name)) {
        params[String(key.name)] = val;
      }
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// PageInstance
// ---------------------------------------------------------------------------

export class PageInstance {
  public callbacks: Callback[] = [];
  public exits: Callback[] = [];
  public current: string = '';
  public len: number = 0;
  public prevContext: Context | undefined;

  private _decodeURLComponents: boolean = true;
  private _base: string = '';
  private _strict: boolean = false;
  private _running: boolean = false;
  private _hashbang: boolean = false;
  private _window: (Window & typeof globalThis) | undefined;
  private _popstate: boolean = true;
  private _click: boolean = true;

  private readonly _clickHandler: (e: MouseEvent | TouchEvent) => void;
  private readonly _onpopstate: (e: PopStateEvent) => void;

  constructor() {
    this._clickHandler = this.clickHandler.bind(this);
    this._onpopstate = createPopstateHandler(this);
  }

  // -------------------------------------------------------------------------
  // Accessors used by Context / Route
  // -------------------------------------------------------------------------

  getWindow(): (Window & typeof globalThis) | undefined {
    return this._window;
  }

  getBase(): string {
    return this._getBase();
  }

  isHashbang(): boolean {
    return this._hashbang;
  }

  isStrict(): boolean {
    return this._strict;
  }

  incrementLen(): void {
    this.len++;
  }

  decodeURLComponent(val: string | undefined): string {
    return this._decodeURLEncodedURIComponent(val ?? '');
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  configure(options: PageOptions = {}): void {
    this._window = options.window ?? (hasWindow ? window : undefined);
    this._decodeURLComponents = options.decodeURLComponents !== false;
    this._popstate = options.popstate !== false && hasWindow;
    this._click = options.click !== false && hasDocument;
    this._hashbang = !!options.hashbang;

    const win = this._window;
    if (!win) return;

    if (this._popstate) {
      win.addEventListener('popstate', this._onpopstate as EventListener, false);
    } else {
      win.removeEventListener('popstate', this._onpopstate as EventListener, false);
    }

    if (this._click) {
      win.document.addEventListener(clickEvent, this._clickHandler as EventListener, false);
    } else {
      win.document.removeEventListener(clickEvent, this._clickHandler as EventListener, false);
    }

    if (this._hashbang && hasWindow && !hasHistory) {
      win.addEventListener('hashchange', this._onpopstate as EventListener, false);
    } else {
      win.removeEventListener('hashchange', this._onpopstate as EventListener, false);
    }
  }

  base(path?: string): string | void {
    if (path === undefined) return this._base;
    this._base = path;
  }

  strict(enable?: boolean): boolean | void {
    if (enable === undefined) return this._strict;
    this._strict = enable;
  }

  start(options: PageOptions = {}): void {
    this.configure(options);
    if (options.dispatch === false) return;

    this._running = true;

    if (!isLocation) return;
    const win = this._window!;
    const loc = win.location;

    let url: string;
    if (this._hashbang && loc.hash.includes('#!')) {
      url = loc.hash.slice(2) + loc.search;
    } else if (this._hashbang) {
      url = loc.search + loc.hash;
    } else {
      url = loc.pathname + loc.search + loc.hash;
    }

    this.replace(url, undefined, true, true);
  }

  stop(): void {
    if (!this._running) return;
    this.current = '';
    this.len = 0;
    this._running = false;
    this.prevContext = undefined; 

    const win = this._window;
    if (!win) return;

    win.document.removeEventListener(clickEvent, this._clickHandler as EventListener, false);
    win.removeEventListener('popstate', this._onpopstate as EventListener, false);
    win.removeEventListener('hashchange', this._onpopstate as EventListener, false);
  }

  show(path: string, state?: Record<string, unknown>, dispatch = true, push = true): Context {
    const ctx = new Context(path, state, this);
    const prev = this.prevContext;
    this.prevContext = ctx;
    this.current = ctx.path;
    if (dispatch) this.dispatch(ctx, prev);
    if (ctx.handled && push) ctx.pushState();
    return ctx;
  }

  back(path?: string, state?: Record<string, unknown>): void {
    if (this.len > 0) {
      hasHistory && this._window?.history.back();
      this.len--;
    } else if (path) {
      setTimeout(() => this.show(path, state));
    } else {
      setTimeout(() => this.show(this._getBase(), state));
    }
  }

  redirect(from: string, to?: string): void {
    if (typeof to === 'string') {
      this.register(from, (_ctx, _next) => {
        setTimeout(() => this.replace(to), 0);
      });
      return;
    }
    // Called with only one arg — redirect to that path immediately
    setTimeout(() => this.replace(from), 0);
  }

  replace(path: string, state?: Record<string, unknown>, init = false, dispatch = true): Context {
    const ctx = new Context(path, state, this);
    const prev = this.prevContext;
    this.prevContext = ctx;
    this.current = ctx.path;
    ctx.init = init;
    ctx.save();
    if (dispatch) this.dispatch(ctx, prev);
    return ctx;
  }

  dispatch(ctx: Context, prev?: Context): void {
    let i = 0;
    let j = 0;

    const nextExit = (): void => {
      const fn = this.exits[j++];
      if (!fn) return nextEnter();
      fn(prev!, nextExit);
    };

    const nextEnter = (): void => {
      const fn = this.callbacks[i++];
      if (ctx.path !== this.current) {
        ctx.handled = false;
        return;
      }
      if (!fn) return unhandled.call(this, ctx);
      fn(ctx, nextEnter);
    };

    if (prev) {
      nextExit();
    } else {
      nextEnter();
    }
  }

  /** Register a route handler */
  register(path: string | Callback, ...fns: Callback[]): void {
    if (typeof path === 'function') {
      this.register('*', path, ...fns);
      return;
    }
    const route = new Route(path, undefined, this);
    const handlers = fns.length ? fns : [];
    for (const fn of handlers) {
      this.callbacks.push(route.middleware(fn));
    }
  }

  exit(path: string | Callback, ...fns: Callback[]): void {
    if (typeof path === 'function') {
      this.exit('*', path, ...fns);
      return;
    }
    const route = new Route(path, undefined, this);
    const handlers = fns.length ? fns : [];
    for (const fn of handlers) {
      this.exits.push(route.middleware(fn));
    }
  }

  sameOrigin(href: string): boolean {
    if (!href || !isLocation) return false;
    const url = this._toURL(href);
    if (!url) return false;
    const loc = this._window!.location;
    return (
      loc.protocol === url.protocol &&
      loc.hostname === url.hostname &&
      (loc.port === url.port ||
        (loc.port === '' && (Number(url.port) === 80 || Number(url.port) === 443)))
    );
  }

  clickHandler(e: MouseEvent | TouchEvent): void {
    if (this._which(e) !== 1) return;
    const me = e as MouseEvent;
    if (me.metaKey || me.ctrlKey || me.shiftKey) return;
    if (e.defaultPrevented) return;

    // Resolve the closest <a> element, accounting for shadow DOM
    let el: Element | null = e.target as Element;
    const eventPath: EventTarget[] =
      (e as Event & { path?: EventTarget[] }).path ?? e.composedPath?.() ?? [];

    if (eventPath.length) {
      for (const node of eventPath) {
        const n = node as Element;
        if (!n.nodeName) continue;
        if (n.nodeName.toUpperCase() !== 'A') continue;
        if (!(n as HTMLAnchorElement).href) continue;
        el = n;
        break;
      }
    }

    while (el && el.nodeName.toUpperCase() !== 'A') {
      el = el.parentElement;
    }
    if (!el || el.nodeName.toUpperCase() !== 'A') return;

    const anchor = el as HTMLAnchorElement;
    const isSvg =
      typeof anchor.href === 'object' &&
      (anchor.href as any).constructor?.name === 'SVGAnimatedString';

    if (anchor.hasAttribute('download') || anchor.getAttribute('rel') === 'external') return;

    const link = anchor.getAttribute('href');
    if (!this._hashbang && this._samePath(anchor) && (anchor.hash || link === '#')) return;
    if (link?.includes('mailto:')) return;

    const target = isSvg ? (anchor.target as any).baseVal : anchor.target;
    if (target) return;

    if (!isSvg && !this.sameOrigin(anchor.href)) return;

    let path: string = isSvg
      ? (anchor.href as any).baseVal
      : anchor.pathname + anchor.search + (anchor.hash || '');

    if (path[0] !== '/') path = '/' + path;

    const orig = path;
    const pageBase = this._getBase();

    if (path.startsWith(pageBase)) {
      path = path.slice(pageBase.length);
    }

    if (this._hashbang) path = path.replace('#!', '');

    if (
      pageBase &&
      orig === path &&
      (!isLocation || this._window!.location.protocol !== 'file:')
    ) {
      return;
    }

    e.preventDefault();
    this.show(orig);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _getBase(): string {
    if (this._base) return this._base;
    const loc = hasWindow && this._window?.location;
    if (hasWindow && this._hashbang && loc && loc.protocol === 'file:') {
      return loc.pathname;
    }
    return '';
  }

  private _toURL(href: string): URL | HTMLAnchorElement | undefined {
    const win = this._window;
    if (!win) return undefined;
    if (typeof URL === 'function' && isLocation) {
      return new URL(href, win.location.toString());
    }
    const anc = win.document.createElement('a');
    anc.href = href;
    return anc;
  }

  private _samePath(url: HTMLAnchorElement): boolean {
    if (!isLocation) return false;
    const loc = this._window!.location;
    return url.pathname === loc.pathname && url.search === loc.search;
  }

  private _which(e: MouseEvent | TouchEvent): number {
    const me = e as MouseEvent;
    return me.which == null ? me.button : me.which;
  }

  private _decodeURLEncodedURIComponent(val: string): string {
    if (typeof val !== 'string') return val;
    return this._decodeURLComponents
      ? decodeURIComponent(val.replace(/\+/g, ' '))
      : val;
  }
}

// ---------------------------------------------------------------------------
// Popstate handler factory (mirrors the IIFE in the original)
// ---------------------------------------------------------------------------

function createPopstateHandler(pageInstance: PageInstance) {
  let loaded = false;

  if (!hasWindow) return () => {};

  if (hasDocument && document.readyState === 'complete') {
    loaded = true;
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => { loaded = true; }, 0);
    });
  }

  return function onpopstate(this: PageInstance, e: PopStateEvent): void {
    if (!loaded) return;
    if (e.state && typeof e.state === 'object') {
      const state = e.state as Record<string, unknown>;
      pageInstance.replace(state['path'] as string, state);
    } else if (isLocation) {
      const loc = pageInstance.getWindow()!.location;
      pageInstance.show(loc.pathname + loc.search + loc.hash, undefined, undefined, false);
    }
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/([.+*?=^!:${}()[\]|/\\])/g, '\\$1');
}

function unhandled(this: PageInstance, ctx: Context): void {
  if (ctx.handled) return;
  const win = this.getWindow();
  if (!win) return;

  let current: string;
  if (this.isHashbang()) {
    current = isLocation
      ? this.getBase() + win.location.hash.replace('#!', '')
      : '';
  } else {
    current = isLocation ? win.location.pathname + win.location.search : '';
  }

  if (current === ctx.canonicalPath) return;
  this.stop();
  ctx.handled = false;
  if (isLocation) win.location.href = ctx.canonicalPath;
}

// ---------------------------------------------------------------------------
// Public factory & callable page function
// ---------------------------------------------------------------------------

export interface PageFunction {
  (path: string | Callback, ...fns: Callback[]): void;
  /** Called with no args — starts the router */
  (): void;

  // Instance property mirrors
  callbacks: Callback[];
  exits: Callback[];
  current: string;
  len: number;

  // Bound methods
  base: PageInstance['base'];
  strict: PageInstance['strict'];
  start: PageInstance['start'];
  stop: PageInstance['stop'];
  show: PageInstance['show'];
  back: PageInstance['back'];
  redirect: PageInstance['redirect'];
  replace: PageInstance['replace'];
  dispatch: PageInstance['dispatch'];
  exit: PageInstance['exit'];
  configure: PageInstance['configure'];
  sameOrigin: PageInstance['sameOrigin'];
  clickHandler: PageInstance['clickHandler'];

  /** Create a new isolated page instance */
  create: () => PageFunction;

  Context: typeof Context;
  Route: typeof Route;
}

export function createPage(): PageFunction {
  const instance = new PageInstance();

  /**
   * The callable page function.
   * - page(fn)             → register wildcard handler
   * - page('/path', fn...) → register route handlers
   * - page('/path')        → navigate (show)
   * - page('/from', '/to') → redirect
   * - page()               → start
   * - page(options)        → start with options
   */
  const pageFn = Object.assign(
    function(
      path?: string | Callback | PageOptions,
      ...fns: (Callback | string)[]
    ): void {
      if (typeof path === 'function') {
        instance.register('*', path as Callback);
        return;
      }

      if (typeof path === 'string') {
        const callbacks = fns.filter((f): f is Callback => typeof f === 'function');
        if (callbacks.length) {
          instance.register(path, ...callbacks);
          return;
        }
        // string + string → redirect
        if (typeof fns[0] === 'string') {
          instance.redirect(path, fns[0] as string);
          return;
        }
        // string only → navigate
        instance.show(path);
        return;
      }

      // No args or options object → start
      instance.start((path as PageOptions | undefined) ?? {});
    },
    // All static properties assigned
    {
      callbacks:    instance.callbacks,
      exits:        instance.exits,
      base:         instance.base.bind(instance),
      strict:       instance.strict.bind(instance),
      start:        instance.start.bind(instance),
      stop:         instance.stop.bind(instance),
      show:         instance.show.bind(instance),
      back:         instance.back.bind(instance),
      redirect:     instance.redirect.bind(instance),
      replace:      instance.replace.bind(instance),
      dispatch:     instance.dispatch.bind(instance),
      exit:         instance.exit.bind(instance),
      configure:    instance.configure.bind(instance),
      sameOrigin:   instance.sameOrigin.bind(instance),
      clickHandler: instance.clickHandler.bind(instance),
      create:       createPage,
      Context,
      Route,
    }
  ) as unknown as PageFunction;

  Object.defineProperty(pageFn, 'current', {
    get: () => instance.current,
    set: (v: string) => { instance.current = v; },
  });

  Object.defineProperty(pageFn, 'len', {
    get: () => instance.len,
    set: (v: number) => { instance.len = v; },
  });

  return pageFn;
}

// ---------------------------------------------------------------------------
// Default export — a single shared instance, matching the original module API
// ---------------------------------------------------------------------------

const singlepage = createPage();

export default singlepage;