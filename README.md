# Pokedex

A small interactive Pokedex built with React, Three.js, and Vite.

## Development

This project uses Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

The Vite development server is sufficient for the regular Pokedex UI. Versus
Mode also needs the WebSocket server. To run the complete production-shaped
app locally:

```sh
pnpm build
PORT=8080 pnpm start
```

## Versus Mode

A host creates a room and displays a five-character join code and QR code.
Players scan the QR code (or enter the code), choose a name, and compete to
identify the same Pokemon. Faster correct answers earn more points. Versus uses
the same Three.js landscape and Pokedex model as the lookup and solo game modes;
each synchronized round appears as a silhouette in the shared 3D scene.

Rooms and scores are held in server memory and remain active while a controller,
Cast display, or player is connected. The current Fly deployment runs a single
machine, so all clients in a match connect to the same WebSocket server.

### Google Cast receiver

Versus includes a complete Custom Web Receiver at:

```text
https://pokedex.flawed.tech/cast
```

The phone that creates the room is both the match controller and a player. The
Cast receiver joins the same room as a display-only client, renders the shared
Three.js scene, join QR code, timer, answer reveal, and scoreboard. Other phones
continue to join through the normal QR link.

The sender is configured with Cast application ID `9DF86F21`. To enable it
after this code is deployed:

1. Create a **Custom Receiver** in the
   [Google Cast SDK Developer Console](https://cast.google.com/publish/).
2. Use `https://pokedex.flawed.tech/cast` as its receiver URL.
3. Upload `public/cast-app-icon-512.png` as the 512×512 application icon.

No environment variable, frontend rebuild, or additional code change is
required. The Node server exposes the ID through `/api/cast-config`.
The sender and receiver communicate on
`urn:x-cast:tech.flawed.pokedex.versus`; gameplay state continues to travel
through the existing `/versus` WebSocket connection.

For unpublished testing, register the physical Cast device in the same Cast
Developer Console account. `/cast?room=ABCDE` is also available as a browser
debug route and is covered by the end-to-end suite; production Cast launches
use the SDK message channel instead of a room code in the receiver URL.

Before pushing a change:

```sh
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## Deployment

The site is hosted on Fly.io at [pokedex.flawed.tech](https://pokedex.flawed.tech).

Pushes to `main` are checked and deployed by GitHub Actions. The workflow uses
the app-scoped Fly.io deploy token stored in the `FLY_API_TOKEN` repository
secret.
