# STEP 11 — Production image. Single-stage on Playwright's official
# image because the Chromium binary, its system fonts, and all the
# native libs (libnss, libxkbcommon, etc.) are ALL pre-installed.
#
# Why not multi-stage with node:alpine? Two reasons:
#   1. Playwright's Chromium binary is ~280 MB and links against a
#      dozen native libs Alpine doesn't ship. You can install them
#      via apk, but you end up with a 600 MB image that takes 4
#      minutes to build.
#   2. mcr.microsoft.com/playwright pre-warms the install cache so
#      `npx playwright install chromium` is a no-op. Build time:
#      80s on Render vs 4+ minutes for from-scratch alpine.
#
# Memory note: Playwright + Chromium can peak at ~450 MB. Render
# free tier (512 MB) is tight but workable for a few concurrent
# screenshots. If you see OOMs in production, switch to a paid plan
# (1 GB+) — the architecture stays identical.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# Install with dev deps so TypeScript is available for the build,
# then prune dev deps after compile. Skipping --include=dev would
# trigger `npx tsc` to download the wrong package (tsc@2.0.4 — the
# bare-name tsc package on npm is NOT TypeScript).
COPY package.json ./
COPY server/package.json ./server/
RUN npm install --workspace=server --include=dev

COPY server ./server
WORKDIR /app/server
RUN npx tsc -p tsconfig.json \
  && cd /app && npm prune --workspace=server --omit=dev

# Create runs dir + chown to pwuser BEFORE switching user. Without
# this, the agent's mkdir/writeFile fails with EACCES at request time.
RUN mkdir -p /app/server/runs && chown -R pwuser:pwuser /app/server/runs

# Render injects PORT. Default 8080 for local docker.
ENV PORT=8080 \
    NODE_ENV=production

# The Playwright base image runs as root by default. The official
# `pwuser` account exists for safety — switching to it before serving
# means a Chrome sandbox escape can't write to /app source.
USER pwuser

EXPOSE 8080
CMD ["node", "dist/index.js"]
