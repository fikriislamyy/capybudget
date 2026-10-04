import {createWorker} from 'tesseract.js';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
export async function recognize(bytes:Uint8Array){
 validateImageSize(bytes);
 // Model data is bundled with the API image; receipts never leave this host.
 const {langPath}=require('@tesseract.js-data/eng');
 let cancelled=false;
 let worker:Awaited<ReturnType<typeof createWorker>>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const task=(async()=>{worker=await createWorker('eng',1,{langPath,cachePath:join(tmpdir(),'capybudget-ocr'),logger:()=>{},errorHandler:()=>{}});if(cancelled){await worker.terminate();throw new Error('OCR_TIMEOUT');}return worker.recognize(Buffer.from(bytes));})();
  const result=await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('OCR_TIMEOUT')),90000);})]);
  return {text:result.data.text,confidence:result.data.confidence};
 }finally{cancelled=true;if(timer)clearTimeout(timer);if(worker)await worker.terminate();}
}

/** Reject oversized image headers before the OCR decoder allocates pixels. */
export function validateImageSize(bytes:Uint8Array){
 const b=Buffer.from(bytes);let width=0,height=0;
 if(b.length>=24&&b[0]===0x89&&b.toString('ascii',1,4)==='PNG'){width=b.readUInt32BE(16);height=b.readUInt32BE(20);}
 else if(b.length>=4&&b[0]===0xff&&b[1]===0xd8){
  for(let at=2;at+4<=b.length;){if(b[at]!==0xff){at++;continue;}const marker=b[at+1]!;if(marker===0xd9||marker===0xda)break;if(marker===0xff||marker===0x01||(marker>=0xd0&&marker<=0xd7)){at++;continue;}const size=b.readUInt16BE(at+2);if(size<2||at+2+size>b.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=7){height=b.readUInt16BE(at+5);width=b.readUInt16BE(at+7);break;}at+=2+size;
  }
 }else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  const kind=b.toString('ascii',12,16);
  if(kind==='VP8X'){width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
  else if(kind==='VP8L'&&b[20]===0x2f){width=1+(b.readUInt32LE(21)&0x3fff);height=1+((b.readUInt32LE(21)>>>14)&0x3fff);}
  else if(kind==='VP8 '){width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff;}
 }
 if(!width||!height||width*height>12000000)throw Object.assign(new Error('Use a valid image of at most 12 megapixels.'),{status:422});
}
