FROM ubuntu:24.04 AS build

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates cmake git ninja-build pkg-config protobuf-compiler python3 python3-protobuf \
    libjson-c-dev libminiupnpc-dev libopus-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

RUN cmake -S . -B /build -G Ninja \
      -DCHIAKI_ENABLE_WEB_BRIDGE=ON \
      -DCHIAKI_ENABLE_GUI=OFF \
      -DCHIAKI_ENABLE_CLI=OFF \
      -DCHIAKI_ENABLE_TESTS=OFF \
      -DCHIAKI_ENABLE_FFMPEG_DECODER=OFF \
      -DCHIAKI_ENABLE_STEAMDECK_NATIVE=OFF \
      -DCHIAKI_ENABLE_STEAM_SHORTCUT=OFF \
      -DCHIAKI_ENABLE_SETSU=OFF \
    && cmake --build /build --target pylux-web-bridge -j 1

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libjson-c5 libminiupnpc17 libopus0 libssl3t64 netcat-openbsd \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /var/lib/pylux --shell /usr/sbin/nologin pylux \
    && install -d -o pylux -g pylux -m 0700 /var/lib/pylux /var/lib/pylux/catalog /var/lib/pylux/secrets

COPY --from=build /build/web-bridge/pylux-web-bridge /usr/local/bin/pylux-web-bridge

USER pylux
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD nc -z 127.0.0.1 8080 || exit 1

ENTRYPOINT ["/usr/local/bin/pylux-web-bridge"]
