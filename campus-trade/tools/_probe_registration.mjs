const BASE='http://127.0.0.1:8080';
async function req(method,path,body,token){const h={'Content-Type':'application/json'};if(token)h.Authorization='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let json;try{json=JSON.parse(text)}catch{json=null}return {status:r.status,text,body:json}}
const email=`contract-${Date.now()}@campus.edu`;
let r=await req('POST','/api/auth/send-code',{email});console.log('send',r.status,r.text);
r=await req('GET','/api/dev/mailbox?limit=5');const m=r.body.data.items.find(x=>x.to===email);console.log('mail',m);
const code=(m.text.match(/\b(\d{6})\b/)||[])[1];console.log('code',code);
r=await req('POST','/api/auth/register',{email,code,nickname:'契约测试',realName:'契约同学',password:'Contract1',phone:null,agree:true});console.log('register',r.status,r.text.slice(0,1000));
const t=r.body.data.token;
r=await req('GET','/api/auth/me',undefined,t);console.log('me',r.status,r.text);
r=await req('POST','/api/verifications',{declaredNo:'20260001',cardImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='},t);console.log('submit',r.status,r.text);
const admin=await req('POST','/api/auth/admin/login',{adminNo:'ADM-001',password:'Admin@12345'});const at=admin.body.data.token;
r=await req('GET','/api/admin/verifications?status='+encodeURIComponent('待审核'),undefined,at);const v=r.body.data.find(x=>x.email===email);console.log('certqueue',v);
r=await req('GET','/api/admin/verifications/'+v.id+'/image',undefined,at);console.log('image',r.status,r.text.slice(0,30));
r=await req('POST','/api/admin/verifications/'+v.id+'/reject',{reason:'测试驳回',forgery:false},at);console.log('reject',r.status,r.text);
r=await req('GET','/api/verifications/mine',undefined,t);console.log('certmine',r.status,r.text);
r=await req('POST','/api/verifications',{declaredNo:'20260001',cardImage:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='},t);console.log('resubmit',r.status,r.text.slice(0,800));
