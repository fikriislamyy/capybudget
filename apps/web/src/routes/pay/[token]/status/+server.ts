import type {RequestHandler} from './$types';
export const GET:RequestHandler=async({params})=>{
 if(!/^[0-9a-f]{64}$/.test(params.token))return new Response(null,{status:404});
 try{
  const result=await fetch(`${process.env.API_INTERNAL_URL??'http://localhost:3000'}/api/payments/qris/${params.token}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
  return new Response(await result.text(),{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return Response.json({message:'Payment status is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
