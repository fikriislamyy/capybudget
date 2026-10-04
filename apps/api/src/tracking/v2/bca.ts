import { Money } from './money';

export type PdfCell={text:string;x:number;y:number;width:number};
export type PdfPage={cells:PdfCell[]};
const months=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
export function pdfLines(cells:PdfCell[]):PdfCell[][]{
 const lines:PdfCell[][]=[];
 for(const cell of [...cells].filter(c=>c.text.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)){
  const last=lines.at(-1);
  if(last&&Math.abs(last[0]!.y-cell.y)<=2)last.push(cell);else lines.push([cell]);
 }
 return lines.map(line=>line.sort((a,b)=>a.x-b.x));
}
const lineText=(line:PdfCell[])=>line.map(c=>c.text.trim()).join(' ');
const amountPattern=/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})$/;
function amount(cells:PdfCell[]){
 const values=cells.map(c=>c.text.trim().replace(/\s*(?:DB|CR)$/i,'')).filter(value=>amountPattern.test(value));
 if(values.length>1)throw new Error('BCA amount column is ambiguous. Review the original statement or export CSV.');
 return values[0]?.replace(/,/g,'');
}
/** BCA monthly text e-statements: positional columns, dd/mm dates and a header year. */
export function bcaStatement(pages:PdfPage[]):Record<string,string>[]|null{
 const lines=pages.map(p=>pdfLines(p.cells));
 const headerFor=(page:PdfCell[][])=>page.find(line=>['TANGGAL','KETERANGAN','CBG','MUTASI','SALDO'].every(word=>line.some(c=>c.text.trim().toUpperCase()===word)));
 if(!lines.some(page=>headerFor(page)))return null;
 const periodLines=lines.flat().map(lineText).filter(text=>/PERIODE/i.test(text));
 const monthNames=months.join('|');
 const periods=periodLines.map(text=>text.toUpperCase().match(new RegExp(`(?:${monthNames})\\s+(\\d{4})`))).filter(Boolean);
 if(!periods.length)throw new Error('The BCA statement period could not be read. A monthly statement with its period and year is required.');
 const years=new Set(periods.map(p=>p![1]!));if(years.size!==1)throw new Error('Import one BCA statement period at a time.');
 const year=[...years][0]!;
 const rows:Record<string,string>[]=[];
 let current:Record<string,string>|undefined,descriptionRight=0,openingBalance:string|undefined;
 for(const page of lines){
  const header=headerFor(page);if(!header)throw new Error('A BCA statement page is missing its transaction column headings.');
  const cell=(name:string)=>header.find(c=>c.text.trim().toUpperCase()===name)!;
  const dateRight=cell('KETERANGAN').x;
  const branch=header.find(c=>c.text.trim().toUpperCase()==='CBG');
  const mutationLeft=branch?branch.x+branch.width+8:cell('MUTASI').x-24;
  const balanceLeft=cell('SALDO').x-16;
  descriptionRight=branch?branch.x-8:mutationLeft;
  for(const line of page){
   if(line[0]!.y>=header[0]!.y-2||line[0]!.y<60)continue;
   const text=lineText(line);
   if(/^(?:SALDO AWAL|SALDO AKHIR|MUTASI (?:CR|DB)|TOTAL|BERSAMBUNG|CATATAN)/i.test(text))continue;
   const dateCell=line.find(c=>c.x<dateRight&&/^\d{2}\/\d{2}$/.test(c.text.trim()));
   if(dateCell){
    const description=line.filter(c=>c.x>dateCell.x+dateCell.width+4&&c.x<descriptionRight).map(c=>c.text.trim()).join(' ');
    if(/SALDO AWAL|SALDO AKHIR/i.test(description)){if(/SALDO AWAL/i.test(description)&&!rows.length)openingBalance=amount(line.filter(c=>c.x>=balanceLeft));current=undefined;continue;}
    const native=amount(line.filter(c=>c.x>=mutationLeft&&c.x<balanceLeft));
    if(!native)throw new Error('A BCA transaction amount could not be read. No rows have been posted; review the PDF or use a values-only CSV export.');
    const [day,month]=dateCell.text.trim().split('/');
    const iso=`${year}-${month}-${day}`;
    const parsed=new Date(iso+'T00:00:00Z');
    if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==iso)throw new Error('A BCA transaction date is invalid.');
    const marks=line.filter(c=>c.x>=mutationLeft&&c.x<balanceLeft).map(c=>c.text.trim()).join(' ');
    if(/\bDB\b/i.test(marks)&&/\bCR\b/i.test(marks))throw new Error('The BCA debit/credit marker is ambiguous. Review the original statement.');
    const debit=/\bDB\b/i.test(marks);
    const balance=amount(line.filter(c=>c.x>=balanceLeft));
    current={date:`${day}-${month}-${year}`,merchant:description.slice(0,200),notes:description,debit:debit?native:'0',credit:debit?'0':native,balance:balance??'',review:'BCA statement: verify the date, debit/credit and description against the original.'};
    rows.push(current);
   }else if(current){
    const continuation=line.filter(c=>c.x>=dateRight-80&&c.x<descriptionRight).map(c=>c.text.trim()).join(' ');
    if(continuation&&!/SALDO AWAL|SALDO AKHIR|MUTASI (?:CR|DB)|TOTAL|BERSAMBUNG|CATATAN/i.test(continuation))current.notes=(current.notes+'\n'+continuation).slice(0,2000);
   }
  }
 }
 if(!rows.length)throw new Error('No transactions were found in the BCA statement. Opening and closing balances are not transactions.');
 // Reconcile sections where balances are printed; missing balances remain visible for review.
 let previous:InstanceType<typeof Money>|undefined=openingBalance?new Money(openingBalance):undefined,running=new Money(0);
 for(const row of rows){
  running=running.add(row.credit!).sub(row.debit!);
  if(row.balance){const balance=new Money(row.balance);if(previous&&!previous.add(running).eq(balance))throw new Error('BCA statement amounts do not reconcile with its printed balances. Review the PDF layout before importing.');previous=balance;running=new Money(0);}
 }
 return rows;
}
