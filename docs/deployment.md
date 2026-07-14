# Homelab deployment

The application is a static website. It does not need a database, GPU, model
server, writable volume, or outbound network access at runtime.

## Local container

```sh
docker compose up --build -d
curl http://localhost:8080/healthz
```

Open `http://localhost:8080` after the health endpoint returns `ok`.

## Reverse proxy

Expose the container only to the reverse proxy and terminate TLS there. For a
Caddy deployment, the relevant upstream is `animal-sketch-playground:8080`:

```caddyfile
sketch.example.com {
    reverse_proxy animal-sketch-playground:8080
}
```

Use the published GHCR image after the first Git tag:

```yaml
services:
  playground:
    image: ghcr.io/morpknight/animal-sketch-playground:latest
    restart: unless-stopped
    expose:
      - "8080"
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
```

Pin a version tag or image digest for a stable deployment. The container sets
security headers and serves a `/healthz` endpoint; the reverse proxy remains
responsible for the public hostname and TLS certificates.
