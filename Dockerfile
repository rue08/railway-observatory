# syntax=docker/dockerfile:1

# node:20-alpine — multi-arch, so this pulls the arm64 variant automatically
# when built on the Oracle Ampere VM. No stage split (builder vs runtime):
# nothing in package.json needs native compilation stripped out afterward,
# so the extra complexity wouldn't buy anything here.
FROM node:20-alpine

WORKDIR /app

# Separate from the full COPY below on purpose — this layer only
# invalidates (re-runs npm ci) when package.json/package-lock.json
# actually change, not on every source edit, so unrelated code changes
# reuse the cached node_modules layer.
COPY package.json package-lock.json ./
RUN npm ci

# schema.prisma has to exist before `prisma generate` can run. Copying the
# whole prisma/ dir, not just the schema file, so the migrations/ folder is
# already in the image too — docker-compose.yml's `command:` runs
# `prisma migrate deploy` at container startup, which needs it.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000

# Deliberately no default CMD here — api and worker (see docker-compose.yml)
# run different commands from this same image, each prefixed with
# `prisma migrate deploy`. Safe to run from both at once: Prisma's
# migration engine holds its own lock, so two containers starting
# simultaneously converge safely instead of racing each other.
