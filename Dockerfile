# ---------- 阶段一：前端构建 ----------
FROM node:20-alpine AS webbuild
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 阶段二：后端构建 ----------
FROM node:20-alpine AS serverbuild
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ---------- 阶段三：生产运行时 ----------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# 仅安装后端生产依赖
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# 拷贝构建产物
COPY --from=serverbuild /build/server/dist ./server/dist
COPY --from=webbuild /build/web/dist ./web/dist

# 非 root 运行
RUN chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
