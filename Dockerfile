# syntax=docker/dockerfile:1

# ---- deps: instala dependências (cache isolado do restante do código) ----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: gera o build standalone do Next.js ----
FROM node:22-alpine AS builder
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Variáveis NEXT_PUBLIC_* são inlineadas no bundle client durante o build —
# diferente das demais envs, precisam chegar aqui via --build-arg (ver
# docker-compose.yml -> build.args), não apenas em runtime.
ARG NEXT_PUBLIC_UI_STYLE
ARG NEXT_PUBLIC_SHOWCASE_ENABLED
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_UI_STYLE=$NEXT_PUBLIC_UI_STYLE
ENV NEXT_PUBLIC_SHOWCASE_ENABLED=$NEXT_PUBLIC_SHOWCASE_ENABLED
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---- runner: imagem final, somente o necessário para executar ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
