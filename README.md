# Animal Sketch Playground

A browser-first sketch playground for Animal Sketch Classifier V4. Visitors draw
one animal, and ONNX Runtime Web classifies a normalized 64x64 version of the
sketch entirely in their browser.

## Stack

- React, TypeScript, and Vite
- Canvas 2D drawing surface with Pointer Events
- ONNX Runtime Web with the WebAssembly execution provider
- Static Nginx container for homelab deployment

The site serves a 6.79 MB ONNX artifact locally and evaluates it on the
visitor's device. Visitors can choose once whether to share anonymous sketches.
For opted-in visitors, a candidate is saved after inference; optional feedback
can later upgrade that candidate to a user-confirmed or user-corrected label.

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
mkdir -p secrets
printf '%s' 'choose-a-password' > secrets/admin_password.txt
docker compose up --build -d
curl http://localhost:8080/healthz
```

See [deployment notes](docs/deployment.md) for a reverse-proxy deployment.

## Dataset collection

Contributions are stored in the Docker volume `animal-sketch-dataset-data` as
SQLite metadata, normalized 64x64 PNG model inputs, and raw normalized stroke
JSON. Each example is `pending`; no collected example is used for training
automatically. `label_source` distinguishes `model_candidate`,
`user_confirmed`, `user_corrected`, and `user_rejected_unlabeled` records.

Open `/admin` to sign in and inspect submissions. The dashboard can export
filtered metadata as CSV or a ZIP containing `metadata.csv`, `images/`, and
`strokes/`. The password is read from `secrets/admin_password.txt`, which is
ignored by Git. It is hashed in memory with scrypt every time the dataset API
starts; the plaintext secret is never stored in SQLite.

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
