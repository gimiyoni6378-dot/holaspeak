FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js domain.js store.js ./
ENV NODE_ENV=production
CMD ["npm", "start"]
