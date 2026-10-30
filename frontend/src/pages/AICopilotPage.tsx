import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { Dataset, AIMessage } from '../types';
import {
  Sparkles,
  Send,
  Database,
  Bot,
  User,
  Wrench,
  CheckCircle2,
  Table,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';

export const AICopilotPage: React.FC = () => {
  const { activeProject } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; content: string; tools_called?: any[]; execution_result?: any }[]
  >([
    {
      role: 'assistant',
      content:
        'Hello! I am MarketMine AI Copilot. I analyze your data using deterministic mathematical tools, verified SQL queries, and machine learning models. I never fabricate statistics. How can I assist you with your project today?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeProject) return;
    api.datasets.listByProject(activeProject.id).then((list) => {
      setDatasets(list);
      if (list.length > 0) setSelectedDatasetId(list[0].id);
    });
  }, [activeProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const q = textToSend || input;
    if (!q.trim() || !activeProject) return;
    setInput('');

    // Add user message to UI immediately
    const newMsgList = [...messages, { role: 'user' as const, content: q }];
    setMessages(newMsgList);
    setLoading(true);

    try {
      const res = await api.ai.chat({
        project_id: activeProject.id,
        dataset_id: selectedDatasetId || undefined,
        message: q,
      });

      setMessages([
        ...newMsgList,
        {
          role: 'assistant',
          content: res.response || res.content,
          tools_called: res.tools_called,
          execution_result: res.execution_result,
        },
      ]);
    } catch (err: any) {
      setMessages([
        ...newMsgList,
        {
          role: 'assistant',
          content: `Error: ${err.response?.data?.detail || 'Unable to process query at this time.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = [
    'Summarize this dataset and list column statistics',
    'What are the top products by revenue?',
    'Which columns have missing or null values?',
    'Find items frequently purchased together (Apriori)',
    'Are there any unusual transaction outliers or anomalies?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] max-w-5xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            AI Copilot — Chat With Your Data
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Tool-calling AI with verified deterministic results from your database.
          </p>
        </div>

        {/* Dataset context selector */}
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="">(All project tables)</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chat scroll body */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-2xl bg-slate-900/40 border border-slate-800">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-3 text-xs leading-relaxed ${
              m.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {m.role === 'assistant' && (
              <div className="h-7 w-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-2xl rounded-2xl p-4 shadow-md ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-none space-y-3'
              }`}
            >
              {/* Tool Execution Badge */}
              {m.tools_called && m.tools_called.length > 0 && (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700 text-[11px] text-cyan-300 font-mono">
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Executed Tool: {m.tools_called.join(', ')}</span>
                </div>
              )}

              {/* Message text */}
              <div className="whitespace-pre-wrap">{m.content}</div>

              {/* Verified results table if present */}
              {m.execution_result && Array.isArray(m.execution_result) && m.execution_result.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-900/60 font-mono text-[11px] mt-2">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px]">
                      <tr>
                        {Object.keys(m.execution_result[0]).map((k) => (
                          <th key={k} className="px-3 py-1.5">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {m.execution_result.slice(0, 10).map((r, rI) => (
                        <tr key={rI} className="hover:bg-slate-800/40">
                          {Object.values(r).map((v: any, vI) => (
                            <td key={vI} className="px-3 py-1 text-slate-300">
                              {String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {m.role === 'user' && (
              <div className="h-7 w-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 text-xs justify-start items-center">
            <div className="h-7 w-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3 px-4 text-slate-400 flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>Analyzing schema & executing backend analytical tools...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Suggestions */}
      <div className="flex flex-wrap gap-1.5 px-1">
        {sampleQuestions.map((sq, i) => (
          <button
            key={i}
            onClick={() => handleSend(sq)}
            className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-indigo-300 border border-slate-700/60 transition flex items-center gap-1"
          >
            <Lightbulb className="w-3 h-3 text-indigo-400" />
            {sq}
          </button>
        ))}
      </div>

      {/* Input box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your data (e.g. 'Show top 5 products by revenue')..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 shadow-inner"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
