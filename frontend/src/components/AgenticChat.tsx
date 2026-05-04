"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, Sparkles, UserRound, Terminal, Download, ArrowRight } from "lucide-react";
import { exportFormats, getLeadPack, leadPacks, regions } from "../lib/pricing";
import { createBrowserSupabase, isSupabaseConfigured } from "../lib/supabase-client";
import { TargetingPreflight } from "../lib/types";
import { JobReportCard } from "./JobReportCard";

export type AgenticMessage = {
  id: string;
  role: "assistant" | "user";
  type: "text" | "config" | "terminal" | "report";
  content?: string;
  payload?: any;
  created_at: string;
};

type AgenticChatProps = {
  onJobCreated?: () => void;
};

const initialMessages: AgenticMessage[] = [
  {
    id: "initial",
    role: "assistant",
    type: "text",
    content: "Tell me what you sell, your website, who you want as clients, where you want to find them, and what makes a lead useful. I’ll ask follow-ups only if the search is still vague, then I’ll confirm the lead plan before we run it.",
    created_at: new Date().toISOString()
  }
];

function normalizeRegion(value: string) {
  const lower = value.trim().toLowerCase();
  if (["usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america", "american"].includes(lower)) {
    return "USA";
  }
  if (["uk", "u.k.", "united kingdom", "britain", "great britain", "england"].includes(lower)) {
    return "UK";
  }
  if (["eu", "europe", "european union"].includes(lower)) {
    return "Europe";
  }
  if (["international", "global", "worldwide"].includes(lower)) {
    return "International";
  }
  return value;
}

// Inline Terminal Component for active jobs
function InlineTerminal({ jobId }: { jobId: string }) {
  const [terminalLogs, setTerminalLogs] = useState<{message: string, source: string}[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!jobId) return;
    const sseUrl = `/api/jobs/${encodeURIComponent(jobId)}/logs`;
    let eventSource = new EventSource(sseUrl);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const message = typeof data.message === "string" ? data.message : JSON.stringify(data);
        setTerminalLogs(prev => [...prev, { message, source: data.source || "worker" }]);
      } catch {
        setTerminalLogs(prev => [...prev, { message: event.data, source: "worker" }]);
      }
    };
    
    return () => {
      eventSource.close();
    };
  }, [jobId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black overflow-hidden flex flex-col h-[300px]">
      <div className="flex items-center px-4 py-2 bg-[#1a1a1a] border-b border-[#333]">
        <div className="text-[#888] text-xs font-mono font-medium flex items-center gap-2">
          <Terminal size={12} />
          LIVE_LOGS: {jobId.slice(0, 8)}...
        </div>
        <div className="ml-auto flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
           <span className="text-[10px] text-green-400 font-mono">LIVE</span>
        </div>
      </div>
      <div ref={scrollRef} className="p-4 overflow-y-auto font-mono text-xs leading-relaxed flex-1 space-y-1 scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
        {terminalLogs.map((log, idx) => (
          <div key={idx} className="flex gap-4 group">
            <span className={`${log.source === "system" ? "text-amber-300/80 italic" : "text-[#ccc]"} whitespace-pre-wrap break-all`}>
              {log.message}
            </span>
          </div>
        ))}
        {terminalLogs.length === 0 && <div className="text-amber-500/80 animate-pulse py-2">Connecting to worker output...</div>}
        <div className="text-[#666] animate-pulse">_</div>
      </div>
    </div>
  );
}

