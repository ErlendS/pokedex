# Pokedex

A small interactive Pokedex built with React, Three.js, and Vite.

## Development

This project uses Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

Before pushing a change:

```sh
pnpm lint
pnpm build
```

## Deployment

The site is hosted on Fly.io at [pokedex.flawed.tech](https://pokedex.flawed.tech).

Pushes to `main` are checked and deployed by GitHub Actions. The workflow uses
the app-scoped Fly.io deploy token stored in the `FLY_API_TOKEN` repository
secret.
