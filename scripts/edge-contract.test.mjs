/** Executes the production HTTP handler and bundled business engine with simulated Auth/database I/O.
 * No test accounts, shop records, money movements or provider requests are created in production. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto,randomUUID} from 'node:crypto';
import {transformSync} from 'esbuild';
import * as engine from '../supabase/functions/business-api/engine.js';
const OWNER=engine.STORE_OWNER_ID, CASHIER='11111111-1111-4111-8111-111111111111', SHOP='22222222-2222-4222-8222-222222222222';
const code=transformSync(readFileSync(new URL('../supabase/functions/business-api/index.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code;
function runtime({shift=false}={}){
 let state=engine.initialShopState('1928','6574');
 state.products=[{id:'p1',name:'Cable',barcodes:['123'],price:100,cost:60,stock:2,lowStock:1}];
 if(shift){const replay=engine.replayCloudAction(state,'cashier',{name:'openShift',id:randomUUID(),at:Date.now(),args:[0]},{userId:CASHIER,name:'Cashier',role:'cashier'});assert.equal(replay.status,'ok');state=replay.state;}
 const db={state,version:1,receipts:new Map(),commits:0};
 class Query{
  constructor(table){this.table=table;this.filters={};this.fields='';}
  select(fields){this.fields=fields;return this;}
  eq(key,value){this.filters[key]=value;return this;}
  order(){return this;}
  limit(){return this;}
  value(){
   const user=this.filters.user_id??this.filters.id;
   if(this.table==='shops')return this.filters.id&&this.filters.id!==SHOP?null:{id:SHOP,owner_id:OWNER,name:engine.STORE_BRAND.fullName};
   if(this.table==='shop_members')return user===OWNER?{role:'owner'}:user===CASHIER?{role:'cashier'}:null;
   if(this.table==='profiles')return {id:user,display_name:user===OWNER?'Sankar Das':'Cashier'};
   if(this.table==='shop_states')return {version:db.version,data:structuredClone(db.state)};
   if(this.table==='shop_invites')return {join_code:null};
   if(this.table==='shop_action_receipts'){const version=db.receipts.get(this.filters.action_id);return version?{version}:null;}
   throw new Error('Unexpected table '+this.table);
  }
  async single(){return {data:this.value(),error:null};}
  async maybeSingle(){return {data:this.value(),error:null};}
 }
 const admin={auth:{getUser:async token=>({data:{user:token==='owner-session'?{id:OWNER,email:'owner@example.invalid'}:token==='cashier-session'?{id:CASHIER,email:'cashier@example.invalid',user_metadata:{role:'owner'}}:null},error:!['owner-session','cashier-session'].includes(token)})},from:table=>new Query(table),rpc(name,p){assert.equal(name,'commit_cloud_action');return {async single(){if(p._base_version!==db.version)return {data:{result_status:'conflict',result_version:db.version},error:null};db.state=structuredClone(p._data);db.version++;db.receipts.set(p._action_id,db.version);db.commits++;return {data:{result_status:'ok',result_version:db.version},error:null};}};}};
 let handler;
 runInNewContext(code,{require:name=>name.startsWith('npm:')?{createClient:()=>admin}:engine,Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://example.invalid':'test-only'},serve:fn=>{handler=fn;}},Response,Request,Headers,crypto:webcrypto,console:{error:()=>{}},exports:{}});
 const request=async(body,{token='owner-session',revision='3'}={})=>{const headers={'Content-Type':'application/json','Authorization':'Bearer '+token};if(revision)headers['x-mohra-client']=revision;const response=await handler(new Request('https://example.invalid/business-api',{method:'POST',headers,body:JSON.stringify(body)}));return {http:response.status,body:await response.json()};};
 const action=(name,args,baseVersion=db.version,id=randomUUID())=>({op:'apply',shopId:SHOP,baseVersion,action:{id,at:Date.now(),name,args,actor:{userId:OWNER,role:'owner'}}});
 return {db,request,action};
}
await test('HTTP: outdated clients must refresh and invalid sessions cannot read data',async()=>{const r=runtime();assert.equal((await r.request({op:'get',shopId:SHOP},{revision:null})).http,409);assert.equal((await r.request({op:'get',shopId:SHOP},{token:'invalid'})).http,401);});
await test('HTTP: only the fixed proprietor may prepare a shop, and existing setup is reused',async()=>{const r=runtime();assert.equal((await r.request({op:'bootstrap'},{token:'cashier-session'})).http,403);const owner=await r.request({op:'bootstrap'});assert.equal(owner.http,200);assert.equal(owner.body.shopId,SHOP);assert.equal(r.db.commits,0);});
await test('HTTP: cashier user metadata cannot forge owner access or expose costs',async()=>{const r=runtime();const res=await r.request({op:'get',shopId:SHOP,role:'owner'},{token:'cashier-session'});assert.equal(res.http,200);assert.equal(res.body.role,'cashier');assert.equal(res.body.actor.userId,CASHIER);assert.equal(res.body.state.ownerPin,'');assert.equal(res.body.state.products[0].cost,0);});
await test('HTTP: requests for an unrelated shop are rejected',async()=>{const r=runtime();assert.equal((await r.request({op:'get',shopId:randomUUID()})).http,403);});
await test('HTTP: cashier cannot adjust cash even when sending an owner PIN',async()=>{const r=runtime();const res=await r.request(r.action('setBalance',['cash',500,'1928','Attempt']),{token:'cashier-session'});assert.equal(res.body.status,'rejected');assert.equal(r.db.commits,0);assert.equal(r.db.state.accounts[0].balance,0);});
await test('HTTP: a retried checkout commits once and records the authenticated cashier',async()=>{const r=runtime({shift:true});const body=r.action('checkout',[[{productId:'p1',name:'Forged',qty:1,price:1,cost:999}],[{accountId:'cash',amount:100}]]);const first=await r.request(body,{token:'cashier-session'});assert.equal(first.body.status,'ok');const second=await r.request(body,{token:'cashier-session'});assert.equal(second.body.status,'ok');assert.equal(r.db.commits,1);assert.equal(r.db.state.sales.length,1);assert.equal(r.db.state.accounts[0].balance,100);assert.equal(r.db.state.txns[0].profit,40);assert.equal(r.db.state.txns[0].actor.userId,CASHIER);});
await test('HTTP: stale snapshots return a conflict without posting money',async()=>{const r=runtime({shift:true});const res=await r.request(r.action('serviceSlip',['Copy',100,'cash'],99),{token:'cashier-session'});assert.equal(res.body.status,'conflict');assert.equal(r.db.commits,0);assert.equal(res.body.state.ownerPin,'');});
await test('HTTP: suspension prevents old cashier requests from committing or reading balances',async()=>{const r=runtime();const old=r.action('serviceSlip',['Copy',100,'cash']);const disable=await r.request(r.action('setStaffAccess',[CASHIER,false]));assert.equal(disable.body.status,'ok');const rejected=await r.request(old,{token:'cashier-session'});assert.equal(rejected.http,403);assert.equal(rejected.body.code,'ACCESS_REVOKED');assert.equal((await r.request({op:'get',shopId:SHOP},{token:'cashier-session'})).http,403);assert.equal(r.db.commits,1);assert.equal(r.db.state.accounts[0].balance,0);});
await test('HTTP: transaction audit time comes from the server, not a forged client clock',async()=>{const r=runtime({shift:true});const body=r.action('serviceSlip',['Copy',20,'cash']);body.action.at=1;const before=Date.now();const response=await r.request(body,{token:'cashier-session'});assert.equal(response.body.status,'ok');assert.ok(r.db.state.txns[0].at>=before);assert.ok(r.db.state.txns[0].at<=Date.now());});
await test('HTTP: memo ID survives a customer being created by another device before rebase',async()=>{
 const r=runtime({shift:true});r.db.state.operations.policy.cashierDueLimit=1000;
 const args=[[{productId:'p1',name:'Cable',qty:1,price:100,cost:60}],[{accountId:'due',amount:100}],{name:'Customer',phone:'01700000000'}];
 const pending=r.action('checkout',args);const local=engine.replayCloudAction(r.db.state,'cashier',pending.action,{userId:CASHIER,name:'Cashier',role:'cashier'});assert.equal(local.status,'ok');const memo=local.state.sales[0].id;
 assert.equal((await r.request(r.action('checkout',args),{token:'cashier-session'})).body.status,'ok');
 assert.equal((await r.request(pending,{token:'cashier-session'})).body.status,'conflict');
 pending.baseVersion=r.db.version;const accepted=await r.request(pending,{token:'cashier-session'});assert.equal(accepted.body.status,'ok');assert.equal(accepted.body.state.sales[0].id,memo);assert.equal(r.db.state.customers.length,1);assert.equal(r.db.state.customers[0].due,200);assert.equal(accepted.body.state.sales[0].cost,0);
});
await test('HTTP: duplicate receipts carry a current canonical snapshot and matching version',async()=>{const r=runtime({shift:true});const first=r.action('serviceSlip',['Copy',20,'cash']);assert.equal((await r.request(first)).body.status,'ok');assert.equal((await r.request(r.action('serviceSlip',['Copy',30,'cash']))).body.status,'ok');const duplicate=await r.request(first);assert.equal(duplicate.body.version,r.db.version);assert.equal(duplicate.body.state.accounts[0].balance,50);assert.equal(r.db.commits,2);});
