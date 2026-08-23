import OpenAI from "openai";
const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const MODEL=process.env.OPENAI_MODEL||"gpt-5.6-luna";
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"key missing"});
 const {item,mode,profile}=req.body||{};if(!item)return res.status(400).json({error:"item missing"});
 const t={deeper:"Go two levels deeper into mechanisms, history, tradeoffs and evidence. Explain what an intelligent reader is likely to miss.",counter:"Build the strongest serious counter-thesis and say what evidence would make it more plausible.",investment:"Explain investment relevance without individualized buy/sell advice. Separate first-order effect, second-order effect, beneficiaries, losers, catalysts and thesis-breakers.",context:"Give selective historical and geopolitical context needed to understand why this matters now."};
 try{let r=await ai.responses.create({model:MODEL,input:`You are a rigorous private intelligence tutor. ${t[mode]||t.deeper}
Story: ${JSON.stringify(item)}
Preference/watch model: ${JSON.stringify(profile||{})}
Do not flatter or repeat the card. Clearly distinguish reported facts from inference. Use short, sharp paragraphs.`});res.status(200).json({text:r.output_text})}catch(e){res.status(500).json({error:"ai_failed"})}
}