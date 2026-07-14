# Animal Sketch Playground

A browser-first sketch playground for Animal Sketch Classifier V4. Visitors draw
one animal, and ONNX Runtime Web classifies a normalized 64x64 version of the
sketch entirely in their browser.

## Stack

- React, TypeScript, and Vite
- Canvas 2D drawing surface with Pointer Events
- ONNX Runtime Web with the WebAssembly execution provider
- Static Nginx container for homelab deployment

The site does not upload drawings or send them to an inference API. It serves a
6.79 MB ONNX artifact locally with the site, then evaluates it on the visitor's
device.

## Run locally

```sh
npm install
npm run dev
```

Run validation:

```sh
npm run lint
npm run test
npm run build
```

## Docker

```sh
docker compose up --build -d
curl http://localhost:8080/healthz
```

See [deployment notes](docs/deployment.md) for a reverse-proxy deployment.

## Model

The browser artifact is `public/models/animal-species-v4.onnx`. It is exported
from the V4 checkpoint without retraining; its local export parity test has 24
of 24 matching top-1 predictions against PyTorch and a maximum probability
delta of `3.28e-7`.

The training pipeline and original Core ML package are available at
[MorpKnight/animal-sketch-coreml](https://github.com/MorpKnight/animal-sketch-coreml).
The model package is also documented on
[Hugging Face](https://huggingface.co/morpknight/animal-sketch-classifier-coreml).

`MODEL_NOTICE.md` contains the Quick Draw attribution and model-license notice.
The code in this repository is MIT licensed; the model artifact remains CC BY
4.0.
