import { readTracking } from "./order-form-config";
/** Executed on the landing page, never on the authenticated application origin. */
export function buildOrderEmbed(url:string, config:unknown, maxWidth=600) {
 const width=Number.isInteger(maxWidth)&&maxWidth>=320&&maxWidth<=960?maxWidth:600;
 const tracking=readTracking(config);
 return `(()=>{
 const s=document.currentScript;if(!s)return;
 const u=new URL(${JSON.stringify(url)}), origin=u.origin, slug=u.pathname.split('/').pop(), config=${JSON.stringify(tracking)};
 const parentOrigin=location.origin;if(!/^https?:$/.test(location.protocol))return;
 for(const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','ttclid']){const v=new URLSearchParams(location.search).get(k);if(v)u.searchParams.set(k,v)}
 u.searchParams.set('embed_origin',parentOrigin);
 const f=document.createElement('iframe');f.src=u.href;f.title='Form pendaftaran';f.style='width:100%;max-width:${width}px;height:760px;border:0;display:block;margin:auto';f.setAttribute('referrerpolicy','no-referrer');f.setAttribute('loading','lazy');s.insertAdjacentElement('afterend',f);
 const seen=new Set();
 const script=(src)=>{if([...document.scripts].some(x=>x.src===src))return;const el=document.createElement('script');el.async=true;el.src=src;document.head.appendChild(el)};
 function track(reference,meta){
  const pixelIds=Array.isArray(meta?.pixelIds)?meta.pixelIds.filter(id=>typeof id==='string'&&/^\\d{5,25}$/.test(id)).slice(0,6):config.metaPixelIds;
  const metaEvent=['Lead','Contact','CompleteRegistration','AddToWishlist'].includes(meta?.event)?meta.event:config.metaEvent;
  if(parentOrigin===origin)return;
  const key='kpiads:lead:'+reference;if(seen.has(key))return;
  try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1')}catch{}seen.add(key);
  const payload={event:'kpiads_lead',event_id:reference,form_id:slug};
  try{
   window.dataLayer=window.dataLayer||[];
   for(const id of config.gtmIds){const src='https://www.googletagmanager.com/gtm.js?id='+id;if(!window.google_tag_manager?.[id]&&![...document.scripts].some(x=>x.src===src)){window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});script(src)}}
   window.dataLayer.push(payload);
  }catch{}
  try{
   if(pixelIds.length){
    if(!window.fbq){const q=function(){q.callMethod?q.callMethod.apply(q,arguments):q.queue.push(arguments)};q.queue=[];q.loaded=true;q.version='2.0';q.push=q;window.fbq=q;window._fbq=window._fbq||q;script('https://connect.facebook.net/en_US/fbevents.js')}
    window.__kpiadsMeta=window.__kpiadsMeta||new Set();
    for(const id of pixelIds){if(!window.__kpiadsMeta.has(id)){window.fbq('set','autoConfig',false,id);window.fbq('init',id);window.__kpiadsMeta.add(id)}window.fbq('trackSingle',id,metaEvent,{}, {eventID:reference})}
   }
  }catch{}
  try{
   if(config.tiktokPixelIds.length){
    window.TiktokAnalyticsObject='ttq';const q=window.ttq=window.ttq||[];
    if(!q.load){const methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];const defer=(target,m)=>{target[m]=function(){target.push([m,...arguments])}};q.methods=methods;methods.forEach(m=>defer(q,m));q.instance=id=>{const inst=q._i[id]||[];methods.forEach(m=>defer(inst,m));return inst};q.load=id=>{const src='https://analytics.tiktok.com/i18n/pixel/events.js';q._i=q._i||{};q._i[id]=[];q._i[id]._u=src;q._t=q._t||{};q._t[id]=Date.now();q._o=q._o||{};q._o[id]={};script(src+'?sdkid='+id+'&lib=ttq')}}
    for(const id of config.tiktokPixelIds){if(!q._i?.[id])q.load(id);q.instance(id).track('Lead',{}, {event_id:reference})}
   }
  }catch{}
 }
 window.addEventListener('message',e=>{
  if(e.origin!==origin||e.source!==f.contentWindow||!e.data||e.data.slug!==slug)return;
  if(e.data.type==='kpiads:ready'){const cookie=name=>{try{return decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith(name+'='))?.split('=').slice(1).join('=')||'')}catch{return ''}};f.contentWindow.postMessage({type:'kpiads:context',slug,sourceUrl:location.origin+location.pathname,fbp:cookie('_fbp'),fbc:cookie('_fbc')},origin);return}
  if(e.data.type==='kpiads:resize'&&Number.isFinite(e.data.height)){f.style.height=Math.max(260,Math.min(1800,e.data.height))+'px';return}
  if(e.data.type==='kpiads:lead'&&e.data.consent===true&&typeof e.data.reference==='string'&&/^[a-f0-9-]{36}$/.test(e.data.reference))track(e.data.reference,e.data.meta);
 });
})();`;
}
