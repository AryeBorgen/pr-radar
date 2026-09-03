# syntax=docker/dockerfile:1

# The build needs Node; serving the result does not. Keeping them in separate
# stages means the shipped image carries no toolchain and no source.
FROM node:22-alpine AS build
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
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
