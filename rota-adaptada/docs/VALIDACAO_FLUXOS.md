# Validação dos fluxos ativos

Use uma origem local de teste com dados demonstrativos. Não apague o IndexedDB
de um perfil com dados do produtor. A entrada é `index.html` → `src/bootstrap.js`.

## Entradas e navegação

| Entrada | Comportamento esperado |
| --- | --- |
| `/` | Dois objetivos: descobrir culturas e adaptar planejamento |
| `?modo=campo` | Abre/retoma a consulta guiada de culturas |
| `?modo=planejamento` | Painel avançado de cinco passos |
| Link do guia para o painel | Aguarda o salvamento do rascunho |
| Arquivo/caminho ausente no Nginx | HTTP 404, sem retornar HTML da aplicação |

O painel avançado continua ativo, inclusive para abrir planos salvos no guia.
Não há outra entrada móvel, observatório ou laboratório de simulação.

## Roteiro no navegador

1. Abra a raiz, escolha o exemplo explícito e percorra localização, data,
   revisão e consulta. Confira município, safra e condições oficiais. Abra uma
   cultura, salve o resumo HTML e confira as fontes e condições pendentes.
2. Abra uma ajuda, feche com Escape e confira o foco e os valores do formulário.
   Volte, edite uma resposta e confirme que resultados anteriores não são usados.
3. Na adaptação, informe município e ponto demonstrativo. Escolha cultura e ciclo,
   informe atraso e permissões, compare e salve uma alternativa. Abra o painel
   avançado: datas devem corresponder à alternativa, sem reaplicar o atraso.
4. Recarregue e retome os dois rascunhos. A retomada de resultados exige nova
   consulta; a troca entre guia e painel mantém os preenchimentos salvos.
5. No painel, percorra Propriedade, Culturas, Planejamento, Comparação e
   Explicação. Abra o resumo imprimível e volte ao planejamento.
6. Em um novo planejamento, preencha culturas/ciclos e gere sugestões. Altere a
   data, intervalo ou etapas: as cartas anteriores devem desaparecer. Gere de
   novo e confira que correspondem aos valores novos. Repita cancelando enquanto
   a consulta está em andamento: a resposta antiga não pode reabrir as cartas.
7. No cadastro de propriedade, consulte coordenadas, depois altere latitude ou
   longitude. O resultado anterior e seu botão de salvar devem desaparecer.
   Faça nova consulta e selecione solo “Não informado”: salvar deve preservar a
   ausência de solo. Fechar o cadastro durante a consulta impede retorno tardio.
8. Confira o guia e o painel em largura de celular. Abra o mapa e confirme o
   ponto explicitamente; GPS negado ou indisponível deve manter a alternativa
   manual. Não solicite a localização real para testar o exemplo.

## Verificações automatizadas

Na pasta `rota-adaptada`, execute `npm test` e `npm run build`. O teste
`source-graph.test.js` percorre o entrypoint real e os imports dinâmicos: falha
se houver import local ausente, dependência não declarada ou código em `src/`
que não pertence a nenhum fluxo ativo. Testes exclusivos das funcionalidades
retiradas também foram removidos.

Na raiz, execute:

```bash
python3 -m unittest discover -s rota-adaptada/scripts -p 'test_*.py'
./deploy/serveros.sh --check
```

O segundo comando verifica sintaxe e empacotamento sem publicar. Para instalação
e atualização offline, teste o build em HTTPS conforme o
[guia autoguiado](GUIA_AUTOGUIADO.md), incluindo rascunho aberto durante atualização.
O roteiro técnico não substitui os testes com pessoas leigas nem validação
agronômica.

## Resultado da revisão de 14/11/2026

- Removidos 30 arquivos de código desconectados das entradas atuais, 17 testes
  obsoletos e 7 cópias/configurações/documentos sem uso. O painel avançado e os
  dados ativos em `src/data/` foram mantidos, assim como materiais históricos
  de apresentação e backups que não são servidos pelo site.
- Aprovação dos 12 arquivos de testes JavaScript restantes, incluindo o novo
  grafo de dependências; 3 testes Python do atualizador ZARC; build Vite; checagem
  de empacotamento ServerOS e links locais da documentação ativa.
- No navegador: descoberta até resultado e download HTML; ajuda com Escape;
  adaptação com atraso de 12 dias, salvamento e abertura no painel sem reaplicar
  atraso; cinco abas e relatório imprimível; invalidação de sugestões após
  mudar data; descarte de consulta após editar latitude; salvamento com solo
  explicitamente não informado; rascunhos preservados na troca de interface.
- `?modo=campo` retomou a revisão da consulta guiada. Em viewport de 390 px,
  o guia não apresentou rolagem horizontal. Nenhum erro de console foi registrado
  nas navegações conferidas. SoilGrids ficou indisponível e a interface manteve
  corretamente a análise parcial.
- A configuração de 404 do Nginx foi revisada, mas não executada em contêiner:
  o acesso ao socket Docker local não estava disponível. Instalação em aparelho
  físico e atualização PWA offline não foram repetidas nesta revisão; seus testes
  automatizados passaram. Não houve publicação no servidor.
