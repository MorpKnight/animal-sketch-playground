# Homelab Deployment

The public `playground` container serves the React app and runs ONNX inference
in the visitor's browser. The private `dataset-api` container stores only
explicitly consented submissions. It is not exposed on a host port; Nginx
proxies same-origin `/api/` requests to it.

## First run

Create the local Docker secret before starting the stack. The file is ignored
by Git and mounted only into the dataset API container.

```sh
mkdir -p secrets
printf '%s' 'your-admin-password' > secrets/admin_password.txt
docker compose up --build -d
curl http://localhost:8080/healthz
```

Open `http://localhost:8080` after the health endpoint returns `ok`. The
protected dashboard is available at `/admin` on the same host.

## Data lifecycle

The named volume `animal-sketch-dataset-data` holds:

- `dataset.sqlite`: submission metadata and curation status.
- `images/<submission-id>.png`: exact normalized 64x64 model input.
- Raw normalized strokes in SQLite, included as JSON in the ZIP export.

Download a filtered snapshot from `/admin` as CSV or ZIP. The application
never trains on these submissions automatically; review and move approved data
to the training repository manually.

For an offline copy of the Docker volume:

```sh
docker run --rm -v animal-sketch-dataset-data:/data -v "$PWD":/backup alpine \
  tar -czf /backup/animal-sketch-dataset-backup.tar.gz -C /data .
```

## Reverse proxy

Expose only the `playground` container to the reverse proxy and terminate TLS
there. For Caddy, the relevant upstream is
`animal-sketch-playground:8080`:

```caddyfile
sketch.example.com {
    reverse_proxy animal-sketch-playground:8080
}
```

When serving HTTPS, forward `X-Forwarded-Proto: https`. The admin session
cookie then receives the `Secure` attribute. The app also sends COOP/COEP
headers required by ONNX Runtime's threaded WebAssembly runtime.
