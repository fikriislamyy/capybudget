import { parse } from 'csv-parse/sync';
import {recognize} from './ocr';
import {bcaStatement,pdfLines,type PdfPage} from './bca';
import { Money, positive } from './money';
export type Mapping={date:string;amount?:string;debit?:string;credit?:string;merchant?:string;notes?:string;reference?:string;dateFormat:'dd-mm-yyyy'|'mm-dd-yyyy'|'yyyy-mm-dd';decimal:'.'|',';defaultType:'expense'|'income';delimiter?:string;currency?:string};
export function parseDate(value:string,format:string) {
  const parts=value.trim().split(/[-/.]/);if(parts.length!==3)throw new Error('Date needs three components.');
  let year:string,month:string,day:string;
  if(format==='yyyy-mm-dd')[year,month,day]=parts as [string,string,string];else if(format==='mm-dd-yyyy')[month,day,year]=parts as [string,string,string];else [day,month,year]=parts as [string,string,string];
  const date=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Date is invalid.');return date;
}
export function statementAmount(value:string,decimal:'.'|',') {
  const compact=value.trim().replace(/\s/g,'').replace(decimal==='.'?/,/g:/\./g,'').replace(',','.');
  if(!/^-?\d+(\.\d{1,4})?$/.test(compact))throw new Error('Amount is unclear. Check decimal and column mapping.');return new Money(compact);
}
export function normalizeRow(raw:Record<string,string>,map:Mapping,currency:string){
  if(!map.date||!['dd-mm-yyyy','mm-dd-yyyy','yyyy-mm-dd'].includes(map.dateFormat)||!['.',','].includes(map.decimal))throw new Error('Choose date and decimal formats.');
  if(map.currency&&String(raw[map.currency]??'').trim().toUpperCase()!==currency)throw new Error('Statement currency does not match the selected account.');
  const date=parseDate(String(raw[map.date]??''),map.dateFormat);
  let n:InstanceType<typeof Money>,type=map.defaultType;
  if(map.debit||map.credit){const debit=statementAmount(String(raw[map.debit??'']||'0'),map.decimal),credit=statementAmount(String(raw[map.credit??'']||'0'),map.decimal);if(debit.isNegative()||credit.isNegative()||debit.gt(0)&&credit.gt(0))throw new Error('A row cannot contain both a debit and a credit.');n=credit.sub(debit);type=n.isNegative()?'expense':'income';}
  else{n=statementAmount(String(raw[map.amount??'']??''),map.decimal);if(n.isNegative())type='expense';}
  const merchant=String(raw[map.merchant??'']??'').slice(0,200),notes=String(raw[map.notes??'']??'').slice(0,2000);
  if(/opening balance|closing balance|balance brought|balance carried|saldo awal|saldo akhir/i.test(merchant+' '+notes))throw new Error('Statement balance row: skip this row.');
  return {date,amount:positive(n.abs().toFixed(4)),currency,type,merchant,notes,reference:String(raw[map.reference??'']??'').slice(0,200)};
}
export async function parseStatement(bytes:Uint8Array,kind:string,delimiter=','):Promise<Record<string,string>[]> {
  if(bytes.length>10*1024*1024)throw new Error('Maximum statement size is 10 MB.');
  if(kind==='image'){const result=await recognize(bytes);return textStatement(result.text);}
  if(kind==='csv')return parse(Buffer.from(bytes).toString('utf8'),{columns:true,bom:true,skip_empty_lines:true,delimiter,max_record_size:65536,to:5001});
  if(kind==='xlsx'){
    validateXlsx(bytes);
    const ExcelJS=(await import('exceljs')).default,book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(bytes) as any);
    const sheet=book.worksheets[0];if(!sheet||sheet.rowCount>5001||sheet.columnCount>50)throw new Error('Use at most 5,000 rows and 50 columns.');
    const headers:string[]=[];sheet.getRow(1).eachCell((c,i)=>{headers[i-1]=String(c.value??'');});
    const rows:Record<string,string>[]=[];
    for(let i=2;i<=sheet.rowCount;i++){const row:Record<string,string>={};headers.forEach((h,j)=>{const value=sheet.getRow(i).getCell(j+1).value;if(value&&typeof value==='object'&&'formula' in value)throw new Error('Formula cells are not supported. Export values only.');row[h]=value instanceof Date?value.toISOString().slice(0,10):typeof value==='object'&&value!==null?'':String(value??'');});rows.push(row);}return rows;
  }
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});const document=await task.promise;
  try{
    if(document.numPages>50)throw new Error('Maximum PDF length is 50 pages.');
    const pages:PdfPage[]=[],textPages:string[][]=[];
    for(let page=1;page<=document.numPages;page++){
      const p=await document.getPage(page),text=await p.getTextContent();
      const cells=text.items.flatMap(item=>'str' in item?[{text:item.str,x:item.transform[4]??0,y:item.transform[5]??0,width:item.width}]:[]);
      pages.push({cells});textPages.push(pdfLines(cells).map(line=>line.map(c=>c.text).join(' ')));
    }
    const bca=bcaStatement(pages);
    if(bca){if(bca.length>5000)throw new Error('Maximum statement length is 5,000 rows.');return bca;}
    const rows:Record<string,string>[]=[];
    const parseLines=(lines:string[])=>lines.flatMap(line=>{const match=line.trim().match(/^(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})\s+(.+?)\s+(-?[\d.,]+)(?:\s+.*)?$/);return match?[{date:match[1]!,merchant:match[2]!,amount:match[3]!}]:[];});
    for(let page=1;page<=document.numPages;page++){
      let parsed=parseLines(textPages[page-1]!);
      // A header date alone does not prove the transaction table has extractable text.
      if(!parsed.length){
        if(document.numPages>10)throw new Error('Scanned PDFs support up to 10 pages.');
        const p=await document.getPage(page),{createCanvas}=await import('@napi-rs/canvas'),viewport=p.getViewport({scale:1.5});
        if(viewport.width*viewport.height>12000000)throw new Error('Scanned page is too large.');
        const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await p.render({canvas:canvas as any,canvasContext:canvas.getContext('2d') as any,viewport}).promise;
        const ocr=await recognize(canvas.toBuffer('image/png'));parsed=parseLines(ocr.text.split('\n'));
      }
      rows.push(...parsed);
    }
    if(rows.length>5000)throw new Error('Maximum statement length is 5,000 rows.');
    if(!rows.length)throw new Error('No supported transactions could be read from this PDF. Check its format or use CSV/XLSX.');
    return rows;
  }finally{await task.destroy();}
}

