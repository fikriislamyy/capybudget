import {error} from '@sveltejs/kit';
import type {PageServerLoad} from './$types';
export const load:PageServerLoad=async({params,fetch,setHeaders})=>{
 setHeaders({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});
 const response=await fetch(`/pay/${params.token}/status`);
 if(response.status===404)error(404,'This payment link is unavailable.');
 if(!response.ok)error(503,'Payment details are temporarily unavailable. Please try again.');
 return {payment:(await response.json()).payment,token:params.token};
};
