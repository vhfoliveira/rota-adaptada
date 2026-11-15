// Descriptive scale of structural edits, not a risk or profitability rating.
export function planningChange(strategy){
 const stages=strategy.stages||[];
 const crops=stages.filter(stage=>stage.cropChanged).length;
 const cycles=stages.filter(stage=>!stage.cropChanged&&stage.groupChanged).length;
 const count=crops+cycles;
 if(!count)return {level:'Nenhuma',detail:'Mantém culturas e ciclos. O atraso simulado ainda pode alterar as datas.'};
 if(!crops&&count===1)return {level:'Baixa',detail:'Ajusta apenas o ciclo de uma etapa, mantendo as culturas.'};
 if(count===1)return {level:'Moderada',detail:'Substitui a cultura de uma etapa, incluindo seu ciclo quando necessário.'};
 return {level:'Alta',detail:`Altera culturas ou ciclos em ${count} etapas.`};
}