export function receiptFields(text:string,confidence:number){
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean),total=lines.filter(x=>/total|amount due|jumlah|grand total/i.test(x)).reverse().find(x=>/[\d.,]+/.test(x));
  const amount=total?.match(/(?:[A-Z]{3}|Rp|[$€£])?\s*([\d][\d.,]*)\s*$/)?.[1]??'';
  const date=text.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/)?.[1]??'';
  return {merchant:lines[0]?.slice(0,200)??'',date,amount,currency:text.match(/\b(IDR|USD|EUR|GBP|SGD|MYR|AUD|JPY)\b/)?.[1]??(/\bRp\b/.test(text)?'IDR':''),confidence,needsReview:true};
}

export function textStatement(text:string){
 const rows:Record<string,string>[]=[];
 for(const line of text.split('\n')){
  const match=line.trim().match(/^(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})\s+(.+?)\s+(?:Rp\s*)?(-?[\d.,]+)(?:\s+([\d.,]+))?$/i);
  if(match)rows.push({date:match[1]!,merchant:match[2]!,amount:match[3]!,balance:match[4]??'',review:'OCR output: verify every field against the original.'});
 }
 if(!rows.length)throw new Error('No supported transaction rows were found. Use a clearer statement, CSV/XLSX, or manual entry.');return rows;
}
function validateXlsx(bytes:Uint8Array){
 const b=Buffer.from(bytes);let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('Invalid XLSX archive.');
 const entries=b.readUInt16LE(end+10),offset=b.readUInt32LE(end+16);if(entries>2000||offset>=b.length)throw new Error('XLSX archive is too large.');
 let at=offset,total=0;
 for(let i=0;i<entries;i++){if(at+46>b.length||b.readUInt32LE(at)!==0x02014b50)throw new Error('Invalid XLSX archive.');const size=b.readUInt32LE(at+24);total+=size;if(size===0xffffffff||total>64*1024*1024)throw new Error('Expanded XLSX must be under 64 MB.');at+=46+b.readUInt16LE(at+28)+b.readUInt16LE(at+30)+b.readUInt16LE(at+32);}
}
