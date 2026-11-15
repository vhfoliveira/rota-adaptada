# Implantação no ServerOS

Frontend estático compilado com Node.js 22 e servido por Nginx sem root.
O build da imagem web executa `npm ci`, os testes e o build Vite. Rascunhos e
planejamentos são armazenados no navegador; não há banco de dados do produtor
no servidor.

O Compose também inclui `zarc-updater`, um serviço Python que consulta a fonte
oficial ao iniciar e a cada 86.400 segundos. Ele grava a base municipal no volume
`zarc-data`, montado somente para leitura no Nginx. `/zarc/` prefere essa base e
usa a cópia incluída no build enquanto não houver atualização. Falhas preservam
a última base válida. Veja [a documentação da base ZARC](../rota-adaptada/docs/ZARC.md).

## Executar localmente

```bash
docker compose up -d --build --wait
```

Acesse http://127.0.0.1:8088. O endereço de bind padrão é somente loopback.

## ServerOS

- Diretório: `/opt/stacks/rota-adaptada`.
- URL: https://deltashift.udisoft.app.br.
- Acesso auxiliar Tailscale: http://100.112.221.34:8088.
- Rede externa Docker: `proxy`.
- Alias exclusivo do serviço: `rota-adaptada-web`.
- Proxy existente: `proxy-nginx`.

Configuração do arquivo `.env` do servidor (use a tag da versão desejada):

```dotenv
ROTA_BIND_IP=100.112.221.34
ROTA_PORT=8088
ROTA_IMAGE_TAG=rota-VERSAO
```

Depois de enviar os arquivos atualizados, usar uma tag de imagem nova e executar:

```bash
cd /opt/stacks/rota-adaptada
docker compose -f compose.yaml -f compose.serveros.yaml config --quiet
docker compose -f compose.yaml -f compose.serveros.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.serveros.yaml ps
```

Para voltar a uma imagem anterior, definir sua tag em `ROTA_IMAGE_TAG` e
executar `up -d --no-build --wait` com os mesmos dois arquivos Compose.

## HTTPS

`deploy/deltashift.udisoft.app.br.conf` é instalado em
`/opt/stacks/proxy/conf.d/deltashift.udisoft.app.br.conf`.
O certificado é emitido pelo Certbot existente com validação HTTP webroot.
A renovação usa o agendamento já existente do proxy, diariamente às 03:15
no horário configurado no servidor, sem novo cron.

Validar antes de recarregar:

```bash
docker exec proxy-nginx nginx -t
docker exec proxy-nginx nginx -s reload
```

## Verificação e logs

```bash
curl -fsS https://deltashift.udisoft.app.br/healthz
docker compose -f compose.yaml -f compose.serveros.yaml logs --tail=100 web
docker compose -f compose.yaml -f compose.serveros.yaml logs --tail=100 zarc-updater
curl -fsS https://deltashift.udisoft.app.br/zarc/update-status.json
```

O contêiner web tem healthcheck e filesystem somente leitura. Os dois serviços
têm reinício automático, limites de recursos e rotação de logs. JSONs e outros
arquivos estáticos incluídos no build ficam públicos no domínio. O arquivo
`update-status.json` fica disponível após a primeira tentativa do atualizador;
o healthcheck web não verifica a atualização ZARC.

## Deploy em um comando

Na raiz deste repositório, execute:

```bash
./deploy/serveros.sh
```

Requer SSH configurado para `serveros`, acesso pela rede Tailscale e Docker
Compose no servidor. O script usa `~/.ssh/config` explicitamente. Para outro
host/configuração, defina `SERVEROS_HOST` e `SERVEROS_SSH_CONFIG`.

Publica os arquivos locais de `rota-adaptada`, incluindo mudanças ainda sem
commit. Exclui dependências locais, builds anteriores e arquivos `.env*`.
O `.env` do servidor é preservado. O build executa `npm ci`, todos os testes e
Vite antes de alterar o serviço. Um bloqueio impede dois deploys simultâneos.

Cada publicação web recebe uma tag única e um backup dos arquivos da stack em
`/opt/stacks/rota-adaptada-backups/`. Após iniciar o contêiner, verifica a saúde,
o HTTPS e se o HTML público corresponde à imagem nova. Se a ativação falhar,
restaura o backup e tenta reativar a imagem anterior. As imagens anteriores e
os backups são mantidos para reversão; a limpeza é manual. O volume `zarc-data`
não faz parte desse backup e suas versões são preservadas pelo atualizador.

```bash
./deploy/serveros.sh --check # Valida sintaxe e pacote, sem acessar o servidor
./deploy/serveros.sh --help
```
