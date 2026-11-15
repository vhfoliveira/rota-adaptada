# Parâmetros oficiais: leguminosas e oleaginosas

Auditoria em **14/11/2026**, para a safra **2026/2027**. O artefato `src/data/official-crop-profiles-a.json` contém 185 perfis com escopo por cultura, UF e manejo, provenientes de PDFs do MAPA. Não houve expansão de uma portaria de Rondônia para outros estados.

| Cultura | Perfis de portarias validadas | Calendário disponível na fonte |
| --- | ---: | --- |
| Algodão herbáceo | 26 | Faixas regionais; referência adicional da cultivar BRS 293 em 8 UFs |
| Amendoim | 26 | Faixas I, II e III, sem ciclo representativo |
| Feijão | 40 | Referências de 70 e 80 dias; portarias distintas para irrigado e sequeiro |
| Feijão 2ª safra | 24 | Referências de 70 e 80 dias, sequeiro |
| Feijão caupi | 22 | Faixas I, II e III, sem ciclo representativo |
| Mamona | 27 | Faixas I a IV, sem ciclo representativo |
| Girassol | 20 | Referências de 105 e 115 dias, com quatro fases publicadas |

O número de perfis não equivale ao número de opções em um município. A aplicação precisa cruzar a cultura, o manejo, o grupo, a UF, a safra, o número e a data da portaria com a tábua municipal vigente. Os 185 perfis coincidem com combinações existentes no manifesto local dessa safra. A correspondência da data usa a **publicação no DOU**; `issuedAt` registra separadamente a assinatura.

## Parâmetros e limites de interpretação

As referências de feijão começam na semeadura e terminam na maturidade fisiológica. As portarias disponibilizam a duração representativa dos grupos, mas não o intervalo diário do florescimento usado pelo CROPGRO-Drybean. Os limiares de calor e frio durante o florescimento ficam documentados como referências não executáveis; não foi inventada uma divisão de fases.

As faixas de amendoim, caupi, mamona e algodão começam na **emergência**, não na semeadura. As próprias portarias registram um intervalo médio de 5 a 10 dias entre essas etapas. O aplicativo pode montar um cenário explícito pelo teto publicado, acrescido do limite de emergência, mas isso é uma hipótese de calendário. Um limite de faixa não se transforma em ciclo agronômico exato. Permanecem sem calendário automático genérico os grupos sem teto: amendoim III, caupi III, mamona IV e algodão III; uma cultivar nominal validada pode oferecer uma referência específica.

O algodão tem faixas diferentes entre regiões. Na maior parte das UFs, II é até 170 dias e III começa em 171; em AL, BA, CE, PB, PE, PI, RN e SE, I é até 130, II vai de 131 a 150 e III começa em 151. O compilador reconhece e verifica cada variante no respectivo PDF.

Para **BRS 293**, o [catálogo oficial da Embrapa de 2019/2020, página 13](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1112950/1/CatalogoCultivaresAlgodaoSafra2019.2020VersaoWeb.pdf) informa ciclo médio de 160 dias após emergência e indicação para DF, GO, MA, MG, MS, MT, PI e RO. A página foi conferida visualmente. A variante só entra quando a cultivar também consta na portaria atual daquela UF. É uma referência nominal histórica da cultivar, não a substituição dos grupos atuais nem uma indicação irrestrita para qualquer município.

O girassol tem calendário da semeadura à colheita: 20/35/35/15 dias no grupo I e 20/40/40/15 no grupo II. O limite de temperatura mínima pode descrever exposição ao frio durante o ciclo. O critério que usa temperatura média após o quarto decêndio não é executado com os dados diários atuais, que não trazem T2M média. O critério de doença no sexto decêndio também não é convertido em uma regra diária aproximada.

Os critérios de temperatura mínima **média por decêndio** de amendoim, caupi e mamona não foram convertidos em contagem de dias frios. Todos os perfis deixam claro que a análise NASA não reproduz o CROPGRO, SARRA, ISNA, balanço hídrico ou probabilidade oficial de risco. Não foram importados valores arbitrários de precipitação por fase, GWET, rendimento ou segurança.

## Fontes principais e rastreabilidade

