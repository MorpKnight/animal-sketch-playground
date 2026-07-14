FROM node:22-alpine

WORKDIR /app

COPY server.mjs labels.mjs ./

ENV DATA_DIR=/data
ENV PORT=3000

RUN mkdir /data && chown node:node /data

VOLUME ["/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

USER node

CMD ["node", "server.mjs"]
