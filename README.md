# 3DCellForge

AI-powered interactive 3D cell generation and exploration studio.

3DCellForge is a React + Three.js prototype for exploring biological cell models in a polished browser UI. It supports live WebGL orbit controls, organelle panels, screenshots, GLB export, and an optional Tripo image-to-3D backend for generating real 3D models from uploaded reference images.

## Features

- Interactive cell viewer built with React Three Fiber.
- Drag to rotate, scroll to zoom, and toggle 3D proof mode.
- Organelle detail cards, microscope references, comparison panel, notes, and gallery actions.
- Tripo image-to-3D pipeline through a local Node backend.
- Cached demo GLB models for offline-friendly screenshots and demos.
- API key stays server-side in `.env.local`; it is never exposed to the frontend bundle.

## Tech Stack

- React
- Vite
- Three.js
- React Three Fiber
- Drei
- Framer Motion
- Tripo API optional backend

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Optional Tripo Backend

To enable image-to-3D generation, create `.env.local`:

```bash
cp .env.example .env.local
```

Then set:

```bash
TRIPO_API_KEY=your_tripo_key
```

Start the backend:

```bash
npm run dev:api
```

Then start the frontend:

```bash
npm run dev
```

The frontend talks to the local backend at `http://127.0.0.1:8787` by default.

## Demo Models

The repository includes cached generated GLB files under:

```text
public/generated-models/
```

These make the demo usable without spending API credits on every run.

## Security

Do not put real API keys in frontend code. Keep secrets in `.env.local`, which is ignored by git.

## License

MIT
