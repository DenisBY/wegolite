# syntax=docker/dockerfile:1
#
# Wegolite — one multi-stage image (D-01). Every stage shares the single Node
# baseline pinned by index digest (D-02, FOUND-04). The digest is the index
# digest reported by `docker buildx imagetools inspect node:24-bookworm-slim`,
# so both amd64 and arm64 resolve reproducibly.
FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS base
WORKDIR /app
# The browser install and every later stage/test must agree on this path.
# CI=1 keeps npm/Playwright non-interactive.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CI=1
# Only the manifest pair, so the dependency layer and the Chromium layer are
# not invalidated by source edits (cache boundary).
COPY package.json package-lock.json ./

FROM base AS deps
RUN npm ci --no-audit --no-fund

FROM deps AS ci
# Chromium plus the ~40 OS shared libraries it needs are baked in at image-build
# time (T-01-03, FOUND-04). Tests never download browsers, and no npm script or
# test ever calls `playwright install`.
#
# Accepted posture (T-01-02, PITFALLS Pitfall 10): Chromium runs as root inside
# this container, which disables its sandbox. That is scoped to `e2e`/`verify`
# loading only localhost content this repository serves; revisit before any test
# navigates to an untrusted URL.
RUN npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*
COPY . .

FROM ci AS preview
# D-01 names the leaf targets dev, ci and preview. `preview` is an alias of `ci`
# rather than a distinct build, because the only difference for a production
# preview is the `npm run build && npm run preview` command that compose.yaml
# supplies. PATTERNS §2 requires this choice be recorded either way; do not let
# it grow into a second distinct build.

FROM ci AS dev
# Thin alias of ci. Source normally arrives by bind mount, so nothing is copied
# here; compose.yaml keeps building `target: ci` for every service. This CMD is
# the fallback for running the image with no mount.
CMD ["npm", "run", "dev"]

FROM ci AS cross
# D-09: Firefox for the e2e-cross service only. The `ci` image that every other
# service uses stays Chromium-only, and `verify` never runs this stage. The same
# root-and-sandbox posture as T-01-02 applies: Firefox runs as root in this
# container and loads only the repository's own localhost preview.
#
# Owner decision firefox-xvfb (07-04): headless Firefox has no WebGL2 context in
# this container, so the project runs headed under xvfb-run. xvfb supplies the
# display and xauth is the cookie helper xvfb-run requires. Both are installed
# here, at image-build time, so no test downloads a browser or a display helper.
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb xauth \
 && npx playwright install --with-deps firefox \
 && rm -rf /var/lib/apt/lists/*
