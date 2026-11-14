# Implantação no ServerOS

Aplicação estática compilada com Node.js 22 e servida por Nginx sem root.
O build da imagem executa `npm ci`, os testes e o build Vite. Não há banco
de dados ou volume de dados da aplicação no servidor.

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

O arquivo `.env` do servidor contém:

```dotenv
ROTA_BIND_IP=100.112.221.34
ROTA_PORT=8088
ROTA_IMAGE_TAG=vilhena-20261114
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
```

O contêiner tem healthcheck, reinício automático, filesystem somente leitura,
limites de recursos e rotação de logs. JSONs e outros arquivos estáticos
incluídos no build ficam públicos no domínio.

## Atualização recebida em 14/11/2026

Fontes importadas de `rota-adaptada-main (2).zip`. O teste do motor de Vilhena
foi adaptado de Vitest (não declarado nas dependências) para `node:test`,
usado pelo restante do projeto. Chamadas, campos e expectativas antigas foram
alinhados ao pacote recebido: ciclo padrão da soja de 118 dias, intervalo de
7 dias, safrinha atrasada em 26/03/2027 e ajuste de ciclo em janela `ZARC_30`.
Não foram alterados o motor ou as regras agronômicas para fazer os testes passar.
Esses testes não certificam a origem dos dados nem validam as regras oficiais.
