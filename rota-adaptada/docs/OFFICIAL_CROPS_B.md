# Parâmetros oficiais: cereais e consórcios

Conferência limitada à safra **2026/2027**, com corte de publicação em **14/11/2026**. O arquivo `src/data/official-crop-profiles-b.json` contém 120 perfis por cultura, UF e sistema de cultivo, provenientes de 120 documentos oficiais distintos. A coleta leu os índices de todas as 27 UFs e identificou 144 fontes para as famílias deste lote. As 24 fontes restantes estão registradas em `pendingSources`, com URL, UF, motivo e hash da resposta recebida. `stateIndexAudit` preserva o resultado de cada índice, inclusive falhas e a quantidade de links encontrados. Ausência de um link não é interpretada como autorização para reutilizar outra UF.

| Família | Perfis validados | Informação aproveitável |
| --- | ---: | --- |
| Arroz | 18 | 15 de sequeiro e 3 irrigados subtropicais; faixas de ciclo por grupo |
| Sorgo granífero | 27 | Faixas de ciclo por grupo; fonte estadual cobre os códigos das duas safras |
| Sorgo forrageiro | 27 | Faixas até maturação fisiológica; não representam data de corte/ensilagem |
| Milho consorciado com braquiária, 1ª safra | 15 | Durações publicadas das quatro fases |
| Milho consorciado com braquiária, 2ª safra | 15 | Durações publicadas das quatro fases |
| Aveia | 7 | Faixas distintas entre estados e sistema de cultivo |
| Cevada | 11 | Faixas distintas entre estados e sistema de cultivo; correspondência dos códigos de grãos e cervejeira confirmada pela portaria/UF/regime do CSV |

## O que os números significam

As portarias de arroz, sorgos, aveia e cevada publicam **faixas** de duração, e não uma duração exata para cada agricultor. Esses perfis têm `representativeDays: null` e `phases: null`. O aplicativo pode apresentar um cenário conservador pelo limite superior finito, identificado como hipótese de planejamento. Um grupo com limite superior aberto continua sem uma duração automática exata. Os limites abertos/fechados são preservados, inclusive o arroz com grupo I estritamente menor que 115 dias.

Nessas fontes, a contagem começa na emergência. A faixa de 5–10 dias entre semeadura e emergência só é registrada quando a convenção aparece expressamente na seção 3.1. Se essa informação desaparecer da fonte, o coletor deixa `emergenceDaysRange: null`.

O milho consorciado é diferente: a tabela informa as durações das fases desde a semeadura. As somas 100, 120 e 140 dias são **derivadas das fases publicadas**, não de uma média arbitrária das faixas. A 2ª safra publica os grupos I e II. Não se adicionam outros 5–10 dias de emergência a esses calendários. A duração corresponde ao milho; não estima a permanência ou a dessecação da braquiária.

Os ciclos não são uniformes nacionalmente. Por exemplo:

| Fonte/cultura | Grupo I | Grupo II | Grupo III | Grupo IV |
| --- | --- | --- | --- | --- |
| Aveia PR | ≤120 | 121–140 | >140 | — |
| Aveia RS/SC | ≤130 | 131–150 | >150 | — |
| Aveia MG/SP | ≤110 | 111–120 | >120 | — |
| Cevada PR | ≤110 | 111–120 | >120 | — |
| Cevada RS/SC | ≤130 | 131–150 | >150 | — |
| Arroz irrigado PR/SC | <115 | 115–130 | >130 | — |
| Arroz irrigado RS | ≤105 | 106–120 | 121–135 | ≥136 |

Os códigos de grupo preservam a convenção do catálogo ZARC: I=20, II=21, III=22, IV=24. A existência de um grupo no perfil não autoriza oferecer esse grupo sem correspondência na consulta municipal do ZARC.

## Limites da avaliação climática

O milho consorciado tem critério de temperatura mínima inferior a 2 °C nas fases 1, 2 e 3, que podem ser localizadas pela tabela. O critério de temperatura média inferior a 18 °C na fase 3 exige a variável T2M: não é permitido substituir a média oficial por `(Tmax + Tmin) / 2`.

Aveia e cevada têm referência de geada ao redor do espigamento. Sem a data desse evento ou as durações das fases, `scope: null` impede executar o alerta. Para os demais perfis sem duração de fases, o resumo climático pode descrever o intervalo de planejamento, mas não deve produzir alertas por fase inventada.

As portarias também apresentam ISNA, capacidade de água disponível, fotoperíodo e condições de manejo. Estes elementos não são convertidos em limiares ad hoc de precipitação ou umidade da NASA. O lote não reproduz o balanço hídrico nem o modelo de risco do ZARC. O cenário irrigado pressupõe irrigação; não verifica água disponível ou operação do sistema.

## Evidência e conferência visual

