#!/usr/bin/env bash
set -Eeuo pipefail
# Bash's monotonic elapsed counter avoids dependencies and keeps errors intact.
deploy_started=$SECONDS
step_started=$SECONDS
step_label=''
start_step() {
  if [[ -n $step_label ]]; then
    printf '[deploy] %s concluído em %ss\n' "$step_label" "$((SECONDS-step_started))"
  fi
  step_label=$1
  step_started=$SECONDS
  printf '[deploy] %s…\n' "$step_label"
}
finish_steps() {
  printf '[deploy] %s concluído em %ss\n' "$step_label" "$((SECONDS-step_started))"
  printf '[deploy] Total %s: %ss\n' "$1" "$((SECONDS-deploy_started))"
}
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ ${1:-} == --help ]]; then
  echo 'Uso: ./deploy/serveros.sh [--check]'
  echo 'Publica os arquivos locais atuais (inclusive alterações sem commit).'
  echo 'Variáveis opcionais: SERVEROS_HOST, SERVEROS_SSH_CONFIG.'
  exit 0
fi
[[ $# == 0 || ( $# == 1 && $1 == --check ) ]] || { echo 'Argumento inválido; use --help.' >&2; exit 2; }
for command in ssh tar git mktemp; do command -v "$command" >/dev/null; done
cd "$root"
bash -n deploy/serveros.sh deploy/serveros-remote.sh
revision=$(git rev-parse --short HEAD)
tag="rota-$revision-$(date -u +%Y%m%d-%H%M%S)-$RANDOM"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
start_step 'Empacotamento local'
tar --exclude=node_modules --exclude=dist --exclude='.env*' --exclude=.git \
  -czf "$tmp/$tag.tar.gz" Dockerfile compose.yaml compose.serveros.yaml .dockerignore deploy rota-adaptada
printf '[deploy] Tamanho do pacote: %s bytes\n' "$(wc -c < "$tmp/$tag.tar.gz")"
if [[ ${1:-} == --check ]]; then
  tar -tzf "$tmp/$tag.tar.gz" >/dev/null
  finish_steps local
  echo 'Sintaxe e empacotamento validados; nenhum acesso ao servidor.'
  exit 0
fi
ssh_args=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
config=${SERVEROS_SSH_CONFIG:-$HOME/.ssh/config}
[[ ! -f $config ]] || ssh_args+=(-F "$config")
host=${SERVEROS_HOST:-serveros}
start_step "Envio de $tag para $host"
ssh "${ssh_args[@]}" "$host" "cat > /tmp/$tag.tar.gz" < "$tmp/$tag.tar.gz"
start_step 'Execução remota (build, backup e ativação)'
ssh "${ssh_args[@]}" "$host" "bash -s -- $tag" < deploy/serveros-remote.sh
finish_steps "completo (local + servidor)"
