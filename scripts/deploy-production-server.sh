#!/usr/bin/env bash
set -euo pipefail

APP_USER=azerothl
APP_DIR=/home/azerothl/documentalist
APP_SSH_KEY=/home/azerothl/.ssh/documentalist-readonly
APP_KNOWN_HOSTS=/home/azerothl/.ssh/github_known_hosts
DEPLOY_SHA=""

if [ ! -t 0 ]; then
  IFS= read -r DEPLOY_SHA || DEPLOY_SHA=""
fi

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Le dépôt Documentalist est introuvable dans $APP_DIR." >&2
  exit 1
fi

/usr/sbin/runuser -u "$APP_USER" -- env GIT_TERMINAL_PROMPT=0 \
  /usr/bin/git -C "$APP_DIR" fetch origin main

if [ -z "$DEPLOY_SHA" ]; then
  DEPLOY_SHA=$(/usr/sbin/runuser -u "$APP_USER" -- \
    /usr/bin/git -C "$APP_DIR" rev-parse --verify 'FETCH_HEAD^{commit}')
elif ! [[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Le SHA demandé n’est pas un commit Git valide." >&2
  exit 1
else
  MAIN_SHA=$(/usr/sbin/runuser -u "$APP_USER" -- \
    /usr/bin/git -C "$APP_DIR" rev-parse --verify 'FETCH_HEAD^{commit}')
  if [ "$DEPLOY_SHA" != "$MAIN_SHA" ]; then
    echo "La branche main a avancé depuis la validation ; déploiement annulé." >&2
    exit 1
  fi
fi

/usr/sbin/runuser -u "$APP_USER" -- \
  /usr/bin/git -C "$APP_DIR" checkout --detach --force "$DEPLOY_SHA"
echo "Déploiement du commit $DEPLOY_SHA."

/usr/bin/docker compose \
  --project-directory "$APP_DIR" \
  -f "$APP_DIR/compose.yaml" \
  up -d --build --remove-orphans

for attempt in $(seq 1 30); do
  if /usr/bin/docker compose \
    --project-directory "$APP_DIR" \
    -f "$APP_DIR/compose.yaml" \
    exec -T documentalist node -e \
      "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    echo "Documentalist est disponible."
    exit 0
  fi
  sleep 2
done

/usr/bin/docker compose \
  --project-directory "$APP_DIR" \
  -f "$APP_DIR/compose.yaml" \
  logs --tail=80 documentalist >&2
echo "Documentalist n’a pas répondu après le déploiement." >&2
exit 1
