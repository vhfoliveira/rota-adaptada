# Motor por cenário

Vilhena continua sendo um exemplo pronto. O calendário aceita uma ou mais etapas,
qualquer data inicial válida, atrasos e intervalos inteiros não negativos. O limite
técnico de duração é 36.500 dias; não é uma indicação agronômica de uso.

## Interface

Em **Planejamento → Incluir novo planejamento**, escolha culturas e ciclos.
A seção opcional **Datas e ajustes desta etapa** permite definir uma data mínima,
um intervalo específico e se a cultura ou o ciclo podem mudar. O intervalo vazio
herda o geral. O primeiro plantio usa a data inicial; as etapas seguintes respeitam
o fim do ciclo anterior, o intervalo e a data mínima informada. O exemplo usa uma
âncora anual para o segundo verão: mudar o ano inicial reposiciona essa âncora.
Datas explícitas de planos do usuário permanecem explícitas.

O motor compara alterações de **uma etapa por vez**: ciclo menor ou outra cultura
cadastrada, respeitando as permissões locais e globais. A tela mostra o plano atual
e até três alternativas. O gerador de sugestões usa a mesma sequência e as mesmas
restrições; quando o formulário ainda está incompleto, usa a sequência ativa.
Não realiza otimização global de múltiplas alterações, lucro ou produtividade.

A criação guiada usa outro gerador, `guided-suggestions.js`, que monta sequências
por horizonte e janelas municipais. Ele não usa o ranking climático do motor.
Veja [sugestões de planejamento](GUIA_AUTOGUIADO.md#sugestões-de-planejamento).

## Contrato de integração

`simulateAdaptation(property, plan, customCrops, customCycles, context)` aceita:

```js
const context = {
  dataset: {
    metadata: {
      location: { latitude: -15, longitude: -56 },
      source: 'Fonte e versão do histórico'
    },
    // [chuva mm, Tmax °C, Tmin °C, GWETROOT, GWETTOP]
    daily: { '2020-01-01': [5, 28, 18, 0.7, 0.7] }
  },
  soilProfile: { available_water_mm: 60 },
  regionalRules: {
    location: { municipality: 'Município', state: 'UF' },
    validFrom: '2029-01-01',
    validTo: '2029-12-31',
    cropWindows: {
      SOJA: { decendios_by_soil: {
        CLASSE_LOCAL: { risk_20pct: [1, 2], risk_30pct: [3], risk_40pct: [] }
      } }
    }
  }
};
```

Os valores acima ilustram o formato, **não são parâmetros agronômicos oficiais**.
A propriedade deve ter as coordenadas do histórico, município/UF do pacote e
`soilProfileId` compatível. Sem contexto explícito, o motor usa apenas a série em
cache da mesma coordenada, com precisão de quatro casas decimais. A consulta de
outra propriedade não muda os dados usados pelo cenário anterior. Consultas
concluídas depois da troca de propriedade não redesenham a propriedade errada.

A API `fetchLiveNasaPower(lat, lon, {startDate, endDate})` permite escolher o período.
O início padrão é 2013-01-01; o painel consulta até a data corrente e o guia até
o fim do ano anterior, para trabalhar com anos encerrados. O conjunto retornado
precisa ter as coordenadas da solicitação; o cenário determina os anos a partir
da série diária, sem exigir 2013–2024.

## Ausências e limites

- Município ou ano sem pacote: janela **não avaliada**, sem reutilizar a de Vilhena.
- O pacote fornecido no repositório é a referência do exemplo 2026/2027; não é
  atualizado automaticamente para novas safras nem certifica regras oficiais.
- Cultura, ciclo ou data inválidos: erro explícito, sem substituir por soja.
- Solo desconhecido: histórico de risco **não avaliado**, sem assumir AD4.
- Dia ausente ou inválido: aquele ciclo histórico fica **não avaliado**. Não se
  substitui o dia por outro ano nem se inventam chuva, temperatura ou umidade.
- O último ano pode ficar incompleto em ciclos que atravessam dezembro. A tela
  mostra a quantidade efetivamente avaliada e os anos sem avaliação.
- Janela de cultura personalizada é **informada pelo usuário**, sem percentual
  ZARC. Sem parâmetros climáticos (`climateParameters` na integração), calcula-se
  o calendário, mas não se inventa uma classificação de estresse.
- Fases de ciclos personalizados são repartidas proporcionalmente, com soma exata
  da duração; são estimativas, não calibração fenológica. Resultados estimados ou
  parciais não são classificados como alternativas comprovadamente melhores.
- Cobertura conta a união dos dias com cultura viva dentro de um horizonte comum
  às alternativas. Não presume persistência de palhada. `horizonEndDate`, se
  informado, precisa conter todas as etapas e alternativas.

## Validação

`npm test` cobre datas, sequência variável, permissões por etapa, isolamento de
clima, regras regionais, dados incompletos, falha de APIs, ciclos personalizados,
cobertura e relatório. `npm run build` valida a aplicação Vite.

O roteiro de navegador está em [Validação dos fluxos](VALIDACAO_FLUXOS.md).
Ele cobre as três jornadas guiadas, o painel avançado, persistência e mudanças
durante consultas.
