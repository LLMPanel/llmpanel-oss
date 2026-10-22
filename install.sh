#!/usr/bin/env bash
#
# LLMPanel installer.
#
#   curl -fsSL https://raw.githubusercontent.com/LLMPanel/llmpanel-oss/master/install.sh | sudo bash
#
# Configuration comes from environment variables, not prompts: stdin is the
# script itself when piped from curl, so reading answers from it is impossible.
# (Coolify solves this the same way — write a .env, then re-run.)
#
#   PANEL_DOMAIN=panel.example.com \
#   API_DOMAIN=api.example.com \
#   BASE_DOMAIN=example.com \
#   ACME_EMAIL=you@example.com \
#   CF_DNS_API_TOKEN=xxxx \
#   DEPLOYMENT_MODE=cloud \
#   RESEND_API_KEY=re_xxxx \
#   EMAIL_FROM="LLMPanel <noreply@example.com>" \
#     curl -fsSL .../install.sh | sudo -E bash
#
# Email can also go through Cloudflare Email Sending instead of Resend:
#   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_EMAIL_API_TOKEN=... EMAIL_FROM=...
#
# With no variables set you get a plain-HTTP install on ports 3000/8000.

set -Eeuo pipefail

REPO="${LLMPANEL_REPO:-LLMPanel/llmpanel-oss}"
BRANCH="${LLMPANEL_BRANCH:-master}"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
INSTALL_DIR="${LLMPANEL_DIR:-/data/llmpanel}"
LLMPANEL_VERSION="${LLMPANEL_VERSION:-latest}"

# Config knobs (all optional)
PANEL_DOMAIN="${PANEL_DOMAIN:-}"
API_DOMAIN="${API_DOMAIN:-}"
BASE_DOMAIN="${BASE_DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
CF_DNS_API_TOKEN="${CF_DNS_API_TOKEN:-}"
HF_TOKEN="${HF_TOKEN:-}"
# "self-hosted" (local Docker inference) or "cloud" (users bring RunPod/Vast.ai keys)
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-self-hosted}"
# Transactional email (sign-up OTP, 2FA, resets): Resend or Cloudflare Email
# Sending, plus the from address. EMAIL_PROVIDER picks one when both are set.
EMAIL_PROVIDER="${EMAIL_PROVIDER:-}"
RESEND_API_KEY="${RESEND_API_KEY:-}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
CLOUDFLARE_EMAIL_API_TOKEN="${CLOUDFLARE_EMAIL_API_TOKEN:-}"
EMAIL_FROM="${EMAIL_FROM:-}"

