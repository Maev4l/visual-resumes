# Multi-stage build — stage 1 installs sharp against Linux/arm64 so the native binary matches the Lambda runtime (Graviton).
FROM public.ecr.aws/lambda/nodejs:22 AS deps
WORKDIR /build
COPY package.runtime.json package.json
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock

FROM public.ecr.aws/lambda/nodejs:22
COPY --from=deps /build/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY bin/ ${LAMBDA_TASK_ROOT}/
CMD ["index.handler"]
