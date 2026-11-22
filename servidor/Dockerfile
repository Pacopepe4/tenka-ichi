# Imagen de la web de Tenka Ichi para el server casero. Se construye desde la raíz del repo
# (docker compose lo hace solo: ver servidor/docker-compose.yml).
# Debian (bookworm-slim) y no Alpine desde el 21/11/2026: el modelo de embeddings del contexto de los bots
# (server/contexto.js, con onnxruntime-node) necesita glibc.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# onnxruntime-node ya trae lo que hace falta para la CPU; que no intente bajar lo de CUDA
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# Aquí se guarda el modelo de embeddings (unos 130 MB, se baja la primera vez): es el volumen «modelos», y así no
# entra en las copias diarias de data/
RUN mkdir -p /app/modelos && chown node:node /app/modelos
ENV CONTEXTO_MODELOS=/app/modelos
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
