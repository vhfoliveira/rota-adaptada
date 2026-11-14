/** Differences only compare the same variable, unit, context and synthetic method. */
export function compareSamples(a,b){
 if(a.variable!==b.variable||a.unit!==b.unit||a.context!==b.context||a.methodVersion!==b.methodVersion)return {difference:null,reason:'Variáveis ou métodos diferentes: sem diferença numérica'};
 if(!Number.isFinite(a.value)||!Number.isFinite(b.value))return {difference:null,reason:'Dados ausentes: diferença indisponível'};
 return {difference:Number((b.value-a.value).toFixed(3)),reason:'Diferença ilustrativa B − A'};
}
