export function medianUnits(values:readonly bigint[]):bigint{
 if(values.length===0)throw new RangeError('Median requires at least one value.');
 const sorted=[...values].sort((a,b)=>a<b?-1:a>b?1:0),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]!:(sorted[middle-1]!+sorted[middle]!)/2n;
}

export function unusualThreshold(values:readonly bigint[],minimum:bigint){
 const median=medianUnits(values),mad=medianUnits(values.map((value)=>value>median?value-median:median-value));
 const threshold=[median*3n,median+mad*6n,minimum].reduce((max,value)=>value>max?value:max);
 return {median,mad,threshold};
}

export function exceedsUnusualThreshold(candidate:bigint,threshold:bigint){return candidate>threshold;}
