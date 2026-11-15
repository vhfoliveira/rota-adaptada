# Rota Adaptada

Aplicação de consulta de opções de plantio e comparação de mudanças no planejamento
agrícola. Usa dados NASA POWER, base municipal ZARC/MAPA, estimativas SoilGrids e
localização confirmada pelo usuário. Vilhena/RO permanece como demonstração
explícita; dados ou regras ausentes são apresentados como **não avaliados**.

## Executar

Na pasta `rota-adaptada`, com Node.js 22:

```bash
npm ci
npm run dev
npm test
npm run build
```

O Vite abre o servidor local na porta 5178. O build estático fica em `dist/`.
O estado do produtor é salvo no navegador com IndexedDB. No ambiente Docker,
o serviço `zarc-updater` mantém a base oficial em um volume separado; o frontend
também inclui uma cópia inicial para hospedagem estática.

## Entradas e jornadas

`index.html` carrega `src/bootstrap.js`, que seleciona a experiência pela URL:

| URL | Módulo | Comportamento |
| --- | --- | --- |
| `/` | `src/guided.js` | Escolha de objetivo e retomada de rascunhos. |
| `?modo=campo` | `src/guided.js` | Consulta guiada de plantio, retomando seu rascunho quando existir. |
| `?modo=planejamento` | `src/main.js` | Painel avançado de planejamento. |

Celular e computador usam as mesmas jornadas. A instalação PWA abre a escolha de
objetivo, conforme `public/manifest.webmanifest`.

- **Descobrir o que plantar:** confirmar área → informar data e condições → revisar
  → explorar opções municipais ZARC → entender e baixar o resumo.
- **Adaptar meu planejamento:** confirmar área e escolher plano salvo ou novo →
  montar sequência com culturas e ciclos → informar atraso e mudanças permitidas
  → revisar → comparar e salvar uma alternativa.
- **Planejamento avançado:** cadastros de propriedade, culturas e ciclos,
  configuração da sequência, comparação e explicação histórica com relatório
  imprimível. Uma alternativa salva pelo guia também fica disponível aqui.

Consulte [a experiência autoguiada](docs/GUIA_AUTOGUIADO.md) para o roteiro de
interações e [o contrato do motor](docs/MOTOR_CENARIOS.md) para limites e integração.

## Fontes e armazenamento

As consultas NASA POWER e SoilGrids usam o ponto confirmado. Uma falha climática
só pode reutilizar histórico da mesma coordenada. O guia consulta até o fim do
ano anterior; o painel avançado pode solicitar até a data atual. O período exibido
reflete os registros disponíveis. O histórico local de Vilhena cobre 2013–2024.

A descoberta municipal pode funcionar sem ponto e sem classe de solo confirmada,
exibindo as condições pendentes. A adaptação exige ponto confirmado e ciclos
explicitamente escolhidos. Culturas ZARC sem modelo climático continuam visíveis,
com a limitação informada. Sem evidência suficiente, o motor não indica uma opção
como melhor. Histórico não é previsão, e percentuais ZARC não são chance geral de
sucesso. Veja [a documentação ZARC](docs/ZARC.md).

Rascunhos, coordenadas informadas e planos salvos ficam neste dispositivo.
Rascunhos das duas jornadas e estado do painel avançado usam chaves separadas.
Resultados de consulta não são retomados como atuais: o guia pede nova revisão
e consulta. Salvar uma alternativa preserva o plano original.

## Instalação e atualizações PWA

Publique `dist/` em **HTTPS** para GPS, service worker e instalação. No Android,
use o menu do navegador para instalar. No iPhone, use Safari → Compartilhar →
Adicionar à Tela de Início. A disponibilidade depende do navegador.

O build gera um service worker versionado que armazena a interface e seus arquivos
estáticos. Após a primeira abertura online, a interface pode abrir offline;
novas consultas dependem da internet. O worker não armazena consultas de localização
ou respostas das APIs. Atualizações exigem ação explícita e salvamento bem-sucedido
do preenchimento; no painel avançado, salve ou feche os editores abertos. Caches de
versões anteriores são preservados para abas ainda em uso. O desenvolvimento não
registra service worker: valide instalação e offline usando o build.

Validação em dispositivo: permitir/negar GPS, conferir ponto e precisão, consultar
com e sem solo, retomar rascunhos, instalar, fechar e reabrir offline. Conferir
Android/Chrome e iPhone/Safari antes de distribuir.

## ServerOS

Na raiz do repositório, `./deploy/serveros.sh` executa build e testes, preserva
backup e verifica o serviço. Veja [as instruções de implantação](../deploy/README.md).
