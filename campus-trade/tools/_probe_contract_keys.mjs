const BASE = 'http://127.0.0.1:8080';
async function req(method,path,body,token){const h={'Content-Type':'application/json'};if(token)h.Authorization='Bearer '+token;const r=await fetch(BASE+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();return {status:r.status,text,body:JSON.parse(text)}}
const out=[];
for (const p of ['/api/auth/me','/api/categories','/api/products?pageSize=50','/api/notifications','/api/badges']) {try{out.push([p,await req('GET',p)])}catch(e){out.push([p,e.message])}}
const login=await req('POST','/api/auth/login',{email:'lin@campus.edu',password:'Test@12345'});const t=login.body.data.token;
for (const p of ['/api/auth/me','/api/me/products','/api/me/favorites','/api/me/orders','/api/me/reports','/api/me/reviews/written','/api/me/reviews/received','/api/messages/conversations','/api/messages/unread-count','/api/badge','/api/notifications','/api/verifications/mine']) out.push([p,await req('GET',p,undefined,t)]);
const adminLogin=await req('POST','/api/auth/admin/login',{adminNo:'ADM-001',password:'Admin@12345'});const a=adminLogin.body.data.token;
for (const p of ['/api/auth/me','/api/admin/dashboard','/api/admin/verifications?status=%E5%BE%85%E5%AE%A1%E6%A0%B8','/api/admin/products','/api/admin/reports','/api/admin/students','/api/admin/audit?limit=1','/api/admin/forced-off-products','/api/admin/meta','/api/admin/products/forbidden-categories','/api/messages/conversations']) out.push([p,await req('GET',p,undefined,a)]);
for (const [p,r] of out) console.log('\n'+p+' status='+r.status+'\n'+(typeof r.text==='string'?r.text.slice(0,1100):JSON.stringify(r)));