Todas as fontes aceitas têm URL, portaria, UF, sistema de cultivo, safra, data de publicação no DOU, data de assinatura, data de conferência, seções e SHA-256 do PDF. `publishedAt` é a data do DOU usada no CSV; `signedAt` é somente proveniência adicional. A portaria 260, por exemplo, foi assinada em 30/06/2026 e publicada em 14/07/2026.

As tabelas e limites foram extraídos com `pdftotext -layout`, comparados com padrões revisados e conferidos visualmente em páginas renderizadas. Foram verificadas especialmente as tabelas do milho consorciado, aveia RS, cevada irrigada DF e as diferenças do arroz irrigado PR/RS. Cada documento estadual é processado separadamente; parâmetros de Rondônia não são aplicados nacionalmente por aproximação.

Fontes representativas, cujos parâmetros e metadados completos constam no JSON:

- [Milho consorciado, 1ª safra, RO — portaria 260](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PO13E61.PDF), seções 1.14–1.16.
- [Milho consorciado, 2ª safra, RO — portaria 346](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PO46791.PDF), seções 1.15–1.17.
- [Sorgo granífero, RO — portaria 285](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN285SORGOGRANIFERORO.pdf), seção 1.8.2.
- [Sorgo forrageiro, RO — portaria 312](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN312SORGOFORRAGEIRORO.pdf), seção 1.9.2.
- [Aveia PR — portaria 382](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/parana/PORTN382AVEIASEQPR.pdf) e [aveia RS — portaria 383](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rio-grande-do-sul/PORTN383AVEIASEQRS.pdf), seção 1.10 d.
- [Cevada irrigada DF — portaria 396](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/distrito-federal/PORTN396CEVADAIRRIGADODF.pdf), seção 1.9 b.
- [Arroz irrigado RS — portaria 66](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rio-grande-do-sul/PORTN62.PDF), seção 1.10.3.

## Pendências preservadas

Dos 24 links pendentes, 17 são de trigo com documentos anteriores a 2026/2027; quatro são de arroz irrigado tropical antigo; um é de arroz de sequeiro TO da safra anterior; dois links de aveia MS retornaram HTML genérico do portal em lugar do PDF. Não foi atribuído um ciclo de outro estado ou de outra safra para resolver essas lacunas.

Portarias com publicação posterior a 14/11/2026 são rejeitadas, ainda que o catálogo local já contenha referências a elas. Documentos sem safra compatível, cabeçalho de outra cultura/UF/regime ou tabelas não reconhecidas também permanecem pendentes.

## Reprodução e atualização

Requer Python 3 e Poppler (`pdftotext`). A coleta ocorre no desenvolvimento/atualização do catálogo; o usuário final não precisa fornecer parâmetros.

```sh
python scripts/collect-official-crop-sources-b.py --as-of 2026-11-14 --output /tmp/profiles-b.json
python scripts/collect-official-crop-sources-b.py --as-of 2026-11-14 --offline --output /tmp/profiles-b.json
python scripts/collect-official-crop-sources-b.py --as-of 2026-11-14 --refresh --output /tmp/profiles-b-refreshed.json
python -m unittest scripts/test_official_crop_sources_b.py
```

`--offline` exige o cache e permite reproduzir a extração sem rede. `--refresh` baixa novamente índices e PDFs, substituindo o cache; é incompatível com `--offline`. O cache padrão fica em `/tmp/rota-zarc-b/collector-cache` e pode ser alterado com `--cache`. `--states RO,PR` limita uma investigação; a publicação do catálogo nacional deve usar todas as UFs e validar o arquivo temporário antes da substituição.

Os testes verificam isolamento entre MT/MS, cultura e regime, rejeição de publicação futura/safra anterior, mudança de limite ou fases, ausência da convenção de emergência, escopo dos links, limites estaduais diferentes, rastreabilidade e ausência de fases inventadas.

O atualizador conjunto aceita caches separados e uma conferência sem publicação:

```sh
npm run update:crop-parameters -- --offline --check --as-of 2026-11-14 --cache-a /tmp/rota-zarc-official-a --cache-b /tmp/rota-zarc-b/collector-cache
```

Ele extrai ambos os lotes em arquivos temporários, valida seus perfis e rejeita perda de perfis já publicados antes de substituir qualquer arquivo. `--check` também executa essa proteção, mas preserva os JSON atuais e informa quais lotes seriam alterados. Sem `--check`, os dois lotes aprovados são preparados antes da substituição. `--cache` continua disponível como diretório comum com subpastas `a` e `b`; `--cache-a` e `--cache-b` substituem os respectivos caminhos.

A conferência operacional em 14/11/2026 reproduziu os lotes A/B sem diferenças: 305 perfis, 27 UFs, 18 códigos de cultura, 854 grupos com calendário e 191 grupos pendentes. Foram rejeitados um cache vazio, uma coleta parcial e um arquivo temporário com fonte não oficial; em todos esses testes os JSON publicados permaneceram idênticos byte a byte.
