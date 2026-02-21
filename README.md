# singlepage-router

![npm version](https://img.shields.io/npm/v/singlepage-router)
![npm bundle size](https://img.shields.io/bundlephobia/minzip/singlepage-router)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![license](https://img.shields.io/npm/l/singlepage-router)
![build](https://img.shields.io/github/actions/workflow/status/filiperak/singlepage/build.yml?branch=main)

A micro client-side router with a clean TypeScript rewrite. Full `History` and `hashbang` support, zero runtime dependencies beyond `path-to-regexp`, and a modern dual ESM/CJS build system.

---

## Installation

```bash
npm install singlepage-router

---

## Quick Start

```ts
import singlepage from 'singlepage-router';

singlepage('/', () => render('home'));
singlepage('/users', () => render('users'));
singlepage('/users/:id', (ctx) => render('user', ctx.params.id));
singlepage('*', () => render('404'));

singlepage(); // start the router
```

---

## Usage

### Basic routes

```ts
import singlepage from 'singlepage-router';

singlepage('/', (ctx, next) => {
  console.log('home', ctx.pathname);
});

singlepage('/about', (ctx, next) => {
  console.log('about page');
});

singlepage(); // start
```

### Route parameters

```ts
singlepage('/users/:id', (ctx) => {
  const { id } = ctx.params;
  console.log('user id:', id);
});

singlepage('/posts/:year/:month/:slug', (ctx) => {
  const { year, month, slug } = ctx.params;
  console.log(`Post: ${slug} from ${month}/${year}`);
});
```

### Middleware / chaining handlers

Handlers receive a `next` function. Call it to pass control to the next matching handler, just like Express middleware.

```ts
import singlepage, { Context } from 'singlepage-router';

function authenticate(ctx: Context, next: () => void) {
  if (!isLoggedIn()) return singlepage.show('/login');
  next();
}

function loadUser(ctx: Context, next: () => void) {
  ctx.state.user = fetchUser(ctx.params.id);
  next();
}

function renderProfile(ctx: Context) {
  render('profile', ctx.state.user);
}

singlepage('/profile/:id', authenticate, loadUser, renderProfile);
```

### Wildcard / catch-all

```ts
singlepage('*', (ctx) => {
  console.log('no route matched:', ctx.path);
  render('404');
});
```

### Redirects

```ts
// Declarative redirect — from one path to another
singlepage.redirect('/old-path', '/new-path');

// Imperative redirect from inside a handler
singlepage('/legacy', () => {
  singlepage.redirect('/modern');
});
```

### Navigate programmatically

```ts
// Push a new history entry
singlepage.show('/users/42');

// Replace the current history entry (no new entry added)
singlepage.replace('/users/42');

// Go back — falls back to a path if there is no history
singlepage.back('/home');
```

### Exit handlers

Exit handlers run when navigating *away* from a route. Useful for teardown, unsaved-change guards, or cancelling in-flight requests.

```ts
singlepage('/editor', (ctx) => {
  startEditor();
});

singlepage.exit('/editor', (ctx, next) => {
  if (hasUnsavedChanges()) {
    if (!confirm('Leave without saving?')) return;
  }
  stopEditor();
  next();
});
```

### Hashbang mode

For environments that can't use the HTML5 History API (e.g. `file://` protocol):

```ts
singlepage.start({ hashbang: true });

// URLs will look like: /#!/users/42
```

### Base path

If your app is not served from the root, set a base path:

```ts
singlepage.base('/my-app');

singlepage('/dashboard', () => render('dashboard'));
// Matches: /my-app/dashboard

singlepage();
```

### Multiple isolated instances

```ts
import { createPage } from 'singlepage-router';

const adminRouter = createPage();
const publicRouter = createPage();

adminRouter('/dashboard', () => { /* ... */ });
publicRouter('/home', () => { /* ... */ });

adminRouter();
publicRouter();
```

### Accessing the Context object

Every handler receives a `Context` instance with the following properties:

| Property        | Type                              | Description                              |
|-----------------|-----------------------------------|------------------------------------------|
| `path`          | `string`                          | The path without base                    |
| `canonicalPath` | `string`                          | The full path including base             |
| `pathname`      | `string`                          | Path without querystring or hash         |
| `querystring`   | `string`                          | Querystring without the leading `?`      |
| `hash`          | `string`                          | Hash fragment without the `#`            |
| `params`        | `Record<string, string>`          | Matched route parameters                 |
| `state`         | `Record<string, unknown>`         | Arbitrary state stored in history entry  |
| `handled`       | `boolean`                         | Whether the context was handled          |
| `routePath`     | `string`                          | The route pattern that matched           |

```ts
singlepage('/search', (ctx) => {
  console.log(ctx.querystring); // "q=typescript&page=2"
  console.log(ctx.hash);        // "results"
  console.log(ctx.state);       // any state passed via singlepage.show()
});
```

---

## API Reference

### `singlepage(path, ...handlers)`
Register a route.

### `singlepage()` / `singlepage.start(options?)`
Start the router. Dispatches the current URL immediately.

| Option               | Type      | Default | Description                                      |
|----------------------|-----------|---------|--------------------------------------------------|
| `dispatch`           | `boolean` | `true`  | Dispatch the current route on start              |
| `click`              | `boolean` | `true`  | Intercept link clicks automatically              |
| `popstate`           | `boolean` | `true`  | Listen to `popstate` events                      |
| `hashbang`           | `boolean` | `false` | Use `#!` URLs instead of History API             |
| `decodeURLComponents`| `boolean` | `true`  | Decode URL params and querystrings               |
| `window`             | `Window`  | `window`| Use a custom window object                       |

### `singlepage.stop()`
Unbind all event listeners and stop the router.

### `singlepage.show(path, state?, dispatch?, push?)`
Navigate to `path`, pushing a new history entry.

### `singlepage.replace(path, state?, init?, dispatch?)`
Navigate to `path`, replacing the current history entry.

### `singlepage.back(fallback?, state?)`
Go back in history. If no history exists, navigates to `fallback`.

### `singlepage.redirect(from, to?)`
Register a redirect from one path to another, or immediately redirect to a path.

### `singlepage.base(path?)`
Get or set the base path.

### `singlepage.strict(enable?)`
Get or set strict trailing-slash matching.

### `singlepage.exit(path, ...handlers)`
Register exit handlers for a route.

### `singlepage.configure(options)`
Reconfigure the router after start.

### `createPage()`
Create a new isolated router instance.

---

## Project Structure

```
your-project/
├── src/
│   └── page.ts
├── scripts/
│   └── fix-cjs-ext.mjs
├── dist/                    ← generated, do not edit
│   ├── esm/page.js
│   ├── cjs/page.cjs
│   └── types/page.d.ts
├── package.json
├── tsconfig.json
├── tsconfig.esm.json
├── tsconfig.cjs.json
└── tsconfig.types.json
```

---

## Building

```bash
npm install
npm run build
```

Individual build steps:

```bash
npm run build:esm    # ESM output → dist/esm/
npm run build:cjs    # CJS output → dist/cjs/
npm run build:types  # Type declarations → dist/types/
```

---

## License

MIT