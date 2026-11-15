# Integração dos parâmetros oficiais de culturas

Conferência da safra 2026/2027, com corte das publicações em 14/11/2026. Foram validados 305 perfis de portarias, cobrindo 18 códigos de cultura em 27 UFs. Eles geram 397 combinações de código e perfil, com 854 grupos utilizáveis para calendário e 191 grupos sem duração suficiente. Estes totais não significam cobertura completa de todas as culturas em todos os municípios. Vilhena tem opções de calendário para suas 16 culturas municipais, combinando os novos perfis e os modelos anteriores identificados como protótipos.

## Comportamento entregue

- A lista de culturas vem do ZARC municipal. O usuário escolhe cultura, ciclo e manejo prontos; não cadastra parâmetros agronômicos.
- O registro só habilita um perfil com correspondência de UF, safra, código, grupo, manejo, número e data de publicação da portaria. O hash SHA-256 registra a versão conferida do PDF.
- Datas anteriores à publicação ou fora da safra disponível não recebem indicação retroativa. Uma portaria substituída não é tratada como vigente.
- Referências de duração exata e fases publicadas são preservadas. Faixas com teto geram uma hipótese explícita pelo limite superior. Se a contagem começa na emergência, só se acrescenta o intervalo documentado na própria fonte. Não se atribuem durações a faixas abertas.
- O fim do ciclo de referência pode ser maturação fisiológica. O intervalo operacional informado precisa contemplar secagem, colheita e preparo; a aplicação não afirma uma data oficial de liberação da área.
- A janela municipal é consultada novamente na data de cada cultivo, antes e depois do atraso, mantendo as condições de solo, grupo e manejo. Não se escolhe automaticamente o menor risco entre condições diferentes.
- O histórico NASA é cruzado com o ponto e o período do cultivo. Séries completas produzem chuva e temperaturas descritivas; critérios térmicos só são executados quando variável, período e limiar publicados são compatíveis. Falta de dados não vira zero.
- Alternativas preservam manejo e restrições do plano. Um cultivo de sequeiro não passa a exigir irrigação silenciosamente.
- Ao salvar uma alternativa, são preservados o plano original, o resultado e os perfis oficiais usados, incluindo suas fontes. Mudanças posteriores no hash não apagam o modelo de um plano salvo.

## Limites científicos e de cobertura

A integração **não reproduz o modelo agronômico completo do ZARC**, seus balanços hídricos, produtividade, CROPGRO ou ISNA. Não utiliza os limiares de chuva/GWET dos protótipos de soja ou milho para outras culturas. A avaliação permanece parcial; histórico disponível não é apresentado como classificação de aptidão nem previsão.

Há fontes ainda incompatíveis com a safra atual, documentos indisponíveis e grupos com faixa aberta. Trigo permanece pendente nesta coleta. Alguns índices estaduais apontam para PDFs antigos de arroz, amendoim ou girassol; links de aveia MS não entregaram PDFs utilizáveis. Esses casos não são preenchidos com dados de outro estado. Os detalhes estão nas auditorias [leguminosas e oleaginosas](OFFICIAL_CROPS_A.md) e [cereais e consórcios](OFFICIAL_CROPS_B.md).

A referência adicional da cultivar BRS 293 é do catálogo Embrapa 2019/2020; só é usada nas UFs documentadas e quando a cultivar também consta na portaria atual. Sua fonte suplementar fica no resumo.

## Atualização e validação

Requisitos: Node usado pelo projeto, Python 3 e Poppler (`pdftotext`). Não há coleta de PDFs no aparelho do usuário: os parâmetros validados fazem parte do aplicativo.

```sh
npm run update:crop-parameters -- --refresh --as-of 2026-11-14 --check
npm run update:crop-parameters -- --offline --as-of 2026-11-14
npm run validate:crop-parameters
npm test
npm run build
python3 scripts/test-official-crop-sources-a.py
python3 -m unittest scripts/test_official_crop_sources_b.py
```

`--check` prepara e valida arquivos temporários sem substituir o catálogo. `--cache`, ou `--cache-a` e `--cache-b`, controlam os diretórios dos PDFs. A coleta rejeita mudanças não reconhecidas no documento, datas futuras, fontes incompatíveis e perda de perfis já validados. Falhas preservam os arquivos existentes. A troca de cada JSON usa arquivo temporário e rename; publicação do aplicativo continua sendo uma etapa separada.

Testes de integração cobrem culturas reais de Vilhena, calendário de arroz/feijão, mudanças nas condições ZARC por atraso, fases térmicas publicadas, ausência de classificação agronômica indevida, restrições de grupo/manejo, restauração de modelos antigos e preservação de planos. O atualizador foi exercitado offline, produzindo JSON idênticos, e rejeitou cache vazio, coleta parcial e fonte inválida. Os 18 testes Python de extração passaram.

Conferência de interface: seleção sem cultura pré-preenchida, arroz com calendário de 124 dias, atraso de 21 dias, ZARC antes/depois e 13 anos de histórico NASA. O solo indisponível não impediu calendário, consulta oficial ou salvamento. Ajuda com Escape devolveu o foco e manteve o preenchimento; painel inferior conferido em 390 px. Capturas em `screenshots/official-parameters/`.

## Disponibilidade da consulta de solo

O aplicativo usa a API REST SoilGrids do ISRIC. Na conferência, a [documentação oficial](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html) informava pausa temporária sem previsão de retorno e recomendava WCS/WebDAV para usos que precisam de estabilidade. O serviço é beta, sem garantia de disponibilidade, com política de cinco chamadas por minuto.

A indisponibilidade da fonte não significa ausência de solo naquele ponto. ZARC e NASA continuam independentes, e a classe do solo não é preenchida silenciosamente. Uma migração para WCS/WebDAV com cache próprio é uma integração adicional; não foi realizada nesta entrega.

Teste direto realizado em 15/11/2026 às 03:56 UTC (14/11, 23:56 em Cuiabá): o mesmo endpoint REST usado pelo app respondeu HTTP 200 em 3,94 s, com CORS permitido, mas retornou `mean: null` para argila e areia em todas as quatro profundidades solicitadas no ponto público de demonstração (-12.7405, -60.1458). Isso confirma ausência de observações utilizáveis nessa resposta, não indisponibilidade global nem ausência de cobertura do mapa. No teste anterior pelo navegador, a chamada excedeu os 9 s do aplicativo. O aviso de pausa da documentação é contexto do fornecedor; não substitui a medição da consulta.

Foi corrigida a retenção de respostas sem dados no cache da jornada: reconsultas não reaproveitam uma falha como resposta válida. O botão Atualizar consulta já limpava o cache e forçava nova tentativa. Erros agora distinguem tempo excedido, conexão, HTTP, limite de chamadas e ausência de valores; nenhuma falha preenche solo automaticamente. A consulta avançada também recarrega a base municipal do plano salvo, preservando condições por data. Relatórios mantêm as fontes e a natureza descritiva da análise.

Verificação final: os 17 arquivos de testes JavaScript e o build passaram, além dos 18 testes Python. A nova integração foi validada localmente; não houve publicação nesta entrega.