export function AgenticChat({ onJobCreated }: AgenticChatProps) {
  const supabase = useMemo(() => (isSupabaseConfigured() ? createBrowserSupabase() : null), []);
  const [messages, setMessages] = useState<AgenticMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Load session from backend
  useEffect(() => {
    async function loadSession() {
      const { data: { session } } = await supabase!.auth.getSession();
      if (session?.access_token) {
        try {
          const res = await fetch("/api/chat", { headers: { Authorization: `Bearer ${session.access_token}` } });
          const json = await res.json();
          if (json.session && json.session.messages.length > 0) {
            setMessages(json.session.messages);
            setSessionLoaded(true);
            return;
          }
        } catch (e) {}
      }
      setMessages(initialMessages);
      setSessionLoaded(true);
    }
    if (supabase) loadSession();
    else { setMessages(initialMessages); setSessionLoaded(true); }
  }, [supabase]);

  // Sync session to backend
  useEffect(() => {
    async function syncSession() {
      if (!sessionLoaded || messages.length === 0 || messages === initialMessages) return;
      const { data: { session } } = await supabase!.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages })
        });
      }
    }
    syncSession();
  }, [messages, sessionLoaded, supabase]);

  // Subscribe to Job Events for Completion & Report
  useEffect(() => {
    if (!supabase || messages.length === 0) return;
    const runningJobs = messages.filter(m => m.type === "terminal").map(m => m.payload.jobId);
    if (runningJobs.length === 0) return;

    const channel = supabase.channel('chat-job-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_events' }, (payload) => {
        const evt = payload.new;
        if (runningJobs.includes(evt.job_id)) {
          if (evt.status === "report_ready" || evt.status === "delivered" || evt.status === "failed") {
            setMessages(current => {
              // Prevent duplicate report messages
              if (current.some(m => m.type === "report" && m.payload?.jobId === evt.job_id)) return current;
              
              if (evt.status === "report_ready" && evt.metadata?.report) {
                return [...current, {
                  id: crypto.randomUUID(), role: "assistant", type: "report",
                  payload: { jobId: evt.job_id, report: evt.metadata.report },
                  created_at: new Date().toISOString()
                }];
              } else if (evt.status === "delivered" || evt.status === "failed") {
                return [...current, {
                  id: crypto.randomUUID(), role: "assistant", type: "text",
                  content: `Job ${evt.status}. Check your dashboard or downloads for more info.`,
                  created_at: new Date().toISOString()
                }];
              }
              return current;
            });
          }
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, messages]);

  async function analyzeConversation(nextMessages: AgenticMessage[]) {
    setIsThinking(true);
    try {
      const chatOnly = nextMessages.filter(m => m.type === "text").map(m => ({ role: m.role, content: m.content }));
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region: "International", productCategory: "", buyerType: "", notes: "", conversation: chatOnly })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not analyze.");
      
      const brief = payload.preflight as TargetingPreflight;
      if (brief.needsMoreInfo) {
        const qList = brief.followUpQuestions?.length ? brief.followUpQuestions : ["Which countries?", "What to avoid?"];
        setMessages(cur => [...cur, {
          id: crypto.randomUUID(), role: "assistant", type: "text",
          content: "I need a bit more context before running it:\n\n" + qList.map((q, i) => `${i+1}. ${q}`).join("\n"),
          created_at: new Date().toISOString()
        }]);
      } else {
        setMessages(cur => [...cur, {
          id: crypto.randomUUID(), role: "assistant", type: "config",
          payload: { brief },
          created_at: new Date().toISOString()
        }]);
      }
    } catch (e: any) {
      setMessages(cur => [...cur, {
        id: crypto.randomUUID(), role: "assistant", type: "text",
        content: `I could not analyze that: ${e.message}`,
        created_at: new Date().toISOString()
      }]);
    } finally {
      setIsThinking(false);
    }
  }

  async function appendUserMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isThinking) return;

    const newMsg: AgenticMessage = { id: crypto.randomUUID(), role: "user", type: "text", content, created_at: new Date().toISOString() };
    const nextMessages = [...messages, newMsg];
    setMessages(nextMessages);
    setDraft("");
    await analyzeConversation(nextMessages);
  }

  return (
    <div className="flex flex-col h-full bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_40%),linear-gradient(180deg,#121212,#050505)] rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative">
      <div className="p-4 border-b border-white/10 bg-black/40 backdrop-blur flex items-center justify-between z-10">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300/80">Agentic Workflow</span>
          <h2 className="text-lg font-semibold tracking-tight text-vercel-text">AI Lead Strategist</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-vercel-muted font-medium">
          {sessionLoaded ? <span className="text-green-400/80 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Connected</span> : "Loading session..."}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 max-w-4xl mx-auto w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                <Bot size={16} />
              </div>
            )}
            
            <div className={`w-full ${msg.role === "user" ? "max-w-[75%]" : "max-w-full"}`}>
              {msg.type === "text" && (
                <div className={`whitespace-pre-wrap rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-lg ${msg.role === "user" ? "bg-white text-black float-right" : "border border-white/10 bg-black/40 text-vercel-text inline-block"}`}>
                  {msg.content}
                </div>
              )}

              {msg.type === "config" && msg.payload?.brief && (
                <ConfigWidget 
                  brief={msg.payload.brief} 
                  messages={messages} 
                  supabase={supabase} 
                  onJobStarted={(jobId) => {
                    setMessages(cur => [...cur, {
                      id: crypto.randomUUID(), role: "assistant", type: "terminal",
                      payload: { jobId }, created_at: new Date().toISOString()
                    }]);
                    onJobCreated?.();
                  }}
                />
              )}

              {msg.type === "terminal" && msg.payload?.jobId && (
                <div className="w-full">
                  <div className="inline-block rounded-2xl px-5 py-3.5 text-sm border border-white/10 bg-black/40 text-vercel-text">
                    Job started. Watching live worker execution...
                  </div>
                  <InlineTerminal jobId={msg.payload.jobId} />
                </div>
              )}

              {msg.type === "report" && msg.payload?.report && (
                <div className="w-full flex flex-col gap-3">
                  <JobReportCard report={msg.payload.report} />
                  <div className="flex flex-wrap gap-3 mt-2">
                     <a className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg px-4 py-2 text-sm font-medium transition-colors" href={`/api/jobs/${msg.payload.jobId}/exports?format=csv`} target="_blank">
                       <Download size={14} /> Download Leads (CSV)
                     </a>
                     <a className="inline-flex items-center gap-2 bg-white/5 text-vercel-text border border-white/10 hover:bg-white/10 rounded-lg px-4 py-2 text-sm font-medium transition-colors" href={`/api/jobs/${msg.payload.jobId}/exports?format=xlsx`} target="_blank">
                       <Download size={14} /> Download Audit (XLSX)
                     </a>
                  </div>
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white">
                <UserRound size={16} />
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="flex gap-3 max-w-4xl mx-auto w-full justify-start">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <Bot size={16} />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-5 py-3.5 text-sm text-cyan-100">
              <Loader2 size={15} className="animate-spin" />
              Analyzing request...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-black/50 border-t border-white/10 backdrop-blur z-10">
        <form className="max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row relative" onSubmit={appendUserMessage}>
          <textarea
            className="flex-1 resize-none rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3.5 text-sm leading-6 text-vercel-text outline-none transition focus:border-cyan-300/40 focus:ring-1 focus:ring-cyan-300/20 shadow-inner"
            value={draft}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); appendUserMessage(e as any); } }}
            placeholder="Type your response..."
            disabled={isThinking}
          />
          <button className="sm:absolute sm:right-2 sm:bottom-2 sm:top-2 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-cyan-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 shadow-md" type="submit" disabled={isThinking || !draft.trim()}>
            {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}

