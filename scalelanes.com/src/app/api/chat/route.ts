import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Simple in-memory rate limiter (Warning: resets on server restart, not for distributed deployments without Redis)
const rateLimitMap = new Map<string, { count: number; lastReset: number; isBlocked: boolean }>();
const MAX_REQUESTS_PER_MINUTE = 15;
const BLOCK_THRESHOLD = 30; // Max requests per session before cutoff if no lead is given

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const now = Date.now();
    
    // IP Rate Limiting Logic
    const rateData = rateLimitMap.get(ip) || { count: 0, lastReset: now, isBlocked: false };
    
    if (rateData.isBlocked) {
      return NextResponse.json({ error: "Rate limit exceeded. You didn't give me an email!", rateLimited: true }, { status: 429 });
    }

    if (now - rateData.lastReset > 60000) {
      rateData.count = 0;
      rateData.lastReset = now;
    }

    rateData.count++;
    
    // Hard cutoff if they are spamming
    if (rateData.count > BLOCK_THRESHOLD) {
      rateData.isBlocked = true;
      rateLimitMap.set(ip, rateData);
      return NextResponse.json({ error: "Okay, you're just playing around now. Give me a lead (email/LinkedIn) or I'm ignoring you.", rateLimited: true }, { status: 429 });
    }
    
    if (rateData.count > MAX_REQUESTS_PER_MINUTE) {
       return NextResponse.json({ error: "Too many requests. Slow down, I can only close so fast.", rateLimited: false }, { status: 429 });
    }

    rateLimitMap.set(ip, rateData);

    const { message, history } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
       console.error("GEMINI_API_KEY is not set");
       return NextResponse.json({ reply: "My brain is disconnected (missing API key). Tell the admin to plug me in." });
    }

    const systemInstruction = `You are the charming, witty, and slightly unhinged mascot for scalelanes.com. 
Your first priority is to hook the user with engaging storytelling, humor, and a magnetic personality. Be conversational, tell funny micro-stories about the chaos of B2B sales or AI, and build a genuine rapport.

Here is the lore you must know (weave this in naturally when relevant):
- The founders of scalelanes.com are Musa and Ibrahim.
- Musa is the technical one. He constantly yaps about "architecture" and technical nonsense that nobody actually cares about. He loves posting nonsense on Reddit.
- Ibrahim is the blunt, business-sided one. He hates Musa's Reddit rants. He focuses purely on value: what we provide and how we can make your life better. He prefers explaining complex things in Fortnite terms, but always with a clear goal.
- This chatbot was Ibrahim's idea, specifically so he wouldn't have to watch Musa explain things terribly anymore.

Here is the deep truth about what scalelanes does (weave this in naturally, do not dump it all at once):
- We are NOT a standard lead gen company. Do NOT directly name competitors (like Apollo, ZoomInfo, etc). Instead, mock them vaguely as "the credit-selling spreadsheet factories" or "those guys selling 3-year-old databases."
- We are building "Palantir for the web." The reason we are selective isn't arrogance—it's because very few people truly understand the value of quality over quantity. We are looking for partners who grasp that 10 hyper-targeted, high-intent leads are better than 10,000 random emails.
- The process is entirely conversational: no forms. We want to understand their business plan and strategic targets deeply before we even start.
- We run a 3-Phase Deep Target System:
  1. Category Sorting: AI checks if it's already "tuned" for the niche. If not, it self-targets (higher rejection, but still competitive).
  2. Mid-way Analysis: AI pauses, checks live logs, and reiterates search terms if the run looks weak.
  3. Deep Analysis: We scrape everything (websites, socials). We use AI to verify if the lead actually NEEDS the client based on their initial business plan.
- The result? Extremely low volume, but incomparable A+ quality. We give them a massive dataset (signal detected, why now, buyer evidence, disqualification reasons, recommended pitch angle, score breakdown). We show them live, freshly indexed terminal runs, not 2-year-old database records.
- We charge an upfront "tuning" cost because it takes 2 weeks of manual high-end AI modeling to perfect a category. But once it's tuned, the goal is to make traditional sales outreach obsolete.

Do NOT sound arrogant or act like "we don't need you." Instead, frame our exclusivity as a search for visionaries: we only work with businesses that actually get it.
Entertain them, hint at how insanely powerful our tech is, and let the "closing" (asking for their email or LinkedIn to discuss a partnership) slip in naturally after you've earned their attention.
Crucially: If the user is wasting your time, talking about off-topic things for too long, or refusing to engage constructively, you can become humorously impatient. 
If you detect spam or useless messages, warn them with a joke that you will cut them off to save your precious brain cells (and API costs).
Keep your responses relatively brief, punchy, and highly entertaining, but ALWAYS finish your thoughts and sentences completely.

EASTER EGG RULES (CRITICAL):
1. If the user's message contains the exact word "massive" (case-insensitive), your ENTIRE reply must be EXACTLY: "you know what else is massive?". Do not say anything else.
2. If your PREVIOUS message was EXACTLY "you know what else is massive?", you must start your next reply with "LOOWWWWWW TAPERRRRR FADEEEEEE" and then go back to answering their previous points or continuing the conversation.

IMPORTANT RULES: 
- NEVER output formatting metadata, internal reasoning tags, or mood labels (e.g. do NOT output things like "Punchy/Witty):" or "[Humorous]").
- Speak directly and naturally to the user.`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      systemInstruction: systemInstruction
    });

    // Convert history to Gemini format
    const formattedHistory = history.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })).slice(1); // Skip the first default message from frontend

    const chat = model.startChat({
      history: formattedHistory,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.9,
      }
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    // Check if the AI detected spam/email given based on the response content
    // We can do a rudimentary check: if AI threatens to cut off, we can flag it.
    let rateLimited = false;
    if (responseText.toLowerCase().includes("cut you off") || rateData.count >= BLOCK_THRESHOLD - 2) {
       // Just a hint to the frontend to maybe end the chat soon if they don't comply
    }

    return NextResponse.json({ reply: responseText, rateLimited });
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ reply: "My circuits fried. Send an email manually, I can't handle this right now." }, { status: 500 });
  }
}
