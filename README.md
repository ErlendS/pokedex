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

A display host creates a room and shows a five-character join code and QR code.
Players scan the QR code (or enter the code), choose a name, and compete to
identify the same Pokemon. Faster correct answers earn more points. The host is
not a player: it shows the shared Three.js scene, timer, answer, and scoreboard.
Joined phones are lightweight controllers with only the join and guess inputs;
the server withholds Pokemon artwork, type data, cries, and answers from them.

Rooms and scores are held in server memory and remain active while a controller,
Cast display, or player is connected. The current Fly deployment runs a single
machine, so all clients in a match connect to the same WebSocket server.

### Google Cast receiver

Versus includes a complete Custom Web Receiver at:

```text
https://pokedex.flawed.tech/cast
```

The computer that creates the room is a display-only host. The Cast receiver can
join the same room as an additional display, rendering the shared Three.js
scene, join QR code, timer, answer reveal, and scoreboard. Phones continue to
join through the normal QR link and act only as guessing controllers.

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