function ConfigWidget({ brief, messages, supabase, onJobStarted }: { brief: TargetingPreflight, messages: any[], supabase: any, onJobStarted: (id: string) => void }) {
  const [packId, setPackId] = useState("starter");
  const [market, setMarket] = useState(normalizeRegion(brief.targetMarkets?.[0] || "International"));
  const [minScore, setMinScore] = useState(brief.recommendedMinScore ? Math.max(35, Math.min(85, brief.recommendedMinScore)) : 55);
  const [allowNoEmail, setAllowNoEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  async function createJob() {
    setSubmitting(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { alert("Sign in first."); setSubmitting(false); return; }

    const userMessages = messages.filter((item) => item.role === "user");
    const productCategory = brief.offerSummary || brief.refinedIndustry || userMessages.at(-1)?.content || "AI lead search";
    const buyerType = brief.buyerTypes?.[0] || brief.idealCustomerProfile || "Ideal customers";

    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        packId, region: market, productCategory, buyerType,
        notes: messages.filter(m => m.type === "text").map((item) => `${item.role}: ${item.content}`).join("\n"),
        exportFormat: "all",
        preflight: brief,
        advanced: { allowNoEmail, allowWeakBuyerEvidence: true, minScore }
      })
    });

    const payload = await response.json();
    setSubmitting(false);
    if (!response.ok) { alert(payload.error || "Error"); return; }
    
    setHasStarted(true);
    if (payload.job?.id) onJobStarted(payload.job.id);
  }

  if (hasStarted) return <div className="text-sm text-vercel-muted italic">Job request sent.</div>;

  return (
    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-5 w-full space-y-5">
      <div className="flex items-center gap-2 text-emerald-300">
        <CheckCircle2 size={18} />
        <h3 className="font-semibold">Search Plan Ready</h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
           <dt className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Markets</dt>
           <dd className="text-sm text-vercel-text mt-1">{brief.targetMarkets?.join(", ") || market}</dd>
        </div>
        <div>
           <dt className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Search Terms</dt>
           <dd className="text-sm text-vercel-text mt-1">{brief.searchTerms?.slice(0, 3).join(" | ") || "N/A"}</dd>
        </div>
      </div>

      <div className="border-t border-white/10 pt-4 space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted block mb-2">Lead Package</label>
          <div className="grid grid-cols-3 gap-2">
            {leadPacks.map((item) => (
              <button key={item.id} type="button" onClick={() => setPackId(item.id)} className={`rounded-lg px-2 py-2 text-xs font-medium transition ${item.id === packId ? "bg-white text-black" : "bg-black/40 text-vercel-muted border border-white/10 hover:text-white"}`}>
                {item.leads} leads
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs text-vercel-text flex flex-col gap-1 w-full max-w-[200px]">
            <span className="text-[10px] uppercase tracking-[0.2em] text-vercel-muted">Min Quality Score: {minScore}</span>
            <input type="range" min="35" max="85" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full accent-cyan-300" />
          </label>
          <label className="flex items-center gap-2 text-xs text-vercel-text">
            <input type="checkbox" checked={allowNoEmail} onChange={(e) => setAllowNoEmail(e.target.checked)} className="rounded border-white/20" />
            Allow missing emails
          </label>
        </div>
      </div>

      <button onClick={createJob} disabled={submitting} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 text-black px-5 py-3 text-sm font-semibold transition hover:bg-emerald-300 disabled:opacity-50">
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        Run this search
      </button>
    </div>
  );
}
