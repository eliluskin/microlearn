import OpenAI from "openai";
const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const MODEL=process.env.OPENAI_MODEL||"gpt-5.6-luna";
const Q=[
['site:reuters.com (Israel OR Iran OR Gaza OR Lebanon OR "United States" OR Trump OR Middle East)','en-US','US','US:en'],
['site:ynet.co.il (פוליטיקה OR ממשלה OR איראן OR ישראל OR ביטחון)','he','IL','IL:he'],
['site:ynetnews.com (Israel OR Iran OR politics OR security OR economy)','en-US','US','US:en'],
['site:globes.co.il (שוק ההון OR אנבידיה OR בינה מלאכותית OR השקעות OR פוליטיקה OR איראן)','he','IL','IL:he'],
['site:en.globes.co.il (Nvidia OR AI OR investments OR Israel OR autonomous OR robotics)','en-US','US','US:en'],
['site:reuters.com (Nvidia OR "S&P 500" OR silver OR uranium OR SpaceX OR earnings OR markets)','en-US','US','US:en'],
['site:reuters.com (humanoid OR robotics OR "autonomous driving" OR ADAS OR "artificial intelligence")','en-US','US','US:en'],
['site:techcrunch.com (AI OR robotics OR agents OR Nvidia OR SpaceX)','en-US','US','US:en'],
['site:spacenews.com (SpaceX OR Starship OR launch OR satellite)','en-US','US','US:en'],
['site:arstechnica.com (AI OR science OR space OR chips)','en-US','US','US:en'],
['(uranium OR nuclear fuel OR enrichment OR Cameco OR Kazatomprom) markets','en-US','US','US:en'],
['(silver price OR silver demand OR solar silver) markets','en-US','US','US:en'],
['Nvidia earnings upcoming expectations AI capex','en-US','US','US:en'],
['S&P 500 market outlook earnings Federal Reserve','en-US','US','US:en'],
['Israel domestic politics coalition Knesset latest','en-US','US','US:en'],
['Iran Israel US geopolitics latest analysis','en-US','US','US:en'],
['important science breakthrough research latest','en-US','US','US:en'],
['surprising technology business science story latest','en-US','US','US:en']
];
const strip=(s="")=>s.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
const tag=(b,n)=>{let m=b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,"i"));return m?strip(m[1]):""};
const raw=(b,n)=>{let m=b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,"i"));return m?m[1]:""};
function source(t,u,s=""){let x=(t+" "+u+" "+s).toLowerCase();if(x.includes("reuters"))return"Reuters";if(x.includes("globes"))return"Globes";if(x.includes("ynet"))return"Ynet";if(x.includes("techcrunch"))return"TechCrunch";if(x.includes("spacenews"))return"SpaceNews";if(x.includes("ars technica"))return"Ars Technica";return s||"Other"}
async function rss([q,hl,gl,ceid]){let u=`https://news.google.com/rss/search?q=${encodeURIComponent(q+" when:7d")}&hl=${encodeURIComponent(hl)}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;let r=await fetch(u,{headers:{"User-Agent":"LearningOS/3.0"}});if(!r.ok)return[];let xml=await r.text();return[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,14).map(m=>{let b=m[1],title=tag(b,"title"),url=tag(b,"link"),published=tag(b,"pubDate"),desc=raw(b,"description"),s=tag(b,"source"),im=desc.match(/<img[^>]+src=["']([^"']+)["']/i);return{id:(title+"-"+s).slice(0,220),title,url,published,description:strip(desc),source:source(title,url,s),image:im?im[1]:""}})}
const norm=s=>String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u0590-\u05ff]+/g," ").trim();
function dedupe(xs){let seen=[];return xs.filter(x=>{let k=norm(x.title);if(!k)return false;let d=seen.some(y=>{let a=new Set(k.split(" ")),b=new Set(y.split(" ")),n=[...a].filter(z=>b.has(z)).length;return n/Math.max(a.size,b.size)>.68});if(d)return false;seen.push(k);return true})}
function score(x,p){let s=(x.title+" "+x.description).toLowerCase(),v=(p?.sources?.[x.source]||0);for(let[k,w]of Object.entries(p?.topics||{}))if(s.includes(k.toLowerCase().replace(" & "," ")))v+=w*.18;for(let[k,w]of Object.entries(p?.tags||{}))if(s.includes(k.toLowerCase()))v+=w*.15;for(let[k,w]of Object.entries(p?.entities||{}))if(s.includes(k.toLowerCase()))v+=w*.22;for(let w of(p?.watch||[]))if(s.includes(w.toLowerCase()))v+=3.5;return v}
const parse=s=>JSON.parse(s.trim().replace(/^```json\s*/i,"").replace(/```$/,"").trim());
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY missing"});
 try{
let p=req.body?.profile||{};
let requestedBatch=Number(req.body?.batchSize);
let batchSize=requestedBatch ? Math.max(18,Math.min(40,requestedBatch)) : 30;

let b=await Promise.all(Q.map(rss));
let c=dedupe(b.flat())
  .filter(x=>x.title&&x.url)
  .sort((a,b)=>score(b,p)-score(a,p))
  .slice(0,75);

let seen=new Set(p.seenIds||[]);
c=c.filter(x=>!seen.has(x.id));
  let prompt=`You edit a personal intelligence feed whose goal is to replace hours of LinkedIn, Ynet, Globes and short-video scrolling with something more useful and more interesting.

USER MODEL:
${JSON.stringify(p)}

CANDIDATES:
${JSON.stringify(c)}

Create a feed of exactly ${batchSize} items. Diversity is mandatory:
- 5-6 Investments/Markets items, prioritizing watch threads such as S&P 500, silver, uranium, Nvidia and SpaceX, plus earnings/catalysts when materially covered.
- 5-6 Geopolitics items, especially Israel/Iran/US/Middle East when important.
- 3-4 internal Israeli politics/economy/society items when meaningful.
- 4-5 AI/technology items.
- Maximum 3 robotics/autonomy items unless there is genuinely major news.
- 2-3 science/intellectual surprise items.
- 2 deliberate new-territory items outside established preferences.
No single company, country or theme may dominate. Strongly avoid material similar to seenTitles. If revisiting a story, explain exactly what changed.

This is not a school quiz app and not only an executive-summary app. A story may earn a place simply because it is important, surprising or fascinating.

For every item return:
id, topic (Investments, Markets, Geopolitics, Israel, Politics, AI, Robotics, ADAS, Science, Surprise), source, published, title, url, image,
what: 2-3 factual sentences,
why: why it deserves this user's attention,
lesson: one non-obvious explanatory model or reusable insight,
novelty: what is genuinely new/different,
format: vary among prediction,counterpoint,ranking,thesis,reflection,
prompt: a thought-provoking prompt requiring judgment, not trivia,
options: 2-4 plausible options for prediction/counterpoint/ranking, otherwise [],
reveal: a short useful response after a choice, never "correct/incorrect",
tags: 3-6 precise lowercase tags,
entities: key people, countries, companies, assets or technologies.

Do not invent facts beyond candidate metadata. Keep factual claims narrow when metadata is thin. Avoid generic management language.
Return ONLY valid JSON {"items":[...]}.`;
  let r=await ai.responses.create({model:MODEL,input:prompt}),d=parse(r.output_text),items=(d.items||[]).filter(x=>x.title&&x.what&&x.why&&x.lesson).slice(0,batchSize);
  res.status(200).json({items,candidateCount:c.length,model:MODEL})
 }catch(e){console.error(e);res.status(500).json({error:"feed_failed",detail:String(e?.message||e)})}
}
