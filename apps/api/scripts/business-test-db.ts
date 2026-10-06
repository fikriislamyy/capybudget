import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
// Creates/migrates a separate database; never resets the application database.
const configured=process.env.DATABASE_URL;
if(!configured)throw new Error('DATABASE_URL is required.');
const destination=new URL(configured);destination.pathname='/capybudget_business_v2_test';
const administration=new URL(configured);administration.pathname='/postgres';
const admin=postgres(administration.toString(),{max:1});
try {
 const [present]=await admin`select 1 from pg_database where datname='capybudget_business_v2_test'`;
 if(!present)await admin.unsafe('create database capybudget_business_v2_test');
} finally {await admin.end();}
const db=postgres(destination.toString(),{max:1});
try {await migrate(drizzle(db),{migrationsFolder:'./drizzle'});console.log('Isolated business database migrated.');}
finally {await db.end();}
