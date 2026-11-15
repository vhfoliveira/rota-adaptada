# ZARC municipal — Rota Adaptada

O app consulta arquivos no próprio site. GPS → geocodificação do município → correspondência exata de nome/UF no índice IBGE do MAPA → arquivo municipal → safra, data (decêndio), solo e manejo → opções de culturas. Não consulta o MAPA a cada produtor e não usa a antiga lista estadual de cultivares como indicação municipal.

## Fonte oficial

- MAPA, [ZARC — Tábua de Risco](https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico).
- Licença declarada no manifesto: Creative Commons Attribution (`cc-by`), sem versão especificada. Preservar atribuição e [link da licença](https://opendefinition.org/licenses/cc-by/).
- A cópia incluída corresponde à safra 2026/2027 e à atualização da fonte de 13/11/2026.

## Base incluída e rastreabilidade

`public/zarc/manifest.json` contém origem, URL do CSV, licença, data, SHA-256 do arquivo original, safra, índice municipal e todas as dimensões de cenário. Os arquivos `public/zarc/<versão>/<IBGE>.json.gz` conservam cada linha e os 36 níveis de risco. A transformação compacta valores `0,20,30,40` em caracteres `0,2,3,4`, sem mudar o conteúdo.

Base inicial: **1.127.969 linhas, 5.573 códigos municipais, 21 culturas/modalidades anuais**. Arquivo original: cerca de 237 MiB. Shards compactados: 6.234.935 bytes no total, além do manifesto. SHA-256: `b5d242f78571d4694c843f8a5f8fcad4dc10c1c83192ebae2d40b78cc5f5efe3`.

Não inclui neste primeiro pacote culturas perenes, olerícolas ou sem safra. A safra consultada é exibida automaticamente; não se pede ao produtor que escolha códigos. A data é cruzada com a tabela da safra apresentada, somente nos anos cobertos, nunca antes da publicação da portaria correspondente. Não é certificação de vigência contratual, enquadramento em seguro/crédito ou validação das restrições adicionais das portarias.

## Solo e clima sem bloquear a descoberta

Sem classe de solo confirmada, o app mostra opções condicionais em todos os solos publicados, preservando as condições de ciclo, irrigação, clima, nível de manejo e portaria em detalhes. É possível refinar solo e irrigação, opcionalmente. AD1–AD6 não são inferidas como confirmação oficial a partir da textura do SoilGrids. Tipos 1/2/3 não são convertidos em AD automaticamente.

Valor zero significa ausência de indicação naquele registro/período, nunca risco zero. A tábua de risco não fornece duração em dias. O registro de parâmetros
oficiais acrescenta referências documentadas ou hipóteses por teto de faixa;
veja [parâmetros oficiais](PARAMETROS_OFICIAIS.md). Percentuais não são probabilidades gerais de sucesso. Ausência de registros é diferenciada de falha de consulta ou safra não coberta.

Geocodificação não depende do SoilGrids. Mesmo sem solo, o app pode mostrar o catálogo municipal e um resumo mensal real da NASA (chuva e temperatura). O cálculo de estresse que exige capacidade de água do solo permanece condicionado à obtenção dessa informação. A comparação NASA no modo campo só usa correspondências explícitas de culturas encontradas no ZARC; culturas sem parâmetros no motor permanecem visíveis na lista oficial.

## Atualização diária no servidor

O `compose.yaml` inclui o serviço `zarc-updater`, construído por `deploy/Dockerfile.zarc`. Ele consulta o CKAN oficial ao iniciar e a cada **86.400 segundos**. Descobre o CSV anual mais recente, verifica host/licença, baixa para área temporária e importa apenas depois de validar o esquema, a safra, municípios e todos os riscos. Publica o manifesto por substituição atômica **depois** dos shards. Falha preserva a última base válida e grava `update-status.json`.

O volume `zarc-data` é gravável apenas pelo atualizador e montado para leitura no nginx. `/zarc/` prefere a base do volume e usa a cópia oficial embutida no site enquanto não houver atualização. O navegador solicita apenas recursos da mesma origem; não precisa de CORS do MAPA. A consulta não é armazenada pelo service worker como resposta permanente.

Ativação no ambiente Docker: `docker compose up -d --build`. Para o ambiente ServerOS, usar o procedimento existente com `compose.serveros.yaml`. Inspecionar `docker compose logs zarc-updater` e `/zarc/update-status.json` após implantação. Versões anteriores são preservadas para não quebrar consultas já abertas; monitorar o volume e remover versões antigas apenas em manutenção controlada.

Hospedagem puramente estática não executa esse serviço: nela, agendar o atualizador no servidor/CI e republicar os arquivos. Atualização manual local: `node scripts/update-zarc.mjs` na pasta da aplicação. Importação de download oficial obtido pelo navegador: `python3 scripts/import-zarc-risk.py /caminho/arquivo-oficial.csv --download URL_OFICIAL --source-updated DATA`.

## Verificação

Testes com dados reais de Vilhena: 14/11/2026 + AD4 + sequeiro retorna soja, milho 1ª safra e milho 1ª safra consorciado; 15/02/2027 retorna feijão 2ª safra e as duas modalidades de milho 2ª safra. Testes também cobrem ausência de solo, indisponibilidade, safra diferente, mudança de município, risco zero, datas inválidas e descompactação na mesma origem.
