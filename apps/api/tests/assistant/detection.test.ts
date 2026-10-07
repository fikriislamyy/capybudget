import {test,expect} from 'bun:test';
import {detectFindings,DETECTION_RULES,DETECTOR_VERSION} from '../../src/assistant/v2/detection';
import {detectionCases,expense,baseline} from '../../scripts/fixtures/assistant-detection';
import {evaluateDetection} from '../../scripts/assistant-detection-evaluation';
for(const fixture of detectionCases){test('detection case: '+fixture.id,()=>{
 const findings=detectFindings(fixture.rows,fixture.currency).filter(f=>f.kind===fixture.kind),predicted=findings.some(f=>fixture.targets.every(id=>f.evidence.includes(id)));
 if(!fixture.ambiguity){expect(predicted).toBe(fixture.expectedFinding);if(!fixture.expectedFinding&&!fixture.id.startsWith('established-'))expect(findings).toHaveLength(0);}
 else {expect(predicted).toBe(fixture.id==='real-double-record-in-established-habit'?false:true);}
 expect(findings.every(f=>f.detectorVersion===DETECTOR_VERSION&&f.facts.confidence==='review_only')).toBe(true);
});}
test('evaluation includes false positives and missed cases rather than claiming perfect accuracy',()=>{
 const report=evaluateDetection();expect(report.results.length).toBe(51);
 expect(report.duplicates).toMatchObject({truePositives:8,falsePositives:2,trueNegatives:17,falseNegatives:1,precision:.8});
 expect(report.unusualSpending).toMatchObject({truePositives:4,falsePositives:1,trueNegatives:18,falseNegatives:0,precision:.8});
 expect(report.automaticAlertsEligible).toBe(false);expect(report.results.every(r=>r.otherFindings>=0)).toBe(true);
});
test('unusual findings explain their prior-only median, deviation and threshold',()=>{
 const result=detectFindings([...baseline(['10','100','10','100','10','100','10','100']),expense('candidate',{amount:'400'})],'IDR').find(f=>f.kind==='unusual_spending');
 expect(result?.facts).toMatchObject({median:'55.0000',medianAbsoluteDeviation:'45.0000',threshold:'325.0000',sampleSize:8,historyDays:8,baselineEnd:'2026-09-08'});expect(result?.evidence[0]).toBe('candidate');
});
test('findings are deterministic for shuffled records and never mutate the input',()=>{
 const rows=[...baseline(),expense('candidate',{amount:'500'})],before=JSON.stringify(rows);
 expect(detectFindings([...rows].reverse(),'IDR')).toEqual(detectFindings(rows,'IDR'));expect(JSON.stringify(rows)).toBe(before);
});
test('each same-day outlier uses the same earlier-date baseline',()=>{
 const findings=detectFindings([...baseline(),expense('first',{amount:'400',merchant:'Shop A'}),expense('second',{amount:'500',merchant:'Shop B'})],'IDR').filter(f=>f.kind==='unusual_spending');
 expect(findings).toHaveLength(2);expect(findings.every(f=>f.facts.sampleSize===8&&f.facts.threshold==='300.0000')).toBe(true);
});
test('only the previous 90 days train a baseline',()=>{
 expect(detectFindings([...baseline().map(r=>({...r,date:'2026-01-01'})),expense('candidate',{amount:'500'})],'IDR')).toHaveLength(0);
});
test('missing merchant and malformed dates do not create duplicate confidence',()=>{
 expect(detectFindings([expense('a',{merchant:null as unknown as string}),expense('b',{merchant:null as unknown as string})],'IDR')).toHaveLength(0);
 expect(detectFindings([expense('a',{date:'2026-02-30'}),expense('b',{date:'2026-02-30'})],'IDR')).toHaveLength(0);
});
test('bulk identical records are grouped and evidence is bounded',()=>{
 const rows=Array.from({length:100},(_,n)=>expense(String(n))),findings=detectFindings(rows,'IDR');expect(findings).toHaveLength(1);
 expect(findings[0]?.facts).toMatchObject({matchingRecordCount:100,evidenceTruncated:true});expect(findings[0]?.evidence.length).toBe(DETECTION_RULES.maxEvidence);
});
test('finding limits retain the newest conditions and excessive inputs are rejected',()=>{
 const rows=Array.from({length:200},(_,n)=>expense(String(n),{merchant:'Merchant '+Math.floor(n/2),date:n<100?'2026-10-01':'2026-10-06'}));
 const findings=detectFindings(rows,'IDR');expect(findings).toHaveLength(100);expect(findings[0]?.facts.date).toBe('2026-10-06');
 expect(()=>detectFindings(Array.from({length:5001},(_,n)=>expense(String(n))),'IDR')).toThrow('5,000');
});

test('once-daily history does not suppress a new twice-daily duplicate candidate',()=>{
 const history=[1,2,3].map(n=>expense('habit-'+n,{date:'2026-10-0'+n}));
 const result=detectFindings([...history,expense('a'),expense('b')],'IDR');expect(result.some(f=>f.kind==='possible_duplicate'&&f.evidence.includes('a')&&f.evidence.includes('b'))).toBe(true);
});
