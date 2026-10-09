import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { appearanceSchema,trackingSchema,weightedRecipient,leadCommerceSchema,evenWeights,rebalanceWeights,readAppearance,contrastRatio,FORM_THEMES,THEME_TOKEN_DEFAULTS,DEFAULT_APPEARANCE,applyFormTheme } from "./order-form-config";
import { orderFormInput,DEFAULT_ORDER_FIELDS } from "./order-form-input";
import { buildOrderEmbed } from "./order-embed";
test("form validation rejects invalid percentages, script injection and invalid commerce",()=>{
 const base={campaignId:1,title:"Order form",description:"",fields:DEFAULT_ORDER_FIELDS,routing:"weighted",assigneeIds:[2,3],weights:{2:75,3:25},published:true,source:"ads",message:"Halo",useFormLeads:true,effectiveDate:"2026-10-06"};
 assert.ok(orderFormInput.safeParse(base).success);
 for(const weights of [{2:75,3:24},{2:75,3:25,4:1},{2:100.1,3:-.1}])assert.equal(orderFormInput.safeParse({...base,weights}).success,false);
 assert.equal(appearanceSchema.safeParse({buttonColor:"red;background:url(x)"}).success,false);
 assert.equal(trackingSchema.safeParse({gtmIds:['GTM-X</script>']}).success,false);
 assert.equal(trackingSchema.safeParse({metaPixelIds:['123456','123456']}).success,false);
 assert.equal(leadCommerceSchema.safeParse({paymentStatus:"paid",revenue:-1,followUpStep:5,followUpAt:null}).success,false);
});
test("weighted distribution is proportional and excludes disabled/zero recipients",()=>{
 let credits={};const totals:Record<number,number>={1:0,2:0,3:0};
 for(let i=0;i<100;i++){const next=weightedRecipient([1,2,3],{1:75,2:25,3:0},credits)!;totals[next.id]++;credits=next.credits;}
 assert.deepEqual(totals,{1:75,2:25,3:0});assert.equal(weightedRecipient([2,3],{1:75,2:25,3:0},credits)?.id,2);
 assert.equal(weightedRecipient([3],{3:0}),null);
});
test("custom percentages: helpers always keep integer shares summing to 100",()=>{
 assert.deepEqual(evenWeights([1,2,3]),{1:34,2:33,3:33});
 assert.deepEqual(rebalanceWeights([1,2],{1:50,2:50},1,20),{1:20,2:80});
 assert.deepEqual(rebalanceWeights([1,2,3],{1:50,2:30,3:20},1,60),{1:60,2:24,3:16});
 assert.deepEqual(rebalanceWeights([1,2,3],{1:100,2:0,3:0},1,40),{1:40,2:30,3:30});
 assert.deepEqual(rebalanceWeights([1],{},1,30),{1:100});
 for(const value of [0,7,33,99,100,140,-5]){const next=rebalanceWeights([1,2,3,4],{1:10,2:20,3:30,4:40},2,value);assert.equal(Object.values(next).reduce((a,b)=>a+b,0),100);}
 const base={campaignId:1,title:"Order form",description:"",fields:DEFAULT_ORDER_FIELDS,routing:"weighted",assigneeIds:[2,3],weights:{2:20,3:80},published:true,source:"ads",message:"Halo",useFormLeads:true,effectiveDate:"2026-10-06"};
 assert.ok(orderFormInput.safeParse(base).success);
 let credits={};const totals:Record<number,number>={2:0,3:0};
 for(let i=0;i<10;i++){const next=weightedRecipient([2,3],base.weights,credits)!;totals[next.id]++;credits=next.credits;}
 assert.deepEqual(totals,{2:2,3:8});
});
test("theme: legacy appearance keeps its look and presets are valid and readable",()=>{
 const legacy=readAppearance({buttonText:"Daftar",buttonColor:"#123456",layout:"plain",showLabels:true,placeholders:{name:"A",phone:"B",email:"C",city:"D"}});
 assert.equal(legacy.buttonColor,"#123456");assert.equal(legacy.layout,"plain");assert.equal(legacy.backgroundColor,"#ffffff");assert.equal(legacy.showBenefits,true);assert.deepEqual(legacy.benefits,["Mudah","Cepat","Aman"]);
 for(const [id,{label:_,...tokens}] of Object.entries(FORM_THEMES)){assert.ok(appearanceSchema.safeParse({...tokens,theme:id}).success,id);assert.ok(contrastRatio(tokens.textColor,tokens.backgroundColor)>=4.5,id);}
 assert.ok(appearanceSchema.safeParse({pageColor:"transparent"}).success);
 for(const bad of [{pageColor:"url(x)"},{textColor:"#fff;x"},{font:"comic"},{benefits:["a","b"]},{note:"x".repeat(161)}])assert.equal(appearanceSchema.safeParse(bad).success,false);
});
function fixture(parentOrigin="https://landing.example"){
 const listeners:Record<string,(event:unknown)=>void>={};const scripts:{src:string}[]=[];let frame:any;
 const storage=new Map();const context:any={URL,URLSearchParams,Set,Date,location:{origin:parentOrigin,protocol:"https:",search:"?utm_campaign=QA&ttclid=test"},sessionStorage:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v)},document:{scripts,currentScript:{insertAdjacentElement:(_:string,value:unknown)=>{frame=value}},createElement:(tag:string)=>tag==="iframe"?{style:{},contentWindow:{},setAttribute(){}}:{},head:{appendChild:(script:{src:string})=>scripts.push(script)}}};
 // style assignment in actual DOM is a setter; mirror it for the isolated script test.
 context.document.createElement=(tag:string)=>tag==="iframe"?{_style:{} as Record<string,string>,get style(){return this._style??={}},set style(_:unknown){this._style={}},contentWindow:{},setAttribute(){}}:{};
 context.window=context;context.addEventListener=(name:string,fn:(event:unknown)=>void)=>{listeners[name]=fn};
 const slug="a".repeat(24);vm.runInNewContext(buildOrderEmbed(`https://app.example/f/${slug}`,{metaPixelIds:['123456789'],gtmIds:['GTM-ABC123'],tiktokPixelIds:['ABCDEFGHIJKLMNOPQRST']}),context);
 const send=(data:Record<string,unknown>,patch={})=>listeners.message({origin:"https://app.example",source:frame.contentWindow,data:{slug,...data},...patch});
 return {context,scripts,frame,send};
}
test("embed protects source/origin, defers tags until consent and saved lead, deduplicates events",()=>{
 const {context,scripts,frame,send}=fixture();assert.equal(scripts.length,0);assert.ok(frame.src.includes("utm_campaign=QA"));assert.ok(frame.src.includes("ttclid=test"));
 const event={type:"kpiads:lead",reference:"a1b2c3d4-aaaa-bbbb-cccc-111122223333",consent:true};
 send(event,{origin:"https://evil.example"});send(event,{source:{}});send({...event,consent:false});assert.equal(scripts.length,0);
 send(event);assert.equal(scripts.length,3);send(event);assert.equal(context.dataLayer.filter((e:any)=>e.event==="kpiads_lead").length,1);
 const payload=context.dataLayer.find((e:any)=>e.event==="kpiads_lead");assert.deepEqual(Object.keys(payload).sort(),['event','event_id','form_id']);
 assert.equal(context.fbq.queue.filter((e:any)=>e[0]==="trackSingle").length,1);
 assert.equal(context.ttq._i.ABCDEFGHIJKLMNOPQRST.filter((e:any)=>e[0]==="track")[0][1],"Lead");
 send({type:"kpiads:resize",height:9999});assert.equal(frame.style.height,"1800px");
 const own=fixture("https://app.example");own.send(event);assert.equal(own.scripts.length,0,"Do not run advertiser-controlled GTM on app origin");
});

