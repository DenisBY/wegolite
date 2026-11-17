# syntax=docker/dockerfile:1
#
# SPDX-License-Identifier: GPL-2.0-or-later
#
# Headless Oolite reference image (quick task 261117-iuw).
#
# - It contains Oolite's GPL-2.0-or-later binary and its CC BY-NC-SA 3.0
#   assets. It is built on the test machine for reference measurements only,
#   is never published to a registry, and is part of neither compose.yaml nor
#   any gate (verify, verify-full, CI).
# - Oolite 1.93.1-255 is fetched from the pinned release URL and verified
#   against the pinned SHA256 (`sha256sum -c`); a mismatch fails the build.
#   The AppImage is extracted at build time, so FUSE is not needed at run time.
# - The base is pinned by index digest, as reported by
#   `docker buildx imagetools inspect debian:bookworm-slim`.
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS fetch
ARG OOLITE_VERSION=1.93.1-255
ARG APPIMAGE_URL=https://github.com/OoliteProject/oolite/releases/download/1.93.1-255/Oolite-1.93.1-255-deployment-x86_64.AppImage
ARG APPIMAGE_SHA256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /work
RUN curl -fsSL --retry 3 -o oolite.AppImage "$APPIMAGE_URL" \
    && echo "$APPIMAGE_SHA256  oolite.AppImage" | sha256sum -c - \
    && chmod +x oolite.AppImage \
    && ./oolite.AppImage --appimage-extract >/dev/null \
    && ls \
    && mv squashfs-root /opt/oolite \
    && chmod -R a+rX /opt/oolite \
    && rm -f oolite.AppImage

FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc AS runtime
ARG OOLITE_VERSION=1.93.1-255
ARG APPIMAGE_SHA256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8
# Mesa is NOT bundled in the AppImage (DEPLOY_OPENGL=0), so the image provides
# libGL and the llvmpipe software rasteriser.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        xvfb x11-utils xdotool imagemagick \
        libgl1 libglx-mesa0 libgl1-mesa-dri libegl1 mesa-utils procps \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
COPY --from=fetch /opt/oolite /opt/oolite
# Not named UID/GID: UID is a read-only variable in bash.
ARG OOREF_UID=1000
ARG OOREF_GID=1000
RUN groupadd -g "$OOREF_GID" oolite \
    && useradd -m -u "$OOREF_UID" -g "$OOREF_GID" -s /bin/bash oolite
ENV LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    SDL_AUDIODRIVER=dummy \
    SDL_AUDIO_DRIVER=dummy \
    SDL_VIDEO_DRIVER=x11 \
    ALSOFT_DRIVERS=null \
    DISPLAY=:99 \
    OOREF_OOLITE_VERSION=${OOLITE_VERSION} \
    OOREF_APPIMAGE_SHA256=${APPIMAGE_SHA256}
# Last, so editing the entrypoint rebuilds only this small layer.
COPY --chmod=0755 entrypoint.sh /usr/local/bin/oolite-ref-session
USER oolite
WORKDIR /home/oolite
ENTRYPOINT ["/usr/local/bin/oolite-ref-session"]
