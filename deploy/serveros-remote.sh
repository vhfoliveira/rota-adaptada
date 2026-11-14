#!/usr/bin/env bash
set -Eeuo pipefail
tag=$1
[[ $tag =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || exit 2
stack=/opt/stacks/rota-adaptada
stage=$(mktemp -d /tmp/rota-release.XXXXXX)
trap 'rm -rf "$stage"' EXIT
exec 9>/opt/stacks/.rota-adaptada-deploy.lock
flock -n 9 || { echo 'Outro deploy está em andamento.' >&2; exit 1; }
tar -xzf "/tmp/$tag.tar.gz" -C "$stage"
cp "$stack/.env" "$stage/.env"
cd "$stage"
export ROTA_IMAGE_TAG=$tag
compose=(docker compose -p rota-adaptada -f compose.yaml -f compose.serveros.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" build
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
# Substitui a pasta de fontes inteira, evitando arquivos antigos no próximo build.
rm -rf "$stack/rota-adaptada"
cp -a rota-adaptada "$stack/"
cp Dockerfile compose.yaml compose.serveros.yaml .dockerignore "$stack/"
cp -a deploy/. "$stack/deploy/"
cd "$stack"
"${compose[@]}" up -d --no-build --wait --wait-timeout 90
curl --retry 5 --retry-delay 2 --retry-all-errors --max-time 15 -fsS https://deltashift.udisoft.app.br/healthz
curl --retry 5 --retry-delay 2 --retry-all-errors --max-time 15 -fsS https://deltashift.udisoft.app.br/ -o "$stage/public.html"
docker exec "$("${compose[@]}" ps -q web)" cat /usr/share/nginx/html/index.html > "$stage/image.html"
cmp "$stage/public.html" "$stage/image.html"
sed -i "s/^ROTA_IMAGE_TAG=.*/ROTA_IMAGE_TAG=$tag/" .env
trap - ERR
"${compose[@]}" ps
rm -f "/tmp/$tag.tar.gz"
echo "Publicado: $tag | Backup: $backup"
