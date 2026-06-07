# Multi-stage: stage 1 installs puppeteer-core + @sparticuz/chromium-min against Linux/arm64 so the
# native binaries match the Lambda runtime (Graviton). It ALSO downloads the arm64 Chromium pack
# (the npm package chromium-min ships no binary; arm64 binaries live as release assets on GitHub).
# Stage 2 aliases the LWA image (Docker forbids variable expansion in `--from=<registry>:${TAG}`,
# so we pin the version via a FROM stage and COPY from that stage by name).
# Stage 3 copies everything into the AWS Lambda Node 24 base image.

# AWS Lambda Web Adapter — release notes:
# https://github.com/aws/aws-lambda-web-adapter/releases
ARG LWA_VERSION=1.0.0

FROM public.ecr.aws/lambda/nodejs:24 AS deps
WORKDIR /build

# Keep in sync with package.runtime.json @sparticuz/chromium-min version.
ARG CHROMIUM_VERSION=143.0.4

COPY package.runtime.json package.json
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock

# Extract the arm64 Chromium pack into /opt/chromium. browser.js calls
# chromium.executablePath('/opt/chromium') to launch without re-downloading at runtime.
RUN dnf install -y tar && \
    curl -fsSL -o /tmp/chromium-pack.tar \
      "https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_VERSION}/chromium-v${CHROMIUM_VERSION}-pack.arm64.tar" && \
    mkdir -p /opt/chromium && \
    tar -xf /tmp/chromium-pack.tar -C /opt/chromium && \
    rm /tmp/chromium-pack.tar

FROM public.ecr.aws/awsguru/aws-lambda-adapter:${LWA_VERSION} AS lwa

FROM public.ecr.aws/lambda/nodejs:24

COPY --from=lwa /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=deps /opt/chromium /opt/chromium
COPY bin/ ${LAMBDA_TASK_ROOT}/
ENV TEMPLATES_DIR=${LAMBDA_TASK_ROOT}/templates
ENV CHROMIUM_PACK_DIR=/opt/chromium

# Our ENTRYPOINT override (LWA web-server mode, below) bypasses the AWS Node.js runtime bootstrap,
# which is what normally sets AWS_EXECUTION_ENV. @sparticuz/chromium-min reads that var to detect
# Amazon Linux 2023 and extract the al2023 shared-lib pack (libnspr4.so, etc.) + set LD_LIBRARY_PATH.
# Without it, detection silently fails and Chromium dies with "libnspr4.so: cannot open shared
# object file". Set it explicitly so detection is deterministic however the process is launched.
# (AWS_EXECUTION_ENV is a reserved Lambda key — it can't be set via the function's env config,
# only baked into the image here.)
ENV AWS_EXECUTION_ENV=AWS_Lambda_nodejs24.x

# AWS managed base images inherit ENTRYPOINT=/lambda-entrypoint.sh, which expects a single
# handler-name argument and rejects `node index.js` with "entrypoint requires the handler name
# to be the first argument" (crashing INIT). In LWA web-server mode we must OVERRIDE the
# entrypoint so the container launches the Hono server directly; the lambda-adapter extension
# (in /opt/extensions) then bridges the Lambda Runtime API to the server on $PORT.
ENTRYPOINT ["node", "index.js"]
