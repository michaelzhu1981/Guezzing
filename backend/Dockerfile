FROM m.daocloud.io/docker.io/library/node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM m.daocloud.io/docker.io/library/node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM m.daocloud.io/docker.io/library/node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3001
CMD ["npm", "run", "start"]
