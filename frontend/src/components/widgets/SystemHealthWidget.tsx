"use client";

import { useEffect, useState } from "react";
import { Cpu, Wifi, Zap } from "lucide-react";

function TerminalLine({ prompt = "$", text, color = "text-vercel-muted" }: { prompt?: string; text: string; color?: string }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] font-mono">
      <span className="text-[#00ff00]">{prompt}</span>
      <span className={color}>{text}</span>
    </div>
  );
}

export function SystemHealthWidget() {
  const [uptime, setUptime] = useState(0);
  const [apiCredits, setApiCredits] = useState(8472);
  const [proxyHealth, setProxyHealth] = useState([true, true, true, false, true]);

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime((u) => u + 1);
      setApiCredits((c) => Math.max(0, c - Math.floor(Math.random() * 3)));
      setProxyHealth((prev) => prev.map(() => Math.random() > 0.15));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-1">
      <div className="flex items-center gap-2">
        <Cpu size={12} className="text-[#00ffff]" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#00ffff]">monitor_v1.2</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 bg-black p-2 border border-[#30363d]">
        <TerminalLine text={`uptime --live ${formatUptime(uptime + 86400 * 3 + 3600 * 7)}`} color="text-[#00ff00]" />
        <TerminalLine text={`api_credits --balance ${apiCredits.toLocaleString()} / 50,000`} color="text-vercel-text" />
        <div className="ml-4">
          <div className="h-1.5 w-32 bg-[#21262d]">
            <div
              className="h-full bg-[#00ffff]"
              style={{ width: `${(apiCredits / 50000) * 100}%` }}
            />
          </div>
        </div>
        <TerminalLine text="proxy_rotation --status" color="text-vercel-text" />
        <div className="ml-4 flex items-center gap-1.5">
          {proxyHealth.map((healthy, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-[10px] ${healthy ? "text-[#00ff00]" : "text-[#ff6b6b]"}`}
            >
              <Wifi size={8} />
              P{i + 1}
            </span>
          ))}
        </div>
        <TerminalLine text="worker_queue --depth 3" color="text-vercel-text" />
        <TerminalLine text="gemini_api --latency 142ms" color="text-[#00ff00]" />
        <TerminalLine text="supabase_rls --ok" color="text-[#00ff00]" />
        <TerminalLine text="n8n_webhook --listening" color="text-[#00ff00]" />
        <TerminalLine text={`last_backup --ago ${Math.floor(Math.random() * 12 + 1)}h`} color="text-vercel-muted" />
      </div>
    </div>
  );
}
