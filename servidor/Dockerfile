# Imagen de la web de Tenka Ichi para el server casero. Se construye desde la raíz del repo
# (docker compose lo hace solo: ver servidor/docker-compose.yml).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
