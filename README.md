# Rota Adaptada — Interplários

Protótipo web de apoio ao planejamento agrícola e observação da Terra, criado como conceito independente para o NASA Space Apps. Não é um produto oficial da NASA.

## Executar localmente

Requer Node.js moderno (recomendado Node.js 22) e npm.

```bash
cd rota-adaptada-novo
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Para verificar e gerar a aplicação estática:

```bash
npm test
npm run build
```

O resultado do build fica em `rota-adaptada-novo/dist/`.

## O que existe

Cadastro de propriedades e talhões com MapLibre e GeoJSON; amostras de solo; planejamento demonstrativo; observatório ambiental; comparação espacial e temporal; cenários; revisão de calendário; diário de operações; relatórios e backup JSON.

JavaScript, Vite, MapLibre GL JS, polygon-clipping, Web Workers e IndexedDB. Não há backend ou autenticação do aplicativo. Mapas e fontes externas precisam de internet.

## Dados e limitações

Os dados ambientais atuais são sintéticos: nenhuma API NASA está integrada. As pontuações de culturas são didáticas e não constituem previsão de produtividade ou recomendação agronômica. Os dados cadastrados ficam no navegador, por origem; não são compartilhados ao clonar este repositório. Use a exportação de backup do aplicativo quando precisar transferir cadastros.

O direcionamento acordado é validar um piloto em Vilhena, Rondônia, priorizando chuva (GPM IMERG), temperatura (NASA POWER), relevo (SRTM), evidências locais de solo e regras oficiais verificadas por safra. Essas integrações e a restrição da interface a Vilhena ainda são trabalho futuro; o código preserva o protótipo existente.

## Documentação

- [Aplicação e instruções técnicas](rota-adaptada-novo/README.md)
- [Escopo e registro de evolução](rota-adaptada-novo/docs/ESCOPO.md)
- [Visão regional original](docs/ESCOPO_RONDONIA.md)
- [Roteiro de validação com agrônomo](docs/ROTEIRO_AGRONOMO.md)

Os documentos incluem registros históricos: confira o código antes de considerar um recurso implementado. As datas e regras em `data/ro/config.json` precisam ser verificadas nas fontes oficiais antes de uso real.