readonly RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' BOLD=$'\033[1m' DIM=$'\033[2m' RESET=$'\033[0m'

info()  { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok()    { printf '%s  ok%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '%swarn%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()   { printf '%sfail%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

trap 'die "installation aborted on line $LINENO"' ERR

# ── Preflight ─────────────────────────────────────────────────────────────────

require_root() {
  [[ ${EUID} -eq 0 ]] || die "run as root:  curl -fsSL ${RAW_BASE}/install.sh | sudo bash"
}

require_linux() {
  [[ "$(uname -s)" == "Linux" ]] || die "LLMPanel installs on Linux. For macOS, run 'pnpm dev' from a checkout."
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo present)"
  else
    info "installing Docker"
    curl -fsSL https://get.docker.com | sh
    ok "docker installed"
  fi

  docker compose version >/dev/null 2>&1 \
    || die "'docker compose' plugin missing. Install docker-compose-plugin and re-run."

  systemctl enable --now docker >/dev/null 2>&1 || true
}

# ── GPU probe ─────────────────────────────────────────────────────────────────
# Three separate questions: is there a GPU, can Docker see it, and does a real
# container actually get it? Answering only the first is how you end up with a
# panel that offers local deployment and then fails inside `docker run`.

GPU_AVAILABLE=false

probe_gpu() {
  info "probing for NVIDIA GPU"

  if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi -L >/dev/null 2>&1; then
    warn "no GPU detected — local models will run on the CPU (llama.cpp, GGUF)"
    warn "(fine for small models; add RunPod / Vast.ai in the panel for GPU speed)"
    return 0
  fi
  ok "GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader | paste -sd', ' -)"

  if ! docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q nvidia; then
    warn "GPU present but the NVIDIA container runtime is not registered with Docker"
    if install_nvidia_toolkit; then
      ok "nvidia-container-toolkit installed"
    else
      warn "could not install nvidia-container-toolkit automatically"
      warn "see https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html"
      return 0
    fi
  fi

  # The only check that proves the whole chain works.
  if docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi -L >/dev/null 2>&1; then
    GPU_AVAILABLE=true
    ok "GPU is usable from containers"
  else
    warn "GPU present but 'docker run --gpus all' failed — local models will run on the CPU"
  fi
}

install_nvidia_toolkit() {
  command -v apt-get >/dev/null 2>&1 || return 1
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null || return 1
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list || return 1
  apt-get update -qq || return 1
  apt-get install -y -qq nvidia-container-toolkit || return 1
  nvidia-ctk runtime configure --runtime=docker || return 1
  systemctl restart docker || return 1
}

# ── Edge selection ────────────────────────────────────────────────────────────

COMPOSE_FILE="docker-compose.yml"
APP_URL=""
API_URL=""
GATEWAY_PROTOCOL="http"
TLS_MODE="none"

select_edge() {
  if [[ -z "$PANEL_DOMAIN" ]]; then
    COMPOSE_FILE="${COMPOSE_FILE}:docker-compose.ports.yml"
    local ip; ip="$(detect_public_ip)"
    APP_URL="http://${ip}:3000"
    API_URL="http://${ip}:8000"
    BASE_DOMAIN="${BASE_DOMAIN:-llmpanel.local}"
    info "no PANEL_DOMAIN set — installing without TLS on ports 3000/8000"
    return
  fi

  [[ -n "$ACME_EMAIL" ]] || die "PANEL_DOMAIN set but ACME_EMAIL is empty — Let's Encrypt requires a contact address"
  API_DOMAIN="${API_DOMAIN:-api.${PANEL_DOMAIN#*.}}"

  COMPOSE_FILE="${COMPOSE_FILE}:docker-compose.traefik.yml"
  APP_URL="https://${PANEL_DOMAIN}"
  API_URL="https://${API_DOMAIN}"
  GATEWAY_PROTOCOL="https"

  if [[ -n "$CF_DNS_API_TOKEN" ]]; then
    [[ -n "$BASE_DOMAIN" ]] || die "CF_DNS_API_TOKEN set but BASE_DOMAIN is empty — a wildcard cert needs its base domain"
    COMPOSE_FILE="${COMPOSE_FILE}:docker-compose.traefik-wildcard.yml"
    TLS_MODE="dns"
    info "wildcard TLS via DNS-01 — per-deployment subdomains under *.${BASE_DOMAIN} will work"
  else
    TLS_MODE="http"
    BASE_DOMAIN="${BASE_DOMAIN:-llmpanel.local}"
    warn "no CF_DNS_API_TOKEN — TLS covers the panel and API only."
    warn "Per-deployment subdomains need a wildcard certificate, and Let's Encrypt"
    warn "issues those solely over DNS-01. Set CF_DNS_API_TOKEN to enable them."
  fi
}

detect_public_ip() {
  curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "localhost"
}

# ── Filesystem + secrets ──────────────────────────────────────────────────────

fetch() {
  local name="$1"
  local dest="${INSTALL_DIR}/$(basename "$name")"
  # Pre-placed file wins — supports offline installs and private forks where
  # raw.githubusercontent.com is not reachable.
  if [[ -f "$dest" ]]; then
    ok "using existing $(basename "$name")"
    return 0
  fi
  curl -fsSL "${RAW_BASE}/${name}" -o "$dest" \
    || die "could not download ${name} from ${RAW_BASE}"
}

write_env() {
  local env_file="${INSTALL_DIR}/.env"

  if [[ -f "$env_file" ]]; then
    # Never regenerate secrets over an existing database — every stored API key
    # and provider credential is encrypted with the current ENCRYPTION_KEY.
    info "existing .env found — keeping its secrets"
    # shellcheck disable=SC1090
    BETTER_AUTH_SECRET="$(grep -E '^BETTER_AUTH_SECRET=' "$env_file" | cut -d= -f2-)"
    ENCRYPTION_KEY="$(grep -E '^ENCRYPTION_KEY=' "$env_file" | cut -d= -f2-)"
    [[ -n "$BETTER_AUTH_SECRET" && -n "$ENCRYPTION_KEY" ]] \
      || die "existing ${env_file} is missing BETTER_AUTH_SECRET or ENCRYPTION_KEY; fix or delete it"
    cp "$env_file" "${env_file}.bak.$(date +%s)"
  else
    BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
    ENCRYPTION_KEY="$(openssl rand -hex 32)"
  fi

  umask 077
  cat > "$env_file" <<EOF
# Generated by install.sh. Secrets here decrypt every stored provider credential
# and API key — back this file up, and never regenerate it against a live database.
COMPOSE_FILE=${COMPOSE_FILE}
LLMPANEL_VERSION=${LLMPANEL_VERSION}

BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

APP_URL=${APP_URL}
API_URL=${API_URL}

PANEL_DOMAIN=${PANEL_DOMAIN}
API_DOMAIN=${API_DOMAIN}
BASE_DOMAIN=${BASE_DOMAIN}
GATEWAY_PROTOCOL=${GATEWAY_PROTOCOL}

CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
ACME_EMAIL=${ACME_EMAIL}

GPU_AVAILABLE=${GPU_AVAILABLE}
DEPLOYMENT_MODE=${DEPLOYMENT_MODE}

EMAIL_PROVIDER=${EMAIL_PROVIDER}
RESEND_API_KEY=${RESEND_API_KEY}
CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID}
CLOUDFLARE_EMAIL_API_TOKEN=${CLOUDFLARE_EMAIL_API_TOKEN}
EMAIL_FROM=${EMAIL_FROM}

HF_TOKEN=${HF_TOKEN}
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
  chmod 600 "$env_file"
  ok "wrote ${env_file}"
}

write_traefik_config() {
  if [[ "$TLS_MODE" == "none" ]]; then
    return 0
  fi

  mkdir -p "${INSTALL_DIR}/traefik"
  local src="traefik.http.yml"
  if [[ "$TLS_MODE" == "dns" ]]; then
    src="traefik.dns.yml"
  fi

  if [[ -f "${INSTALL_DIR}/traefik/${src}" ]]; then
    ok "using existing traefik/${src}"
    cp "${INSTALL_DIR}/traefik/${src}" "${INSTALL_DIR}/traefik/traefik.yml"
  else
    curl -fsSL "${RAW_BASE}/docker/traefik/${src}" -o "${INSTALL_DIR}/traefik/traefik.yml" \
      || die "could not download docker/traefik/${src}"
  fi
  sed -i "s|__ACME_EMAIL__|${ACME_EMAIL}|g" "${INSTALL_DIR}/traefik/traefik.yml"

  # Let's Encrypt storage: Traefik refuses to start if this is world-readable.
  touch "${INSTALL_DIR}/traefik/acme.json"
  chmod 600 "${INSTALL_DIR}/traefik/acme.json"
  ok "wrote traefik config (${TLS_MODE}-01 challenge)"
}

# ── Bring up ──────────────────────────────────────────────────────────────────

start_stack() {
  cd "$INSTALL_DIR"
  # Read back what compose actually resolved rather than reconstructing the
  # name here: LLMPANEL_IMAGE_API/_WEB can override it, and deriving the
  # namespace from $REPO would print the owner with its original casing.
  info "pulling images:"
  docker compose config --images 2>/dev/null | sed 's/^/       /' || true
  docker compose pull --quiet
  info "starting"
  docker compose up -d
}

wait_for_health() {
  info "waiting for the API to become healthy"
  local i
  for i in $(seq 1 60); do
    if [[ "$(docker inspect -f '{{.State.Health.Status}}' llmpanel-api-1 2>/dev/null)" == "healthy" ]]; then
      ok "API is healthy"
      return 0
    fi
    sleep 2
  done
  warn "API did not report healthy within 120s. Inspect with:"
  warn "  cd ${INSTALL_DIR} && docker compose logs api"
  return 1
}

summary() {
  printf '\n%sLLMPanel is running%s\n\n' "$BOLD$GREEN" "$RESET"
  printf '  Panel     %s\n' "$APP_URL"
  printf '  API       %s\n' "$API_URL"
  printf '  GPU       %s\n' "$([[ "$GPU_AVAILABLE" == "true" ]] && echo "detected" || echo "none — local models run on the CPU")"
  printf '  Data      %s  %s(sqlite + generated images)%s\n' "docker volume llmpanel_llmpanel_data" "$DIM" "$RESET"
  printf '  Config    %s\n\n' "${INSTALL_DIR}/.env"

  if [[ "$TLS_MODE" == "dns" ]]; then
    printf '  Point a wildcard DNS record at this host:  *.%s\n\n' "$BASE_DOMAIN"
  elif [[ "$TLS_MODE" == "http" ]]; then
    printf '  Per-deployment subdomains are disabled (no wildcard cert).\n'
    printf '  Set CF_DNS_API_TOKEN in %s/.env and re-run to enable them.\n\n' "$INSTALL_DIR"
  fi

  printf '%sUpdate%s     cd %s && docker compose pull && docker compose up -d\n' "$BOLD" "$RESET" "$INSTALL_DIR"
  printf '%sLogs%s       cd %s && docker compose logs -f\n' "$BOLD" "$RESET" "$INSTALL_DIR"
  printf '%sStop%s       cd %s && docker compose down\n' "$BOLD" "$RESET" "$INSTALL_DIR"
  printf '%sUninstall%s  cd %s && docker compose down -v && rm -rf %s\n\n' "$BOLD" "$RESET" "$INSTALL_DIR" "$INSTALL_DIR"
}

main() {
  case "$DEPLOYMENT_MODE" in
    self-hosted|cloud) ;;
    *) die "DEPLOYMENT_MODE must be 'self-hosted' or 'cloud', got '${DEPLOYMENT_MODE}'" ;;
  esac

  require_root
  require_linux
  install_docker
  probe_gpu
  select_edge

  # Written as an `if`, not `[[ ... ]] && ...`: under `set -e` that idiom exits
  # the script whenever the condition is false, which is the common case here.
  if [[ "$GPU_AVAILABLE" == "true" ]]; then
    COMPOSE_FILE="${COMPOSE_FILE}:docker-compose.gpu.yml"
  fi

  info "install dir: ${INSTALL_DIR}"
  mkdir -p "$INSTALL_DIR"

  fetch docker-compose.yml
  fetch docker-compose.ports.yml
  fetch docker-compose.traefik.yml
  fetch docker-compose.traefik-wildcard.yml
  fetch docker-compose.gpu.yml

  write_env
  write_traefik_config
  start_stack
  wait_for_health || true
  summary
}

main "$@"
