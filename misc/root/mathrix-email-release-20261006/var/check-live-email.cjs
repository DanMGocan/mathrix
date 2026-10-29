const assert=require('node:assert/strict');
const {getEmailDashboard}=require('/srv/mathrix/server/email.ts');
const {db}=require('/srv/mathrix/server/db.ts');
(async()=>{
 const data=await getEmailDashboard();
 assert.equal(data.configured,false);
 assert.deepEqual(data.missing,['BREVO_FROM_EMAIL']);
 assert.equal(data.weekly.enabled,true);
 assert.equal(data.weekly.dayOfWeek,1);
 assert.equal(data.weekly.hourUtc,9);
 assert.equal(data.weekly.subject,'We miss you at Mathrix');
 assert.ok(Date.parse(data.weekly.nextRunAt)>Date.now());
 assert.equal(data.campaigns.length,0);
 console.log(JSON.stringify({configured:data.configured,missing:data.missing,recipientCount:data.recipientCount,weekly:data.weekly,campaigns:data.campaigns.length}));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
