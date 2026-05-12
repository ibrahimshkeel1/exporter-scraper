"use client";

import { useState, useEffect, useRef } from "react";
import { Files, Search, GitBranch, Settings, Send, Bot, User, Play, X, Code2, Terminal } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Systems online. Neural Humor Engine calibrated to 87% sarcasm.\n\nWelcome to scalelanes.com! I'm the resident AI. I usually spend my time scraping the internet and generating highly personalized B2B outreach campaigns, but they let me out of the server rack to chat with you. What's up?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New states for layout animations
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState("closer_bot.ts");
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // Boot sequence animation
    const lines = [
      "Initialize AI Core...",
      "Loading Sales Persona: 'Aggressive Closer'...",
      "Connecting to Neural Humor Engine...",
      "Bypassing standard pleasantries...",
      "Locating leads...",
      "Target acquired. Launching interface..."
    ];
    
    let currentLine = 0;
    const interval = setInterval(() => {
      if (currentLine < lines.length) {
        setBootLines(prev => [...prev, lines[currentLine]]);
        currentLine++;
      } else {
        clearInterval(interval);
        setTimeout(() => setBooting(false), 800);
      }
    }, 400);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, bootLines, activeTab]);

  // Slide in panel after first interaction or 10 seconds
  useEffect(() => {
    if (!booting && !showPanel) {
      const timer = setTimeout(() => setShowPanel(true), 10000);
      if (hasInteracted) {
         clearTimeout(timer);
         setShowPanel(true);
      }
      return () => clearTimeout(timer);
    }
  }, [booting, hasInteracted, showPanel]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || rateLimited) return;

    setHasInteracted(true);
    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: messages }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setRateLimited(true);
        setMessages(prev => [...prev, { role: "assistant", content: data.error || "Whoa there! You're talking a lot but not giving me any contact info. I'm cutting you off! Drop an email or LinkedIn to continue." }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        if (data.rateLimited) setRateLimited(true);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", content: "System error! Even I can't close this right now. Try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (booting) {
    return (
      <div className="h-screen w-screen bg-vscode-bg text-vscode-text font-mono p-8 flex flex-col">
        {bootLines.map((line, i) => (
          <div key={i} className="mb-2">
            <span className="text-vscode-comment">{'>'}</span> {line}
          </div>
        ))}
        <span className="animate-pulse text-vscode-accent">_</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-vscode-bg flex font-sans text-vscode-text overflow-hidden">
      
      {/* Activity Bar - Slide in */}
      <div className={`bg-vscode-activity flex flex-col items-center py-4 space-y-6 shrink-0 z-20 transition-all duration-700 ease-in-out ${showPanel ? 'w-12 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
        {showPanel && (
           <>
            <Files className="w-6 h-6 text-vscode-text opacity-100 cursor-pointer" />
            <Search className="w-6 h-6 text-vscode-text opacity-40 cursor-pointer hover:opacity-100" />
            <GitBranch className="w-6 h-6 text-vscode-text opacity-40 cursor-pointer hover:opacity-100" />
            <Play className="w-6 h-6 text-vscode-text opacity-40 cursor-pointer hover:opacity-100" />
            <div className="flex-grow" />
            <Settings className="w-6 h-6 text-vscode-text opacity-40 cursor-pointer hover:opacity-100" />
           </>
        )}
      </div>

      {/* Sidebar (Explorer) - hidden on mobile, slides in */}
      <div className={`bg-vscode-sidebar border-r border-vscode-border flex flex-col shrink-0 z-10 transition-all duration-700 ease-in-out ${showPanel ? 'w-64 md:flex hidden opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
        <div className="px-4 py-2 text-xs uppercase tracking-wider text-vscode-text opacity-70 whitespace-nowrap">
          Explorer
        </div>
        <div className="px-2 mt-2 space-y-1 overflow-hidden">
          <div 
             onClick={() => setActiveTab('closer_bot.ts')}
             className={`flex items-center space-x-2 px-2 py-1 cursor-pointer text-sm whitespace-nowrap ${activeTab === 'closer_bot.ts' ? 'bg-vscode-activity/50' : 'hover:bg-vscode-activity/30 opacity-70'}`}
          >
            <Code2 className="w-4 h-4 text-vscode-accent shrink-0" />
            <span>closer_bot.ts</span>
          </div>
          <div 
             onClick={() => setActiveTab('system_logs.md')}
             className={`flex items-center space-x-2 px-2 py-1 cursor-pointer text-sm whitespace-nowrap ${activeTab === 'system_logs.md' ? 'bg-vscode-activity/50' : 'hover:bg-vscode-activity/30 opacity-70'}`}
          >
            <Terminal className="w-4 h-4 text-[#e34c26] shrink-0" />
            <span>system_logs.md</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Tabs - Slides down */}
        <div className={`bg-vscode-bg flex items-center shrink-0 border-b border-vscode-border transition-all duration-700 ${showPanel ? 'h-9 opacity-100' : 'h-0 opacity-0 overflow-hidden'}`}>
          <div 
             onClick={() => setActiveTab('closer_bot.ts')}
             className={`flex items-center h-full px-4 border-r border-vscode-border cursor-pointer min-w-[120px] ${activeTab === 'closer_bot.ts' ? 'bg-vscode-activity/30 border-t-2 border-t-vscode-accent' : 'hover:bg-vscode-activity/10 opacity-60 border-t-2 border-t-transparent'}`}
          >
            <Code2 className="w-4 h-4 text-vscode-accent mr-2 shrink-0" />
            <span className="text-sm whitespace-nowrap">closer_bot.ts</span>
            {activeTab === 'closer_bot.ts' && <X className="w-4 h-4 ml-2 opacity-50 hover:opacity-100 shrink-0" />}
          </div>
          <div 
             onClick={() => setActiveTab('system_logs.md')}
             className={`flex items-center h-full px-4 border-r border-vscode-border cursor-pointer min-w-[120px] ${activeTab === 'system_logs.md' ? 'bg-vscode-activity/30 border-t-2 border-t-[#e34c26]' : 'hover:bg-vscode-activity/10 opacity-60 border-t-2 border-t-transparent'}`}
          >
            <Terminal className="w-4 h-4 text-[#e34c26] mr-2 shrink-0" />
            <span className="text-sm whitespace-nowrap">system_logs.md</span>
            {activeTab === 'system_logs.md' && <X className="w-4 h-4 ml-2 opacity-50 hover:opacity-100 shrink-0" />}
          </div>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
           
           {/* Chat Tab */}
           {activeTab === 'closer_bot.ts' && (
              <div className="flex-1 flex flex-col h-full">
                {/* Scrollable Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 font-mono text-sm sm:text-base scroll-smooth">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex items-start max-w-[90%] md:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-vscode-accent ml-3' : 'bg-vscode-comment mr-3'}`}>
                          {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
                        </div>
                        <div className={`p-3 rounded-md ${msg.role === 'user' ? 'bg-vscode-accent/20 border border-vscode-accent/30 text-vscode-text' : 'bg-vscode-activity border border-vscode-border text-vscode-text whitespace-pre-wrap'}`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex items-start max-w-[85%]">
                        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-vscode-comment mr-3">
                          <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div className="p-3 rounded-md bg-vscode-activity border border-vscode-border text-vscode-comment animate-pulse">
                          Typing furiously...
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} className="h-4" />
                </div>

                {/* Input Area - Now a flex sibling, no more absolute positioning overflow */}
                <div className="p-4 bg-vscode-bg/95 backdrop-blur-sm border-t border-vscode-border shrink-0 w-full">
                  {rateLimited ? (
                    <div className="p-3 text-center text-[#f48771] border border-[#f48771]/30 bg-[#f48771]/10 rounded-md text-sm font-mono">
                      Chat disabled. You talked too much without converting! Reload to try again (and give me an email this time).
                    </div>
                  ) : (
                    <form onSubmit={sendMessage} className="flex gap-2 w-full max-w-full">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 bg-vscode-activity border border-vscode-border rounded-md px-4 py-3 font-mono text-sm focus:outline-none focus:border-vscode-accent text-vscode-text placeholder-vscode-text/40 min-w-0"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="bg-vscode-accent hover:bg-vscode-accent/80 text-white px-4 py-3 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center shrink-0"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </form>
                  )}
                </div>
              </div>
           )}

           {/* System Logs Tab */}
           {activeTab === 'system_logs.md' && (
              <div className="flex-1 overflow-y-auto p-6 font-mono text-sm text-vscode-text space-y-4">
                 <h1 className="text-xl font-bold text-vscode-accent"># System Architecture Logs</h1>
                 <p className="opacity-80">This tab was revealed because you engaged the AI. Here is a glimpse of the internal Palantir web system.</p>
                 <div className="bg-vscode-activity/50 p-4 rounded border border-vscode-border">
                    <pre className="text-[#ce9178] whitespace-pre-wrap">
{`[SYSTEM] Phase 1 Initialized: Category Sorting...
[OK] Niche recognized. Loading pre-tuned high-end AI models.
[SYSTEM] Phase 2: Mid-way Analysis...
[OK] Signal detected. Win-rate optimal. Re-iterating search bounds.
[SYSTEM] Phase 3: Deep Analysis...
[WAIT] Scraping target websites and social footprint.
[WARN] 85% of standard leads rejected due to low buyer evidence.
[SUCCESS] Final A+ list compiled and freshly indexed.`}
                    </pre>
                 </div>
              </div>
           )}

        </div>
      </div>
    </div>
  );
}
