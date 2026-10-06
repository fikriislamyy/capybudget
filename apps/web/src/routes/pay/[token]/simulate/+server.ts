import type {RequestHandler} from './$types';
export const POST:RequestHandler=async({params,request,url})=>{
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({message:'Untrusted request origin.'},{status:403});
 if(!/^[0-9a-f]{64}$/.test(params.token))return new Response(null,{status:404});
 try{
  const result=await fetch(`${process.env.API_INTERNAL_URL??'http://localhost:3000'}/api/payments/qris/${params.token}/simulate`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(45000)});
  return new Response(await result.text(),{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return Response.json({message:'Simulation confirmation is taking longer than expected. Refresh payment status before retrying.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
