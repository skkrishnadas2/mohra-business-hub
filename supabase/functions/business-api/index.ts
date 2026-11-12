import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {cloudRequestSchema,replayCloudAction,shopSnapshot,stateForRole} from './engine.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return response({ok:true});
 if(req.method!=='POST')return response({error:'Method not allowed'},405);
 const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return response({error:'লগইন প্রয়োজন'},401);
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await admin.auth.getUser(token);
 if(authError||!auth.user)return response({error:'লগইন মেয়াদ শেষ। আবার প্রবেশ করুন।'},401);
 const userId=auth.user.id;
 try{
  const raw=await req.text();if(raw.length>4_000_000)return response({error:'ডেটা খুব বড়'},413);
  const parsed=cloudRequestSchema.safeParse(JSON.parse(raw));
  if(!parsed.success)return response({error:'অনুরোধের তথ্য সঠিক নয়'},400);
  const p=parsed.data;
  if(p.op==='list'){
   const {data,error}=await admin.from('shop_members').select('shop_id,role,shops!inner(name)').eq('user_id',userId);if(error)throw error;
   return response(data.map((r:any)=>({shopId:r.shop_id,role:r.role,name:r.shops.name})));
  }
  if(p.op==='create'){
   const {data,error}=await admin.rpc('create_cloud_shop',{_name:p.name,_data:shopSnapshot(p.state),_user_id:userId});if(error)throw error;return response({shopId:data});
  }
  if(p.op==='join'){
   const {data,error}=await admin.rpc('join_cloud_shop',{_shop_id:p.shopId,_join_code:p.joinCode,_user_id:userId});if(error)return response({error:'দোকানের ID বা যোগ দেওয়ার কোড সঠিক নয়'},403);return response({shopId:p.shopId,role:data});
  }
  const {data:member,error:memberError}=await admin.from('shop_members').select('role').eq('shop_id',p.shopId).eq('user_id',userId).maybeSingle();
  if(memberError||!member)return response({error:'এই দোকানে আপনার প্রবেশাধিকার নেই'},403);
  const role=member.role;
  const read=async()=>{const {data,error}=await admin.from('shop_states').select('version,data').eq('shop_id',p.shopId).single();if(error)throw error;const parsed=snapshotSchemaSafe(data.data);return {version:data.version,state:parsed};};
  if(p.op==='apply'){
   const {data:receipt,error}=await admin.from('shop_action_receipts').select('version').eq('shop_id',p.shopId).eq('action_id',p.action.id).maybeSingle();if(error)throw error;if(receipt)return response({status:'ok',version:receipt.version});
  }
  const current=await read();
  if(p.op==='get'){
   let joinCode=null;if(role==='owner'){const {data,error}=await admin.from('shop_invites').select('join_code').eq('shop_id',p.shopId).maybeSingle();if(error)throw error;joinCode=data?.join_code??null;}
   return response({shopId:p.shopId,name:current.state.shopName,role,version:current.version,state:stateForRole(current.state,role),joinCode});
  }
  if(current.version!==p.baseVersion)return response({status:'conflict',version:current.version,state:stateForRole(current.state,role)});
  const replay=replayCloudAction(current.state,role,p.action);
  if(replay.status==='rejected')return response({status:'rejected',message:replay.message,version:current.version,state:stateForRole(current.state,role)});
  const {data:committed,error}=await admin.rpc('commit_cloud_action',{_shop_id:p.shopId,_action_id:p.action.id,_base_version:p.baseVersion,_data:replay.state,_user_id:userId}).single();if(error||!committed)throw error||new Error('Commit failed');
  if(committed.result_status==='conflict'){const latest=await read();return response({status:'conflict',version:latest.version,state:stateForRole(latest.state,role)});}
  return response({status:'ok',version:committed.result_version});
 }catch(e){console.error('business-api request failed',e instanceof Error?e.message:'error');return response({error:'অনুরোধ সংরক্ষণ করা যায়নি। পুনরায় চেষ্টা করুন।'},400);}
});
// Existing snapshots remain authoritative; mutations still pass through validated actions.
function snapshotSchemaSafe(value:any){if(!value||!Array.isArray(value.accounts)||!Array.isArray(value.txns))throw new Error('Invalid shop snapshot');return value;}