test("embed uses the saved event snapshot for CAPI deduplication",()=>{
 const {context,send}=fixture();const reference="a1b2c3d4-aaaa-bbbb-cccc-111122223334";
 send({type:"kpiads:lead",reference,consent:true,meta:{event:"Contact",pixelIds:["7777777777"]}});
 const calls=context.fbq.queue.filter((e:any)=>e[0]==="trackSingle");
 assert.equal(calls.length,1);assert.equal(calls[0][1],"7777777777");assert.equal(calls[0][2],"Contact");assert.equal(calls[0][4].eventID,reference);
});

test("detailed theme: old forms keep their look, every preset is valid and readable, URLs are plain https",()=>{
 // A form saved before the detailed options gets exactly the original look.
 const legacy=readAppearance({theme:"ocean",buttonColor:"#2563eb",buttonStyle:"outline",radius:"lg"});
 for(const [key,value] of Object.entries(THEME_TOKEN_DEFAULTS))if(!["buttonColor","buttonStyle","radius"].includes(key))assert.deepEqual((legacy as Record<string,unknown>)[key],value,key);
 assert.deepEqual([legacy.logoUrl,legacy.bannerUrl,legacy.titleDivider,legacy.benefitsPosition,legacy.benefitsIcons],["","",true,"top",true]);
 assert.equal(Object.keys(FORM_THEMES).length,10);
 for(const id of Object.keys(FORM_THEMES) as (keyof typeof FORM_THEMES)[]){
  const themed=applyFormTheme(DEFAULT_APPEARANCE,id);
  assert.ok(appearanceSchema.safeParse(themed).success,id);
  assert.ok(contrastRatio(themed.textColor,themed.backgroundColor)>=4.5,id);
  assert.ok(contrastRatio(themed.headingColor??themed.textColor,themed.backgroundColor)>=4.5,`${id} heading`);
 }
 // Switching preset leaves nothing of the previous one behind (e.g. promo's red heading).
 const back=applyFormTheme(applyFormTheme(DEFAULT_APPEARANCE,"promo"),"whatsapp");
 assert.equal(back.headingColor,null);assert.equal(back.titleWeight,"semibold");assert.equal(back.buttonSize,"md");
 // Text and images are content, not theme.
 const own=applyFormTheme({...DEFAULT_APPEARANCE,buttonText:"Daftar sekarang",logoUrl:"https://cdn.example/logo.png"},"sunset");
 assert.equal(own.buttonText,"Daftar sekarang");assert.equal(own.logoUrl,"https://cdn.example/logo.png");
 assert.ok(appearanceSchema.safeParse({logoUrl:"https://cdn.example/a/logo.png?v=2",bannerUrl:""}).success);
 for(const bad of ["http://cdn.example/logo.png","javascript:alert(1)","https://x.example/a.png\") ;background:red","https://x.example/a b.png","https://x.example/<x>.png","data:image/png;base64,AAAA"])assert.equal(appearanceSchema.safeParse({logoUrl:bad}).success,false,bad);
 for(const bad of [{headingColor:"red"},{pageGradientAngle:400},{buttonStyle:"neon"},{width:"huge"},{fieldRadius:"round"},{font:"comic"}])assert.equal(appearanceSchema.safeParse(bad).success,false,JSON.stringify(bad));
});

test("embed iframe takes the form width, bounded",()=>{
 const width=(value?:number)=>/max-width:(\d+)px/.exec(buildOrderEmbed("https://app.example/f/"+"a".repeat(24),{},value))?.[1];
 assert.equal(width(),"600");assert.equal(width(720),"720");assert.equal(width(480),"480");assert.equal(width(5000),"600");assert.equal(width(Number.NaN),"600");
});
