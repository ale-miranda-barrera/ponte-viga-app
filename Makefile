# Ponte Viga — operaciones del proyecto.
#
# Uso:
#   make build       Compila el HTML único.
#   make deploy      Build + sube artefactos a S3 + corre SSM (reinicia PM2 + migra a DynamoDB).
#   make infra       Crea o actualiza el stack de CloudFormation (DynamoDB + EC2 + S3 + IAM + SSM).
#   make logs        Tail del último Run Command (SSM).
#   make status      Estado de CloudFormation, IP pública, healthcheck del server.
#   make local       node build.js + node server.js (modo archivos, sin AWS).
#
# Configuración (override por línea de comandos: `make deploy STACK=ponte-viga-ec2`).

STACK       ?= ponte-viga-ec2
APP_NAME    ?= ponte-viga
ENVIRONMENT ?= dev
REGION      ?= us-east-1
KEY_PAIR    ?= viga-key

# Estos se resuelven automáticamente del stack desplegado
INSTANCE_ID := $(shell aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text 2>/dev/null)
BUCKET      := $(shell aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' --output text 2>/dev/null)
SSM_DOC     := $(shell aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) --query 'Stacks[0].Outputs[?OutputKey==`SSMDocumentName`].OutputValue' --output text 2>/dev/null)
PUBLIC_IP   := $(shell aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' --output text 2>/dev/null)

.PHONY: build deploy infra logs status local clean help

help:
	@echo "Targets:"
	@echo "  make build    — Compila index.html"
	@echo "  make deploy   — Build + sube a S3 + corre SSM"
	@echo "  make infra    — Aplica infrastructure-ec2.yaml (crea/actualiza recursos AWS)"
	@echo "  make logs     — Tail del último SSM Run Command"
	@echo "  make status   — IP, stack status, healthcheck"
	@echo "  make local    — Build + server local (sin AWS)"

build:
	@echo "🔨 Compilando..."
	node build.js

infra:
	@echo "☁️  Aplicando CloudFormation a stack $(STACK)..."
	aws cloudformation deploy \
	    --stack-name $(STACK) \
	    --template-file infrastructure-ec2.yaml \
	    --parameter-overrides \
	        AppName=$(APP_NAME) \
	        Environment=$(ENVIRONMENT) \
	        KeyPairName=$(KEY_PAIR) \
	    --capabilities CAPABILITY_NAMED_IAM \
	    --region $(REGION) \
	    --no-fail-on-empty-changeset
	@echo "✅ Stack actualizado"
	@aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) \
	    --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table

deploy: build
	@if [ -z "$(INSTANCE_ID)" ] || [ "$(INSTANCE_ID)" = "None" ]; then \
	    echo "❌ No se encontró el stack $(STACK). Corre 'make infra' primero."; exit 1; \
	fi
	@echo "📦 Subiendo artefactos a s3://$(BUCKET)/app/..."
	aws s3 cp index.html             s3://$(BUCKET)/app/index.html             --region $(REGION)
	aws s3 cp server.js              s3://$(BUCKET)/app/server.js              --region $(REGION)
	aws s3 cp sw.js                  s3://$(BUCKET)/app/sw.js                  --region $(REGION)
	aws s3 cp package.json           s3://$(BUCKET)/app/package.json           --region $(REGION)
	aws s3 cp ec2-config.json        s3://$(BUCKET)/app/ec2-config.json        --region $(REGION)
	aws s3 cp migrate-to-dynamo.js   s3://$(BUCKET)/app/migrate-to-dynamo.js   --region $(REGION)
	@echo "🚀 Disparando SSM Run Command ($(SSM_DOC)) en $(INSTANCE_ID)..."
	@COMMAND_ID=$$(aws ssm send-command \
	    --instance-ids $(INSTANCE_ID) \
	    --document-name $(SSM_DOC) \
	    --comment "make deploy" \
	    --region $(REGION) \
	    --query 'Command.CommandId' --output text); \
	echo "  CommandId: $$COMMAND_ID"; \
	echo "  Esperando..."; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
	    sleep 5; \
	    STATUS=$$(aws ssm get-command-invocation --command-id $$COMMAND_ID --instance-id $(INSTANCE_ID) --region $(REGION) --query 'Status' --output text 2>/dev/null || echo "Pending"); \
	    echo "  [$$i] $$STATUS"; \
	    if [ "$$STATUS" = "Success" ] || [ "$$STATUS" = "Failed" ] || [ "$$STATUS" = "Cancelled" ] || [ "$$STATUS" = "TimedOut" ]; then \
	        break; \
	    fi; \
	done; \
	echo ""; \
	echo "─── Salida ───"; \
	aws ssm get-command-invocation --command-id $$COMMAND_ID --instance-id $(INSTANCE_ID) --region $(REGION) --query 'StandardOutputContent' --output text | tail -40; \
	echo ""; \
	if [ "$$STATUS" != "Success" ]; then \
	    echo "─── Errores ───"; \
	    aws ssm get-command-invocation --command-id $$COMMAND_ID --instance-id $(INSTANCE_ID) --region $(REGION) --query 'StandardErrorContent' --output text | tail -20; \
	    exit 1; \
	fi; \
	echo "✅ Deploy completo. IP: $(PUBLIC_IP)"

logs:
	@LAST=$$(aws ssm list-command-invocations --instance-id $(INSTANCE_ID) --max-results 1 --region $(REGION) --query 'CommandInvocations[0].CommandId' --output text); \
	echo "CommandId: $$LAST"; \
	aws ssm get-command-invocation --command-id $$LAST --instance-id $(INSTANCE_ID) --region $(REGION) --query 'StandardOutputContent' --output text

status:
	@echo "Stack: $(STACK)"
	@aws cloudformation describe-stacks --stack-name $(STACK) --region $(REGION) --query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' --output table 2>/dev/null || echo "  (no existe)"
	@echo ""
	@echo "IP pública: $(PUBLIC_IP)"
	@echo ""
	@echo "Healthcheck del servidor:"
	@curl -s -o /dev/null -w "  HTTP %{http_code} en %{time_total}s\n" http://$(PUBLIC_IP)/healthz || true
	@curl -s http://$(PUBLIC_IP)/healthz || true

local: build
	@echo "🖥  Servidor local en http://localhost:3000 (Ctrl+C para detener)"
	node server.js

clean:
	rm -f index.html
