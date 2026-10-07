import {describe,test,expect} from 'bun:test';
import {feedbackAllows,nudgeTopics,type FeedbackRow} from '../../src/assistant/v2/feedback';
const now=Date.parse('2026-10-06T09:00:00Z'),day=86400000,topic={kind:'budget_overspend',fingerprint:'budget:current'};
const negative=(fingerprint:string,time=now-day):FeedbackRow=>({kind:topic.kind,fingerprint,vote:'not_helpful',vote_at:new Date(time),dismissed_at:null});
describe('optional assistant feedback policy',()=>{
 test('no feedback or one negative retains the selected cadence',()=>{expect(feedbackAllows([],topic,now)).toBe(true);expect(feedbackAllows([negative('one')],topic,now)).toBe(true);});
 test('two distinct negative suggestions pause the same type for 14 days',()=>{const rows=[negative('one'),negative('two')];expect(feedbackAllows(rows,topic,now)).toBe(false);expect(feedbackAllows(rows,topic,now+13*day)).toBe(true);});
 test('duplicate ratings of the same condition never inflate the count',()=>{expect(feedbackAllows([negative('one'),negative('one')],topic,now)).toBe(true);});
 test('a helpful rating resets the negative window',()=>{expect(feedbackAllows([negative('one'),negative('two'),{...negative('three',now),vote:'helpful'}],topic,now)).toBe(true);});
 test('dismissal blocks only the exact fingerprint even after positive feedback',()=>{const rows=[{...negative('one',now),vote:'helpful',dismissed_at:new Date(now)}];expect(feedbackAllows(rows,{...topic,fingerprint:'one'},now)).toBe(false);expect(feedbackAllows(rows,topic,now)).toBe(true);});
 test('expired and unrelated feedback does not suppress another type',()=>{expect(feedbackAllows([negative('one',now-91*day),negative('two',now-91*day)],topic,now)).toBe(true);expect(feedbackAllows([negative('one'),negative('two')],{kind:'upcoming_bills',fingerprint:'bill:1'},now)).toBe(true);});
 test('nudge reasons include only current upcoming obligations and explicit review opportunities',()=>{expect(nudgeTopics({asOfDate:'2026-10-06',safeToSpend:'100.0000',upcomingBills:[{id:'1',date:'2026-10-10'},{id:'2',date:'2026-11-10'}],opportunityTopics:[topic]})).toEqual([topic,{kind:'upcoming_bills',fingerprint:'bill:1'}]);});
 test('unknown or zero safe-to-spend produces a review nudge without inventing amounts',()=>{expect(nudgeTopics({asOfDate:'2026-10-06',safeToSpend:null,upcomingBills:[]})).toEqual([{kind:'cashflow_checkin',fingerprint:'cashflow:2026-10-06'}]);});
});
