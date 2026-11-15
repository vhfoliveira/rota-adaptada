# Classificação de água disponível estimada

O SoilGrids fornece areia, silte e argila; `soil-water.js` aplica a equação
da célula J20 da calculadora oficial disponibilizada pelo MAPA:

https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/documentos/ClculodeAD_s2.xlsx

Consultada em 15/11/2026. SHA-256 do arquivo:
`a72f2e0da3b7e08cf747f2bac4c923431e66e102cb53b410c3d45063a3a28079`.

Com A=areia, S=silte e C=argila em porcentagem:

```
t = -0.02128887*A -0.01005814*S -0.01901894*C
    +0.0001171219*A*S +0.0002073924*A*C
    +0.00006118707*S*C -0.000006373789*A*S*C
AD = ROUND(10 * (1 + 0.3591*t)^2.78474, 2)
```

AD em mm/cm. Limites inferiores inclusivos: AD1=0,34; AD2=0,46;
AD3=0,61; AD4=0,80; AD5=1,06; AD6=1,40. Abaixo de 0,34 não
se atribui AD1. Acima de 1,84 conserva-se o resultado e a classe AD6,
conforme a busca por limite inferior da planilha.

O aplicativo aplica a fórmula à média ponderada de textura entre 0 e 60 cm.
Isso é uma estimativa regional experimental, não uma análise laboratorial.
A tolerância de fechamento é de 0,3 ponto percentual; dentro dela,
normalizam-se as três frações para totalizar 100%, como exige a planilha.
As entradas originais e normalizadas ficam preservadas no resultado.

`estimatedSoil` armazena classe, AD, origem estimada, provedor, método,
fonte, entradas e profundidade. `confirmedSoil` é separado e só recebe
a classe explicitamente informada pelo produtor. A consulta não preenche
o solo confirmado do ZARC. Perfis genéricos AD1–AD6 não herdam nomes
pedológicos, Tipos 1/2/3 nem reservas fixas de água dos perfis legados.
CAD depende da profundidade efetiva de raízes; não é o mesmo que AD.

Planos e perfis antigos não são reclassificados automaticamente.

## Sugestões e interface

Em caso de timeout ou outra falha do SoilGrids, a seleção manual fica disponível
no exemplo e na inclusão manual. “Não sei meu solo” é mantido, e as demais opções
são extraídas dos registros ZARC do município e da safra consultados. Quando há
cultivos escolhidos, são usadas as classes presentes nos registros desses cultivos;
antes dessa escolha, é usada a união das classes das culturas municipais.
Tipos 1/2/3 e AD1–AD6 aparecem em grupos separados, somente quando publicados
nesse contexto. O campo aguarda a consulta municipal, sem preencher uma lista
nacional em caso de falha. Uma classe previamente informada que deixe de ter
registros no contexto fica identificada e indisponível para nova seleção, sem
ser apagada, convertida ou substituída silenciosamente por “Não sei meu solo”.
Os dois sistemas de classificação são opções distintas e não são convertidos
automaticamente. Uma classe informada tem prioridade sobre a estimativa.
Sem classe informada e sem estimativa disponível, nenhum filtro de solo é
aplicado; as condições oficiais continuam visíveis para conferência.

O fluxo guiado consulta o solo do exemplo ao abri-lo e da inclusão manual após
confirmar a localização. A falha é preservada ao editar outros campos e gerar
sugestões, evitando repetir o timeout automaticamente. “Tentar novamente” inicia
uma nova consulta. O limite e a implementação da consulta SoilGrids permanecem
inalterados.

A consulta ZARC recebe `estimatedAdClass` separadamente de `soilCode`.
O solo informado pelo produtor tem prioridade. Sem ele, AD1–AD6 filtram
somente registros AD; registros em Tipos 1/2/3 continuam visíveis, com
`soilOrigin: unknown` e condições a confirmar. Não existe conversão automática.
Município, data, cultura, ciclo, manejo e safra permanecem filtros independentes.
As condições baseadas no mapa recebem `soilOrigin: estimated`, sem marcar
`soilConfirmed`. O motor mantém as avaliações estimadas como condicionais.

No fluxo guiado, a lista ZARC aparece mesmo enquanto o solo é consultado e
é refinada quando chega a estimativa. Falhas deixam a lista sem filtro presumido.
As sugestões de planejamento também consultam o solo antes de montar opções;
se a consulta falhar, continuam com as condições oficiais por confirmar.
Cancelamento e mudança de localização descartam resultados antigos.

A interface apresenta “Solo Estimado: AD…” ou “Solo não estimado”. O produtor
pode substituir por uma classe conhecida ou voltar a usar a estimativa.
Os detalhes mostram fonte, licença, profundidade, frações, água disponível e
método. As informações acompanham relatórios e o armazenamento dos planos.

Fontes e licenças continuam as já verificadas: SoilGrids CC BY 4.0,
ZARC Creative Commons Attribution e dados NASA POWER. As regras de 2026 e
o esclarecimento da organização permitem materiais externos com direitos de
uso e atribuição documentados; não significam aprovação individual da base:

- https://www.spaceappschallenge.org/legal/
- https://github.com/nasa/spaceapps/discussions/1827

## Momento da consulta

No Exemplo, o solo é consultado já na primeira tela, inclusive ao retomar um
rascunho. A tela mostra o andamento e atualiza a classe ao receber a resposta;
o resultado é salvo no rascunho e reaproveitado nas consultas seguintes do mesmo
ponto. Uma falha permite continuar sem atribuir classe. O clima do Exemplo e
as fontes do planejamento manual são consultados ao abrir o calendário após
confirmar e salvar. Na geração automática, o solo é consultado
antes de montar as sugestões. No painel avançado, a consulta ocorre pelo botão
“Consultar clima e solo”. É necessário um ponto com latitude e longitude.

A resposta atualiza `draft.estimatedSoil`, sem preencher `soilCode` (informado
pelo produtor). Quando o plano já foi salvo, somente os metadados da observação
de solo são atualizados, após conferir que as coordenadas ainda correspondem.
O resumo distingue consulta pendente, classe estimada, classe informada e
ausência de estimativa. Resposta HTTP 200 com valores nulos não produz classe AD.
