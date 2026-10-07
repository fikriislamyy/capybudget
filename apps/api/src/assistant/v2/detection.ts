import {createHash} from 'node:crypto';
import {fromUnits,toUnits} from '../money';
import type {SpendingRow} from './calculations';

export const DETECTOR_VERSION='assistant-detection-v2.2';
export const DETECTION_RULES={maxRecords:5000,maxFindings:100,maxEvidence:50,duplicateDayWindow:0,habitPriorDays:3,minimumSamples:8,minimumHistoryDays:4,historyWindowDays:90,maximumSamples:50,medianMultiplier:3,madMultiplier:6} as const;
export type DetectionFinding={kind:'possible_duplicate'|'unusual_spending';fingerprint:string;evidence:string[];facts:Record<string,unknown>;detectorVersion:string};
const day=86400000;
const median=(values:bigint[])=>{const ordered=[...values].sort((a,b)=>a<b?-1:a>b?1:0),n=ordered.length;return n%2?ordered[Math.floor(n/2)]!:(ordered[n/2-1]!+ordered[n/2]!)/2n;};
const merchantKey=(value:string)=>typeof value==='string'?value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '):'';
const dateValid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;

/** Date-only records cannot prove whether identical same-day purchases are duplicates.
 * These findings are bounded review prompts, never fraud classifications or write actions. */
export function detectFindings(rows:SpendingRow[],currency:string):DetectionFinding[]{
 if(rows.length>DETECTION_RULES.maxRecords)throw new RangeError('Detection supports at most 5,000 scoped records.');
 const seen=new Set<string>();
 const eligible=rows.filter(r=>{
  if(seen.has(r.id)||r.type!=='expense'||r.currency!==currency||r.deletedAt||r.recurringRuleId||r.invoiceLinked||r.billLinked||r.subscriptionLinked||!dateValid(r.date))return false;
  const amount=toUnits(r.amount);if(amount<=0n)return false;seen.add(r.id);return true;
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const findings:DetectionFinding[]=[],signatureHistory=new Map<string,Map<string,number>>(),baselines=new Map<string,SpendingRow[]>();
 for(let start=0;start<eligible.length;){
  let end=start+1;while(end<eligible.length&&eligible[end]!.date===eligible[start]!.date)end++;
  const current=eligible.slice(start,end),date=current[0]!.date,duplicateGroups=new Map<string,SpendingRow[]>();
  for(const row of current){const merchant=merchantKey(row.merchant);if(!merchant)continue;
   const signature=JSON.stringify([row.accountId,merchant,toUnits(row.amount).toString(),currency]),group=duplicateGroups.get(signature)??[];group.push(row);duplicateGroups.set(signature,group);
  }
  for(const [signature,group] of duplicateGroups){
   const priorDays=[...(signatureHistory.get(signature)??[])].filter(([d,count])=>count>=group.length&&Date.parse(date)-Date.parse(d)<=DETECTION_RULES.historyWindowDays*day).length;
   if(group.length>1&&priorDays<DETECTION_RULES.habitPriorDays){const ids=group.map(r=>r.id).sort(),evidence=ids.slice(0,DETECTION_RULES.maxEvidence);
    findings.push({kind:'possible_duplicate',fingerprint:ids.length===2?'duplicate:'+ids.join(':'):'duplicate-group:'+createHash('sha256').update(JSON.stringify(ids)).digest('hex'),evidence,detectorVersion:DETECTOR_VERSION,facts:{date,amount:fromUnits(toUnits(group[0]!.amount)),currency,dayWindow:0,matchingRecordCount:ids.length,evidenceTruncated:ids.length>evidence.length,priorHabitDays:priorDays,confidence:'review_only',reason:'Same account, normalized merchant, amount and calendar date. Purchase times and bank transaction references are not included in this detector.',uncertainty:'Repeated purchases can be legitimate. Review the matching records before correcting anything.'}});
   }
   const dates=signatureHistory.get(signature)??new Map<string,number>();dates.set(date,group.length);signatureHistory.set(signature,dates);
  }
  // Evaluate every record on a day against earlier dates only; same-day and future data
  // never alter its baseline. Confirmed one-offs are excluded from this statistical rule.
  for(const row of current){if(!row.categoryId||row.oneOff)continue;
   const key=JSON.stringify([row.categoryId,row.accountId]),history=(baselines.get(key)??[]).filter(r=>Date.parse(date)-Date.parse(r.date)<=DETECTION_RULES.historyWindowDays*day).slice(-DETECTION_RULES.maximumSamples),historyDays=new Set(history.map(r=>r.date)).size;
   if(history.length<DETECTION_RULES.minimumSamples||historyDays<DETECTION_RULES.minimumHistoryDays)continue;
   const middle=median(history.map(r=>toUnits(r.amount))),mad=median(history.map(r=>{const delta=toUnits(r.amount)-middle;return delta<0n?-delta:delta;})),relativeThreshold=middle*BigInt(DETECTION_RULES.medianMultiplier),spreadThreshold=middle+mad*BigInt(DETECTION_RULES.madMultiplier),threshold=relativeThreshold>spreadThreshold?relativeThreshold:spreadThreshold,amount=toUnits(row.amount);
   // Only format a threshold if a representable amount actually exceeds it.
   if(middle>0n&&amount>threshold)findings.push({kind:'unusual_spending',fingerprint:'unusual:'+row.id,evidence:[row.id,...history.map(r=>r.id).slice(-(DETECTION_RULES.maxEvidence-1))],detectorVersion:DETECTOR_VERSION,facts:{date,amount:fromUnits(amount),currency,median:fromUnits(middle),medianAbsoluteDeviation:fromUnits(mad),threshold:fromUnits(threshold),sampleSize:history.length,evidenceTruncated:history.length+1>DETECTION_RULES.maxEvidence,historyDays,baselineStart:history[0]!.date,baselineEnd:history.at(-1)!.date,multiplier:DETECTION_RULES.medianMultiplier,madMultiplier:DETECTION_RULES.madMultiplier,confidence:'review_only',reason:'Above both 3 times the prior median and the median plus 6 times its absolute deviation, in the same category and account.',uncertainty:'A larger purchase may be intentional. This is a review prompt, not a fraud judgment.'}});
  }
  for(const row of current){if(!row.categoryId||row.oneOff)continue;const key=JSON.stringify([row.categoryId,row.accountId]),history=baselines.get(key)??[];history.push(row);baselines.set(key,history.slice(-DETECTION_RULES.maximumSamples));}
  start=end;
 }
 return findings.sort((a,b)=>String(b.facts.date).localeCompare(String(a.facts.date))||a.fingerprint.localeCompare(b.fingerprint)).slice(0,DETECTION_RULES.maxFindings);
}
