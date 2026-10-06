import assert from 'node:assert/strict';
import pg from 'pg';
import {SignJWT} from 'jose';
import {randomBytes} from 'node:crypto';
import {importLegacyReports} from './import-legacy-reports.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
const tag=randomBytes(8).toString('hex');
const emails=Object.fromEntries(['wahib','khabib','ryant','fadhilah','thoha','rizqi','nabilla'].map(name=>[name,`${name}-${tag}@example.invalid`]));
const row={line:2,name:'khabib',date:'2024-01-01',platform:'meta',originalPlatform:'Facebook',product:'Archive '+tag,spent:100.25,impressions:1234,clicks:20,leads:3,notes:'CSV original notes',submittedAt:'2024-01-02T15:00:00+07:00',sourceRowHash:'c'.repeat(64)};
const plan={sha256:randomBytes(32).toString('hex'),duplicatePolicy:'hold',eligibleId:'0',source:'fixture.csv',readyRows:2,heldRows:0,skipped:{},rows:[row,{...row,line:3,name:'wahib',spent:200,product:'Other '+tag}]};
try{
 await client.query("insert into users(name,email,password_hash,role) values('Wahib Import QA',$1,'inaccessible','supervisor')",[emails.wahib]);
 const dry=await importLegacyReports(client,plan,emails,false);
 assert.equal(dry.rows,2);assert.equal(dry.reportIds.length,2);
 assert.equal(+(await client.query('select count(*) from users where email=any($1)',[Object.values(emails)])).rows[0].count,1,'Dry run rolls back users');
 assert.equal(+(await client.query('select count(*) from legacy_report_rows where file_hash=$1',[plan.sha256])).rows[0].count,0);
 await assert.rejects(()=>importLegacyReports(client,{...plan,rows:[row,{...row,line:3}]},emails,true),/Duplicate normalized/);
 await assert.rejects(()=>importLegacyReports(client,{...plan,eligibleId:'Off'},emails,true));
 const applied=await importLegacyReports(client,plan,emails,true);
 assert.equal(applied.applied,true);assert.equal(applied.totals.spentCents,30025);
 const pending=(await client.query('select is_active,invitation_pending from users where email=$1',[emails.khabib])).rows[0];
 assert.equal(pending.is_active,false);assert.equal(pending.invitation_pending,true);
 const audit=(await client.query('select source_data from legacy_report_rows where file_hash=$1 and source_row=2',[plan.sha256])).rows[0].source_data;
 assert.equal(audit.idFlag,'0');assert.equal(audit.notes,row.notes);
 const reports=(await client.query('select date::text,source from daily_reports where id=any($1)',[applied.reportIds])).rows;
 assert.ok(reports.every(r=>r.date==='2024-01-01'&&r.source==='legacy_csv'));
 if(process.env.IMPORT_HTTP_BASE){
  const base=process.env.IMPORT_HTTP_BASE;
  const actor=applied.byMember.wahib.userId;
  const jwt=await new SignJWT({uid:actor,sv:0,remember:false}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers={Cookie:'kpi_session='+jwt};
  for(const id of applied.reportIds){
   const r=await fetch(base+'/reports/'+id,{headers});assert.equal(r.status,200);
   const html=await r.text();assert.ok(html.includes('Laporan historis')&&html.includes('Angka sesuai CSV sumber')&&html.includes('CSV original notes'));
  }
  const list=await fetch(base+'/reports?period=2024-01',{headers});assert.equal(list.status,200);assert.ok((await list.text()).includes('Archive'));
  const mine=await fetch(base+'/reports?view=mine&range=2024-01',{headers});assert.equal(mine.status,200);assert.ok((await mine.text()).includes('Arsip CSV'));
  console.log('PASS: authenticated historical report details, archived month filters and personal historical view');
 }
 const again=await importLegacyReports(client,plan,emails,true);assert.equal(again.alreadyImported,true);
 await assert.rejects(()=>importLegacyReports(client,{...plan,sha256:randomBytes(32).toString('hex')},emails,true),/Existing report conflict/);
 assert.equal(+(await client.query('select count(*) from legacy_report_rows where file_hash=$1',[plan.sha256])).rows[0].count,2);
 console.log('PASS: dry-run rollback, strict ID/duplicate checks, per-user attribution, pending accounts, date/source audit, exact totals, idempotency and conflict rollback');
}finally{
 await client.query('delete from daily_reports where user_id in(select id from users where email=any($1))',[Object.values(emails)]);
 await client.query('delete from campaigns where owner_id in(select id from users where email=any($1))',[Object.values(emails)]);
 await client.query('delete from users where email=any($1)',[Object.values(emails)]);
 await client.query('delete from app_settings where key=$1',['import:csv:'+plan.sha256]);
 client.release();await pool.end();
}