As fontes são descobertas nas páginas estaduais da [safra vigente do MAPA](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente). Cada perfil mantém URL do PDF e do índice, número, assinatura, publicação, safra, seções, data de consulta e SHA-256 do arquivo recebido.

Exemplos conferidos em Rondônia:

| Fonte | Seção relevante |
| --- | --- |
| [Algodão, portaria 184](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/POAF481.PDF) | 1.8.1, 3.1 e 4: faixas, emergência e cultivares |
| [Amendoim, portaria 88](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN88AMENDOIMRO.pdf) | 1.9 e 3.1: temperatura, faixas e emergência |
| [Feijão irrigado, portaria 42](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN43.PDF) | 1.9.4 e 1.10: ciclos e critérios climáticos |
| [Feijão 2ª safra, portaria 369](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PO5F911.PDF) | 1.10.4 e 1.11: ciclos e critérios climáticos |
| [Caupi, portaria 134](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN134FEIJOCAUPIRO.pdf) | 1.9 e 3.1: faixas, temperatura e emergência |
| [Mamona, portaria 158](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rondonia/PORTN158MAMONARO.pdf) | 1.9 e 3.1: faixas, temperatura e emergência |

O girassol foi conferido, por exemplo, na [portaria 109 do RJ](https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rio-de-janeiro/PORTN109GIRASSOLRJ.pdf), seções 1.12 e 1.14; cada uma das demais 19 portarias foi verificada separadamente pelo compilador.

## Exclusões e lacunas

O registro `sourceAudit` inclui 257 candidatos: 185 perfis aceitos, 63 documentos de culturas fora deste lote e 9 não habilitados. O contexto de alguns links nos índices mistura culturas; por isso o título **dentro do PDF**, e não o título do HTML, determina a cultura.

Oito links dos índices atuais ainda apontavam para 2025/2026: girassol de AC, AP, AM, PA, RO, RR e TO, e amendoim de TO. Não foram reaproveitados como se fossem 2026/2027. Para amendoim TO, o manifesto já cita a portaria 94/2026, mas o índice aponta para a antiga 113/2025: falta validar o PDF correspondente à portaria atual. O nono caso foi um timeout em uma portaria de aveia MS, fora deste lote.

Foram pesquisados também os documentos Embrapa de BR 1 (amendoim), BRS Energia e BRS 149 (mamona), e as cultivares de amendoim runner. Essas fontes não foram usadas para preencher os grupos genericamente: apresentam escopo regional específico, referências entre germinação/emergência/colheita diferentes, intervalos em vez de valor único ou requisitos não confirmados para todo o escopo atual. Não se presume adaptação nacional a partir de um ensaio regional.

## Atualização reproduzível

Dependências: Python 3, Poppler `pdftotext`, biblioteca padrão; nenhuma dependência Python externa.

```sh
# Consulta remota explícita; índices e PDFs são baixados novamente.
python scripts/collect-official-crop-sources-a.py --cache /tmp/zarc-a --refresh

# Compilação offline dos recibos/PDFs para um arquivo de revisão.
python scripts/build-official-crop-profiles-a.py --cache /tmp/zarc-a --as-of 2026-11-14 --output /tmp/official-crop-profiles-a.review.json

# Verificação offline de escopo, limites e falhas de proveniência.
python scripts/test-official-crop-sources-a.py
```

Sem `--refresh`, o coletor reutiliza os downloads existentes para permitir repetição econômica. O construtor reextrai o texto do PDF com SHA-256 conferido em toda execução; não confia em um `.txt` editável separado. Uma mudança de redação, UF, safra, limiar ou referência de emergência bloqueia o perfil correspondente. A data padrão usa `America/Cuiaba`; `--as-of` permite uma auditoria reproduzível e impede a aceitação antecipada de publicações futuras.

O arquivo padrão não é sobrescrito quando um perfil antes válido desaparece; é necessário produzir um artefato com `--output` para revisão. O coletor nunca publica diretamente dados no aplicativo. O atualizador deve validar os arquivos preparados, conferir a cobertura e somente então trocar os artefatos de modo atômico.

Os oito testes negativos/positivos passam, incluindo alteração do PDF, TXT adulterado, UF incorreta, safra antiga, data futura, limiar modificado, intervalo de emergência ausente e manutenção de um teto exclusivo sem criar um ciclo representativo.
