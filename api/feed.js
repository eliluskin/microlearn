import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const QUERIES = [
  'site:reuters.com (humanoid OR robotics OR "autonomous driving" OR AI) when:7d',
  'site:en.globes.co.il (AI OR robotics OR Mobileye OR autonomy OR China OR India) when:14d',
  'site:ynetnews.com (AI OR robotics OR autonomous OR technology) when:14d',
  'site:techcrunch.com (AI OR robotics OR agents OR autonomous) when:7d',
  '(humanoid robotics OR embodied AI OR autonomous driving OR ADAS OR AI agents) China India when:7d'
];

function strip(s=""){return s.replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim()}
function tag(block,name){const m=block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,"i"));return m?strip(m[1]):""}
function sourceFrom(title,url){const s=(title+" "+url).toLowerCase();if(s.includes("reuters"))return"Reuters";if(s.includes("globes"))return"Globes";if(s.includes("ynet"))return"Ynet";if(s.includes("techcrunch"))return"TechCrunch";return"Other"}
async function rss(q){
 const u="https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-US&gl=US&ceid=US:en";
 const r=await fetch(u,{headers:{"User-Agent":"LearningOS/2.0"}});if(!r.ok)return[];
 const xml=await r.text();return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,12).map((m,i)=>{
   const b=m[1],title=tag(b,"title"),url=tag(b,"link"),published=tag(b,"pubDate"),description=tag(b,"description");
   return {id:(title+"-"+i).slice(0,180),title,url,published,description,source:sourceFrom(title,url)}
 })
}
function dedupe(xs){const seen=new Set();return xs.filter(x=>{let k=x.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,80);if(!k||seen.has(k))return false;seen.add(k);return true})}
function affinity(x,p){
 let t=(x.title+" "+x.description).toLowerCase(),score=(p?.sources?.[x.source]||0);
 for(const [k,v] of Object.entries(p?.topics||{})) if(t.includes(k.toLowerCase().replace(" & "," ")))score+=v*.35;
 for(const [k,v] of Object.entries(p?.tags||{})) if(t.includes(k.toLowerCase()))score+=v*.25;
 return score;
}
function parseJSON(s){s=s.trim().replace(/^```json\s*/i,"").replace(/```$/,"").trim();return JSON.parse(s)}

export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY missing"});
 try{
   const profile=req.body?.profile||{};
   const batches=await Promise.all(QUERIES.map(rss));
   let candidates=dedupe(batches.flat()).sort((a,b)=>affinity(b,profile)-affinity(a,profile)).slice(0,28);
   if(!candidates.length)return res.status(502).json({error:"No news candidates"});
   const prompt=`You are the intelligence editor for one senior technology executive.
Turn current news into a highly selective learning feed, not a news summary.

The user's learned preference model is:
${JSON.stringify(profile)}

Candidate stories:
${JSON.stringify(candidates)}

Select exactly 6 stories with the highest combination of:
1. direct relevance to humanoid robotics, actuation, embodied AI, ADAS/autonomy, China/India technology, AI agents, leadership, strategy, industrial policy;
2. novelty and material importance;
3. learning value;
4. source quality and freshness;
5. the user's preferences.
Keep 1 exploratory story outside the strongest preferences when it has high intellectual value.

For each selected story return:
id, type:"news", topic (one of Robotics, ADAS, AI, Strategy, India & China, Leadership, Geopolitics, Finance), source, published (ISO date if possible), title (clean title), url,
what (2 concise sentences, factual),
why (2 concise sentences explicitly explaining why THIS user should care),
lesson (2-3 sentences extracting a reusable non-obvious concept),
question (a difficult applied decision question),
choices (3 plausible options),
correct (0-based index),
explain (1-2 concise sentences),
tags (3-5 lowercase tags).

Do not invent facts beyond candidate metadata. If metadata is insufficient, frame the lesson around the reported development without adding specifics. Avoid generic management platitudes. Make the questions hard enough for an experienced executive.

Return ONLY valid JSON in this shape: {"items":[...]}`
   const response=await client.responses.create({model:MODEL,input:prompt});
   const parsed=parseJSON(response.output_text);
   const valid=(parsed.items||[]).filter(x=>x.title&&x.url&&x.what&&x.why&&x.lesson).slice(0,6);
   return res.status(200).json({items:valid,candidateCount:candidates.length,model:MODEL});
 }catch(e){console.error(e);return res.status(500).json({error:"feed_failed",detail:String(e?.message||e)})}
}
