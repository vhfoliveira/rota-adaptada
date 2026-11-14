#!/usr/bin/env bash
set -Eeuo pipefail
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
tar --exclude=node_modules --exclude=dist --exclude='.env*' --exclude=.git \
  -czf "$tmp/$tag.tar.gz" Dockerfile compose.yaml compose.serveros.yaml .dockerignore deploy rota-adaptada
if [[ ${1:-} == --check ]]; then
  tar -tzf "$tmp/$tag.tar.gz" >/dev/null
  echo 'Sintaxe e empacotamento validados; nenhum acesso ao servidor.'
  exit 0
fi
ssh_args=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
config=${SERVEROS_SSH_CONFIG:-$HOME/.ssh/config}
[[ ! -f $config ]] || ssh_args+=(-F "$config")
host=${SERVEROS_HOST:-serveros}
echo "Enviando $tag para $host..."
ssh "${ssh_args[@]}" "$host" "cat > /tmp/$tag.tar.gz" < "$tmp/$tag.tar.gz"
ssh "${ssh_args[@]}" "$host" "bash -s -- $tag" < deploy/serveros-remote.sh
