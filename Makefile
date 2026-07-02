.PHONY: frontend-config frontend-serve frontend-build frontend-deploy \
	backend-build backend-deploy \
	infra-init infra-plan infra-apply infra-output \
	lint test deploy

frontend-config:
	terraform -chdir=packages/infrastructure output -raw editor_runtime_config > packages/editor/public/config.json

frontend-serve: frontend-config
	yarn --cwd packages/editor dev

frontend-build:
	yarn --cwd packages/editor build

frontend-deploy: frontend-build
	yarn --cwd packages/editor deploy

backend-build:
	yarn --cwd packages/functions build

backend-deploy: backend-build
	yarn --cwd packages/functions push-renderer
	yarn --cwd packages/functions push-image-resizer
	$(MAKE) infra-apply

infra-init:
	terraform -chdir=packages/infrastructure init

infra-plan:
	terraform -chdir=packages/infrastructure plan

infra-apply:
	terraform -chdir=packages/infrastructure apply -auto-approve

infra-output:
	terraform -chdir=packages/infrastructure output

lint:
	yarn --cwd packages/editor lint
	yarn --cwd packages/functions lint

test:
	yarn --cwd packages/editor test
	yarn --cwd packages/functions test

deploy: backend-deploy frontend-deploy
