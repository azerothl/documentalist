#!/usr/bin/env bash
set -euo pipefail

APP_USER=azerothl
APP_DIR=/home/azerothl/documentalist
APP_SSH_KEY=/home/azerothl/.ssh/documentalist-readonly
APP_KNOWN_HOSTS=/home/azerothl/.ssh/github_known_hosts

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Le dépôt Documentalist est introuvable dans $APP_DIR." >&2
  exit 1
fi

/usr/sbin/runuser -u "$APP_USER" -- env GIT_TERMINAL_PROMPT=0 \
  /usr/bin/git -C "$APP_DIR" pull --ff-only origin main

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
