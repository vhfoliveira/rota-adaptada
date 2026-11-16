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
tag=$1
[[ $tag =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || exit 2
stack=/opt/stacks/rota-adaptada
stage=$(mktemp -d /tmp/rota-release.XXXXXX)
trap 'rm -rf "$stage"' EXIT
exec 9>/opt/stacks/.rota-adaptada-deploy.lock
flock -n 9 || { echo 'Outro deploy está em andamento.' >&2; exit 1; }
start_step 'Preparação no servidor'
tar -xzf "/tmp/$tag.tar.gz" -C "$stage"
cp "$stack/.env" "$stage/.env"
cd "$stage"
export ROTA_IMAGE_TAG=$tag
compose=(docker compose -p rota-adaptada -f compose.yaml -f compose.serveros.yaml)
"${compose[@]}" config --quiet
start_step 'Build das imagens (dependências, testes e Vite)'
BUILDKIT_PROGRESS=plain "${compose[@]}" build
start_step 'Backup da versão anterior'
backup=/opt/stacks/rota-adaptada-backups/$tag.tar.gz
mkdir -p "$(dirname "$backup")"
tar -czf "$backup" -C "$stack" .
rollback() {
  trap - ERR
  echo 'Falha na ativação; restaurando a versão anterior.' >&2
  tar -xzf "$backup" -C "$stack"
  cd "$stack"
  unset ROTA_IMAGE_TAG
  "${compose[@]}" up -d --no-build --wait --wait-timeout 90
  exit 1
}
trap rollback ERR
start_step 'Instalação dos arquivos'
# Substitui a pasta de fontes inteira, evitando arquivos antigos no próximo build.
rm -rf "$stack/rota-adaptada"
cp -a rota-adaptada "$stack/"
cp Dockerfile compose.yaml compose.serveros.yaml .dockerignore "$stack/"
cp -a deploy/. "$stack/deploy/"
cd "$stack"
start_step 'Ativação e espera pelo healthcheck'
"${compose[@]}" up -d --no-build --wait --wait-timeout 90
start_step 'Validação HTTPS e comparação da versão publicada'
curl --retry 5 --retry-delay 2 --retry-all-errors --max-time 15 -fsS https://rotaadaptada.udisoft.app.br/healthz
curl --retry 5 --retry-delay 2 --retry-all-errors --max-time 15 -fsS https://rotaadaptada.udisoft.app.br/ -o "$stage/public.html"
docker exec "$("${compose[@]}" ps -q web)" cat /usr/share/nginx/html/index.html > "$stage/image.html"
cmp "$stage/public.html" "$stage/image.html"
sed -i "s/^ROTA_IMAGE_TAG=.*/ROTA_IMAGE_TAG=$tag/" .env
trap - ERR
"${compose[@]}" ps
rm -f "/tmp/$tag.tar.gz"
echo "Publicado: $tag | Backup: $backup"
finish_steps servidor
