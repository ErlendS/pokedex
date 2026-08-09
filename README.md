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

Rooms and scores are held in server memory and last for the host connection.
The current Fly deployment runs a single machine, so all players in a match
connect to the same WebSocket server.

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
