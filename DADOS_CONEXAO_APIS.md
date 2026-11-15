# Fontes de dados e conexões — Rota Adaptada

Este documento descreve as integrações utilizadas pelo código atual. Os arquivos
canônicos de referência ficam em `rota-adaptada/src/data/`; os dados municipais
ZARC distribuídos ao navegador ficam em `rota-adaptada/public/zarc/`.

## NASA POWER

Implementação: [vilhena-engine.js](rota-adaptada/src/vilhena-engine.js), função
`fetchLiveNasaPower(latitude, longitude, {startDate, endDate})`.

O navegador faz `GET` público, sem chave, para
`https://power.larc.nasa.gov/api/temporal/daily/point`, com limite de 14 segundos.
A consulta usa `community=AG`, `format=JSON`, coordenadas arredondadas a quatro
casas decimais e estas variáveis:

| Parâmetro | Uso interno |
|---|---|
| `PRECTOTCORR` | Chuva diária em mm; primeira posição da série |
| `T2M_MAX`, `T2M_MIN` | Temperaturas máxima e mínima em °C |
| `GWETROOT`, `GWETTOP` | Índices de umidade radicular e superficial entre 0 e 1 |

O início padrão vem do histórico local (`2013-01-01`). A consulta avançada usa,
por padrão, a data corrente como término; a jornada guiada solicita até 31 de
dezembro do ano anterior. O período exibido é o efetivamente retornado, e a
avaliação considera os anos com dados suficientes para cada ciclo. O histórico
local de Vilhena cobre 2013–2024; esse intervalo não limita consultas ao vivo.

O nome legado `IMERG_PRECTOT` ainda identifica a primeira coluna no formato
interno. Na consulta ao vivo, seu conteúdo vem de `PRECTOTCORR`; esse nome não
comprova uma consulta ao produto IMERG.

Dias sem chuva válida são omitidos; outras leituras inválidas ficam `null`.
Altitude ausente também fica `null`. O motor não preenche lacunas com chuva zero,
temperaturas médias ou umidade inventada. Um ciclo sem todos os dados necessários
fica não avaliado.

Em caso de falha, só pode ser reutilizada uma série da mesma coordenada, com a
precisão adotada pelo cache. A base local de Vilhena não é aplicada a outra
propriedade. O cache climático fica em memória durante a sessão. O resumo mensal
em [climate-summary.js](rota-adaptada/src/climate-summary.js) compara apenas meses
com chuva diária completa; histórico não é previsão meteorológica.

## Solo — ISRIC SoilGrids

A função `fetchSoilGridsAndSuggestClass` em
[vilhena-engine.js](rota-adaptada/src/vilhena-engine.js) consulta
`https://rest.isric.org/soilgrids/v2.0/properties/query` por `GET`, sem chave,
com limite de 9 segundos. Solicita `clay`, `sand`, `value=mean` e profundidades
`0-5cm`, `5-15cm`, `15-30cm` e `30-60cm`.

O código aplica o fator de conversão declarado na resposta e pondera as camadas
pela espessura. A textura estimada sugere um perfil de água disponível do catálogo
interno. Essa sugestão não confirma uma classe oficial de solo ZARC nem substitui
uma análise local. Sem dados suficientes, textura e perfil sugerido ficam ausentes;
não há substituição baseada na região geográfica ou na umidade da NASA.

## Localização e mapa

| Recurso | Implementação e comportamento |
|---|---|
| GPS do navegador | `navigator.geolocation.getCurrentPosition`; exige contexto seguro e permissão. A jornada guiada mostra precisão e pede confirmação do ponto e município. |
| Nominatim | [location.js](rota-adaptada/src/location.js) consulta `https://nominatim.openstreetmap.org/reverse` com `format=json`, `lat`, `lon`, `zoom=10` e limite de 9 segundos. Falha mantém município/UF desconhecidos e permite escolha manual. |
| Lista municipal | O índice de `zarc/manifest.json` fornece os municípios disponíveis para escolha. |
| Mapa base | [guided-location.js](rota-adaptada/src/guided-location.js) carrega MapLibre e o estilo `https://tiles.openfreemap.org/styles/positron` apenas ao abrir o mapa. |
| Malha municipal | O seletor consulta `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/{IBGE}?formato=application/vnd.geo+json&qualidade=minima`, com limite de 12 segundos, para enquadrar o município. |

O mapa seleciona um ponto; não delimita ou mede a propriedade. É possível consultar
apenas o município, sem enviar um ponto para análise climática ou de solo.
Geocodificação e catálogo municipal não dependem do sucesso do SoilGrids.

## ZARC — Tábua de Risco do MAPA

A consulta atual usa [zarc-risk.js](rota-adaptada/src/zarc-risk.js),
[zarc-panel.js](rota-adaptada/src/zarc-panel.js) e os módulos guiados. A fonte
registrada é a [Tábua de Risco do MAPA](https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico).

O navegador carrega `./zarc/manifest.json` e
`./zarc/{versão}/{código-IBGE}.json.gz`, da mesma origem, com limite de 15 segundos.
O manifesto registra safra, cobertura, origem, licença, atualização e hash. Os
arquivos municipais precisam corresponder à versão do manifesto. A consulta cruza
município, data/decêndio, safra, solo e manejo, preservando as condições e portarias.

Sem solo confirmado, aparecem opções condicionais. `0` significa ausência de
indicação publicada naquele registro, não risco zero. Grupos de ciclo não são
convertidos automaticamente em dias; percentuais não são probabilidades gerais
de sucesso. Dados ausentes, período não coberto e falha de consulta são situações
distintas. O pacote regional do motor em `src/data/vilhena_rules-v2.json` permanece
uma referência do exemplo, separado da base municipal atualizável.

O serviço opcional `zarc-updater` do Compose consulta o CKAN oficial diariamente,
valida e importa os dados antes de substituir o manifesto. Falhas preservam a
última versão válida. No nginx, o volume atualizado tem preferência sobre a base
embutida. Em hospedagem puramente estática, a atualização precisa ocorrer fora do
navegador e os arquivos precisam ser republicados. Operação, atribuição e limites
estão em [ZARC.md](rota-adaptada/docs/ZARC.md).

## Dados locais e disponibilidade

Rascunhos, cadastros e planejamentos são salvos no IndexedDB do dispositivo.
Coordenadas escolhidas são enviadas aos provedores quando a consulta correspondente
é executada. Não há conta ou sincronização de cadastros com um servidor.

O service worker armazena a interface e recursos estáticos para abertura offline.
Ele não transforma respostas de clima, solo ou ZARC em uma base offline permanente.
Novas consultas dependem de conectividade; falhas devem permanecer visíveis sem
inventar resultados. Veja [o contrato do motor](rota-adaptada/docs/MOTOR_CENARIOS.md)
e [o guia de interação](rota-adaptada/docs/GUIA_AUTOGUIADO.md).
