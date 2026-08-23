import OpenAI from "openai";
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
const MODEL=process.env.OPENAI_MODEL||"gpt-5-mini";
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY missing"});
 const {item,mode,profile}=req.body||{};if(!item)return res.status(400).json({error:"item missing"});
 const instructions={
  deeper:"Teach the underlying technical or strategic concept at a sophisticated level. Use 3-5 short paragraphs. Focus on mechanisms, tradeoffs, and what evidence matters.",
  challenge:"Challenge the user's likely interpretation. Give the strongest counter-thesis, what evidence would support it, and one uncomfortable question the user should answer before acting.",
  implication:"Translate this story into concrete implications for a senior executive working across humanoid robotics, autonomy/ADAS, China and India. Give 3 prioritized implications and one action or question for this week."
 };
 const prompt=`You are a rigorous private tutor for a senior technology executive.
Mode: ${mode}
Task: ${instructions[mode]||instructions.deeper}
Story/lesson object: ${JSON.stringify(item)}
Preference model: ${JSON.stringify(profile||{})}
Do not flatter. Do not repeat the article summary. Be concise, specific, technically literate, and distinguish facts from inference.`;
 try{const r=await client.responses.create({model:MODEL,input:prompt});return res.status(200).json({text:r.output_text})}
 catch(e){return res.status(500).json({error:"ai_failed"})}
}
