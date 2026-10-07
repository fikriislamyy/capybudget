import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
const configured=process.env.DATABASE_URL;if(!configured)throw new Error('DATABASE_URL is required');
const destination=new URL(configured);if(!['localhost','127.0.0.1'].includes(destination.hostname))throw new Error('Isolated assistant checks require a local PostgreSQL host');const name=process.argv.includes('--fresh-check')?'capybudget_assistant_v2_fresh_test':'capybudget_assistant_v2_test';destination.pathname='/'+name;
const administration=new URL(destination);administration.pathname='/postgres';const admin=postgres(administration.toString(),{max:1,onnotice:()=>{}});try{if(!(await admin`select 1 from pg_database where datname=${name}`).length)await admin.unsafe('create database '+name);}finally{await admin.end();}
const db=postgres(destination.toString(),{max:1,onnotice:()=>{}});try{await migrate(drizzle(db),{migrationsFolder:import.meta.dir+'/../drizzle'});console.log('Isolated assistant V2 database migrated. Application data unchanged.');}finally{await db.end();}
