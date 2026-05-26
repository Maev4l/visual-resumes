# Multi-stage: stage 1 installs puppeteer-core + @sparticuz/chromium-min against Linux/arm64 so the
# native binaries match the Lambda runtime (Graviton). It ALSO downloads the arm64 Chromium pack
# (the npm package chromium-min ships no binary; arm64 binaries live as release assets on GitHub).
# Stage 2 aliases the LWA image (Docker forbids variable expansion in `--from=<registry>:${TAG}`,
# so we pin the version via a FROM stage and COPY from that stage by name).
# Stage 3 copies everything into the AWS Lambda Node 22 base image.

# AWS Lambda Web Adapter — release notes:
# https://github.com/aws/aws-lambda-web-adapter/releases
ARG LWA_VERSION=1.0.0

FROM public.ecr.aws/lambda/nodejs:22 AS deps
WORKDIR /build

# Keep in sync with package.runtime.json @sparticuz/chromium-min version.
ARG CHROMIUM_VERSION=137.0.1

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

FROM public.ecr.aws/lambda/nodejs:22

COPY --from=lwa /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY --from=deps /opt/chromium /opt/chromium
COPY bin/ ${LAMBDA_TASK_ROOT}/
ENV TEMPLATES_DIR=${LAMBDA_TASK_ROOT}/templates
ENV CHROMIUM_PACK_DIR=/opt/chromium

# LWA forwards API Gateway events as HTTP requests to $PORT (set via Lambda env).
# server.js starts the Hono app on that port.
CMD ["node", "index.js"]
