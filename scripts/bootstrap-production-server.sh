#!/usr/bin/env bash
set -euo pipefail

APP_USER=azerothl
APP_DIR=/home/azerothl/documentalist
APP_HOME=/home/azerothl
DEPLOY_USER=agent-deploy
DEPLOY_KEY_FILE=/home/agent-deploy/.ssh/authorized_keys
DEPLOY_COMMAND='sudo -n /usr/local/sbin/documentalist-deploy'
ENV_DIR=/etc/documentalist
ENV_FILE=/etc/documentalist/production.env
DATA_DIR=/data/documentalist
SUDOERS_FILE=/etc/sudoers.d/documentalist-deploy
CADDYFILE=/etc/caddy/Caddyfile
BOOTSTRAP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ACTION_PUBLIC_KEY_FILE="$APP_DIR/deploy/documentalist-actions.pub"
ROOT_DEPLOY_SCRIPT="$BOOTSTRAP_DIR/deploy-production-server.sh"
CADDY_BLOCK_FILE="$APP_DIR/deploy/Caddyfile"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer ce script avec sudo." >&2
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1 || [ ! -d "$APP_DIR/.git" ]; then
  echo "Le dépôt doit être cloné dans $APP_DIR sous l’utilisateur $APP_USER." >&2
  exit 1
fi

if [ ! -s "$ACTION_PUBLIC_KEY_FILE" ] || [ ! -s "$ROOT_DEPLOY_SCRIPT" ] || [ ! -s "$CADDY_BLOCK_FILE" ]; then
  echo "Les fichiers de déploiement doivent accompagner ce script." >&2
  exit 1
fi

APP_SSH_KEY="$APP_HOME/.ssh/documentalist-readonly"
APP_KNOWN_HOSTS="$APP_HOME/.ssh/github_known_hosts"
if [ ! -s "$APP_SSH_KEY" ] || [ ! -s "$APP_KNOWN_HOSTS" ]; then
  echo "La clé GitHub en lecture seule et le fichier github_known_hosts doivent être installés dans $APP_HOME/.ssh." >&2
  exit 1
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "Le compte de déploiement Agent Arena est introuvable : $DEPLOY_USER." >&2
  exit 1
fi

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "/home/$DEPLOY_USER/.ssh"
touch "$DEPLOY_KEY_FILE"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_KEY_FILE"
chmod 0600 "$DEPLOY_KEY_FILE"
ACTION_PUBLIC_KEY="$(cat "$ACTION_PUBLIC_KEY_FILE")"
if ! grep -Fq "$ACTION_PUBLIC_KEY" "$DEPLOY_KEY_FILE"; then
  printf 'restrict,command="%s" %s\n' "$DEPLOY_COMMAND" "$ACTION_PUBLIC_KEY" >> "$DEPLOY_KEY_FILE"
fi

install -o root -g root -m 0755 "$ROOT_DEPLOY_SCRIPT" /usr/local/sbin/documentalist-deploy
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/documentalist-deploy\n' "$DEPLOY_USER" > "$SUDOERS_FILE"
chmod 0440 "$SUDOERS_FILE"
/usr/sbin/visudo -cf "$SUDOERS_FILE"

install -d -o 1000 -g 1000 -m 0750 "$DATA_DIR"
install -d -o root -g root -m 0700 "$ENV_DIR"
if [ ! -e "$ENV_FILE" ]; then
  umask 077
  cat > "$ENV_FILE" <<'EOF'
DOCUMENTALIST_URL=https://documentalist.akasha-labs.com
DOCUMENTALIST_COOKIE_SECURE=true
EOF
  chown root:root "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

if ! grep -Eq '^DOCUMENTALIST_URL=https://[^[:space:]]+$' "$ENV_FILE"; then
  echo "$ENV_FILE doit définir DOCUMENTALIST_URL avec une URL HTTPS." >&2
  exit 1
fi
if ! grep -Eq '^DOCUMENTALIST_COOKIE_SECURE=true$' "$ENV_FILE"; then
  echo "$ENV_FILE doit définir DOCUMENTALIST_COOKIE_SECURE=true." >&2
  exit 1
fi

/usr/sbin/runuser -u "$APP_USER" -- /usr/bin/git -C "$APP_DIR" remote set-url origin git@github.com:azerothl/documentalist.git
/usr/sbin/runuser -u "$APP_USER" -- /usr/bin/git -C "$APP_DIR" config core.sshCommand \
  "ssh -i $APP_SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$APP_KNOWN_HOSTS"
/usr/sbin/runuser -u "$APP_USER" -- /usr/bin/git -C "$APP_DIR" config --local safe.directory "$APP_DIR"

if [ ! -s "$CADDYFILE" ] || ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy et sa configuration existante sont requis pour conserver le proxy Agent Arena." >&2
  exit 1
fi

if ! grep -Fq '# BEGIN Documentalist' "$CADDYFILE"; then
  CADDY_TMP="$(mktemp /etc/caddy/Caddyfile.documentalist.XXXXXX)"
  CADDY_BACKUP="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$CADDYFILE" "$CADDY_BACKUP"
  cat "$CADDYFILE" > "$CADDY_TMP"
  printf '\n# BEGIN Documentalist\n' >> "$CADDY_TMP"
  cat "$CADDY_BLOCK_FILE" >> "$CADDY_TMP"
  printf '\n# END Documentalist\n' >> "$CADDY_TMP"
  /usr/bin/caddy validate --config "$CADDY_TMP" --adapter caddyfile
  install -o root -g root -m 0644 "$CADDY_TMP" "$CADDYFILE"
  rm -f "$CADDY_TMP"
  if ! /usr/bin/systemctl reload caddy; then
    install -o root -g root -m 0644 "$CADDY_BACKUP" "$CADDYFILE"
    /usr/bin/systemctl reload caddy || true
    echo "Caddy n’a pas accepté la nouvelle configuration ; l’ancienne a été restaurée." >&2
    exit 1
  fi
fi

/usr/local/sbin/documentalist-deploy

echo "Déploiement initial terminé. Le code d’installation initial se trouve dans $DATA_DIR/setup-token."
