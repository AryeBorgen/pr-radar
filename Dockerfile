# syntax=docker/dockerfile:1

# The build needs Node; serving the result does not. Keeping them in separate
# stages means the shipped image carries no toolchain and no source.
#
# Pinned to $BUILDPLATFORM -- the builder's own architecture -- rather than the
# target's. `dist/` is HTML, CSS and JavaScript, which are the same bytes on
# every architecture, so there is nothing to cross-compile and no reason to run
# `npm ci` under QEMU once per target. Only the nginx stage below is built per
# architecture, and all it does is copy files.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /app

# Dependencies are their own layer, so a source-only change does not reinstall.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Served from the root inside the image, unlike GitHub Pages.
ENV PR_RADAR_BASE=/
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# The main config exists only to `load_module` the JavaScript module, which
# nginx accepts only above the http block. It is otherwise the stock file.
COPY docker/nginx-main.conf /etc/nginx/nginx.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf
# The sign-in relay: the nginx adapter, and the policy file it shares verbatim
# with bin/pr-radar.js so the container and `npx pr-radar` cannot drift apart
# about what is allowed.
COPY docker/njs/relay.js /etc/nginx/njs/relay.js
COPY bin/relay-policy.js /etc/nginx/njs/relay-policy.js

EXPOSE 80
# 127.0.0.1, not localhost. nginx's `listen 80` binds IPv4 only -- the official
# image's own default.conf does the same -- while the container's /etc/hosts maps
# localhost to both 127.0.0.1 and ::1, and busybox wget tries ::1 first. The probe
# is refused there, so the container reports unhealthy while serving perfectly.
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
