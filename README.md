# 3DCellForge

[English](README.md) | [中文](README.zh-CN.md)

AI-powered interactive 3D cell generation and exploration studio.

3DCellForge is a React + Three.js prototype for exploring biological cell models in a polished browser UI. It supports live WebGL orbit controls, organelle panels, screenshots, GLB export, and optional image-to-3D providers for generating real 3D models from uploaded reference images.

## Demo

[![3DCellForge demo](docs/demo/3DCellForge-demo-cover.jpg)](docs/demo/3DCellForge-demo-2026-05-10.mp4)

Open the demo video: [3DCellForge-demo-2026-05-10.mp4](docs/demo/3DCellForge-demo-2026-05-10.mp4)

## Features

- Interactive cell viewer built with React Three Fiber.
- Drag to rotate, scroll to zoom, and toggle 3D proof mode.
- Organelle detail cards, microscope references, comparison panel, notes, and gallery actions.
- Tripo cloud image-to-3D pipeline through a local Node backend.
- Hunyuan3D local provider support as a backup generation path.
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
- Hunyuan3D local API optional backend

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Optional Image-to-3D Backend

To enable image-to-3D generation, create `.env.local`:

```bash
cp .env.example .env.local
```

Then set:

```bash
TRIPO_API_KEY=your_tripo_key
```

For Hunyuan3D local backup mode, start your local Hunyuan3D API server and set:

```bash
HUNYUAN_API_BASE=http://127.0.0.1:8081
HUNYUAN_CREATE_PATH=/send
HUNYUAN_STATUS_PATH=/status
```

The 3D generation backend supports these provider paths:

```text
Tripo   Cloud generation only (default)
Auto    Tripo first, Hunyuan backup
Hunyuan Local Hunyuan3D generation only
```

The upload panel exposes the full generation mode choice before picking a file:

```text
Tripo       Cloud GLB generation
Hunyuan     Local Hunyuan3D GLB generation
Cinematic   Layered transparent PNG composition for high-quality demos
Auto        Tripo, then Hunyuan, then Cinematic fallback
Local GLB   Import an existing .glb or self-contained .gltf
```

Tripo uploads use the current STS object-storage flow (`/upload/sts/token`) before creating an `image_to_model` task.
Generated GLBs are cached by the Node backend under `.generated-models/`, so later views use the local copy instead of the temporary Tripo URL.

You can also import a local `.glb` or self-contained `.gltf` from the Microscope View add button. Imported models become custom Cell Types and are served from the same local cache.

Expected Hunyuan3D local API shape:

```text
POST /send
GET  /status/:uid
```

The status response can return either a remote model URL or a base64 GLB field such as `model_base64` / `glb_base64`. Base64 GLBs are cached under `.generated-models/` and served by the Node backend.

Start the backend:

```bash
npm run dev:api
```

Then start the frontend:

```bash
npm run dev
```

The frontend talks to the local Node backend at `http://127.0.0.1:8787` by default.

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
