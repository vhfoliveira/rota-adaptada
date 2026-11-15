# Rota Adaptada

Aplicação estática de apoio à comparação de mudanças no planejamento agrícola.
Vilhena/RO permanece como exemplo preenchido, com histórico NASA local e catálogo
regional de referência. Outros cenários podem ter datas, etapas, culturas e ciclos
próprios; dados ou regras ausentes são apresentados como **não avaliados**.

## Executar

```bash
npm ci
npm run dev
npm test
npm run build
```

O deploy usa Node 22. A aplicação não exige banco ou backend no servidor; o estado
é salvo no navegador com IndexedDB. O build estático fica em `dist/`.

## Fluxo

1. **Propriedade:** coordenadas, consulta climática e classe de solo. Uma falha da
   consulta só pode reutilizar histórico da mesma coordenada.
2. **Culturas:** catálogo do exemplo e culturas/ciclos informados pelo usuário.
   Janelas cadastradas pelo usuário não recebem percentuais ZARC automáticos.
3. **Planejamento:** sequência de uma ou mais etapas, data inicial, intervalo e
   atraso. Datas mínimas, intervalos por etapa e permissões ficam em uma seção
   opcional. O exemplo ajusta sua âncora anual ao ano inicial.
4. **Comparação:** plano atual e até três alternativas de uma mudança, respeitando
   as etapas liberadas. Sem dados suficientes, não se indica uma opção como melhor.
5. **Explicação:** histórico efetivamente avaliado, anos incompletos, fases da cultura
   e resumo imprimível. Histórico não é previsão de produtividade.

Consulte [o contrato do motor e os testes](docs/MOTOR_CENARIOS.md) para integrar
outros históricos, solos e pacotes regionais. Ampliar o calendário não valida
automaticamente novas regras agronômicas.

## ServerOS

Na raiz do repositório, `./deploy/serveros.sh` executa build e testes, preserva
backup e verifica o serviço. Veja [instruções de implantação](../deploy/README.md).
