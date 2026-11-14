# Rota Adaptada — protótipo novo

Aplicação web estática, em português, criada separadamente do protótipo anterior para referência no NASA Space Apps. Não é um produto de produção.

## Executar

Node.js moderno; `npm ci`, `npm run dev`. `npm run build` produz `dist/`. `npm test` valida geometria, restrições e backup. Não há backend, credenciais de mapas ou autenticação do aplicativo.

## Implementação

- MapLibre GL JS 6.17.0: único motor de mapa/globo; controles, projeção e navegação nativos. Worker padrão empacotado pelo Vite.
- OpenFreeMap Positron, com atribuições OpenMapTiles e OpenStreetMap. Requer internet. Sem associação institucional presumida com NASA.
- `polygon-clipping`: operações geométricas de interseção e diferença, não um segundo motor de mapa. Rejeita cruzamentos, sobreposição e saída de talhões inclusive em propriedades côncavas.
- IndexedDB `rota-adaptada-laboratorio-v1`: propriedades, talhões, análises, laudos, histórico, configurações e planos escolhidos. Cada origem/navegador possui armazenamento próprio. O backup JSON inclui laudos em base64; importação substitui os registros após confirmação.
- Dados pessoais e polígonos não são enviados a um servidor da aplicação. Provedores de mapa/fontes recebem as requisições normais de recursos. Não há download offline de tiles.

## Regras demonstrativas

Catálogo didático de quatro culturas no retângulo 75°O–35°O / 25°S–5°N. Não representa zoneamento ou aptidão agrícola. Fora do recorte, os cadastros funcionam e o planejamento explica a ausência de cobertura.

Horizonte inicial de 24 meses, editável de 1 a 60. Janelas em dias por cultura, obrigatórias, excluídas, critério de qualidade e pesos dos objetivos. Sugestões enumeram sequências de 2–4 culturas distintas; sequência manual pode ser escolhida. São reservados 15 dias fictícios entre cultivos; o restante do horizonte é mostrado como período sem cultivo adicional definido.

Notas fixas didáticas (1–3) são promediadas por cultura e ponderadas pelos pesos. Mostram até três alternativas compatíveis e pelo menos duas se existem. Não estimam produção, qualidade, preços, retorno, fertilização ou probabilidade de sucesso. Metas em sacas/ha e peso da saca são registradas, sem prometer atingimento.

Clima sintético somente ao clicar em Planejar; nenhuma API NASA é chamada. Análises e histórico são preservados como contexto no snapshot do plano; não são usados para inferência agronômica. Dados ausentes continuam ausentes. Laudos não são lidos automaticamente.

## Limitações e hackathon

- Selecionar produtos NASA, resolução e critérios de qualidade, integrar dados reais e validar o método agronômico são trabalhos futuros.
- Polígonos que cruzam o antimeridiano devem ser divididos. Área esférica aproximada, sem valor cadastral.
- Sem edição/exclusão individual de registros nesta primeira versão; restauração de backup substitui o conjunto.
- Sem previsão de rendimento ou qualidade; sem estimativa financeira.
- Sem sincronização entre dispositivos. Exporte backup; a limpeza de dados do navegador remove o armazenamento local.
- Ao recarregar, cadastros, configurações e planos escolhidos persistem. Comparações ainda não salvas são transitórias.

## Validação

Testes de regras: cruzamentos, contenção inclusive em concavidade, sobreposição, ausência de seleção/cobertura, alternativas padrão, conflitos, janela curta, sequência manual, obrigatórias/excluídas e round trip de backup.

Navegador: estado inicial sem cidade, bloqueio sem talhão, mapa carregado com atribuição, desenho de propriedade/talhão, rejeição de sobreposição, solo com campos ausentes, troca das quatro abas, comparação de três alternativas, salvar plano, persistência após reload e exportar/importar backup. Os dados QA ficam apenas na origem localhost, não são incluídos na versão publicada.

## Identidade de observação da Terra

Cabeçalho em azul espacial, símbolo original de órbita e folha, atmosfera nativa do MapLibre e painel Dados NASA. Referências reais e não conectadas: [SMAP](https://science.nasa.gov/mission/smap/), [GPM](https://gpm.nasa.gov/missions/GPM) e [MODIS MOD13](https://modis.gsfc.nasa.gov/data/dataprod/mod13.php). O painel explica a integração futura e mantém explícito que não é um produto oficial da NASA. Não altera os dados locais nem o cálculo demonstrativo dos planos.

## Equipe Interplários

Brasão original fornecido pelo usuário, preservado em `public/branding/interplarios.png`. Assinatura discreta no cabeçalho abre o brasão completo em diálogo nativo; detalhes em prata e vermelho conectam a identidade da equipe ao visual espacial. Não altera dados ou regras de planejamento.
