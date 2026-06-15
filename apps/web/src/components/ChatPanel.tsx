import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MessageSquare,
  Send,
  Loader2,
  X,
  Sparkles,
  Terminal,
  Trash2,
  Maximize2,
  Minimize2,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: Array<{ tool: string; input: unknown }>;
  timestamp: Date;
}

interface ChatPanelProps {
  className?: string;
}

export function ChatPanel({ className }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = [
    "Show me error logs from the last hour",
    "What's the health status of all services?",
    "List recent incidents",
    "What's the blast radius if database goes down?",
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      const response = await api.post("/api/chat", {
        message: text.trim(),
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.response,
        toolsUsed: response.data.toolsUsed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error processing your request. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = async () => {
    try {
      await api.delete("/api/chat/history");
      setMessages([]);
      setShowSuggestions(true);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  };

  if (!isOpen) {
    return (
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl",
          "bg-foreground text-background",
          "flex items-center justify-center",
          "shadow-lg hover:shadow-xl transition-shadow",
          className
        )}
      >
        <MessageSquare className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-foreground rounded-full animate-pulse ring-2 ring-background" />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 100, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 100, scale: 0.9 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "fixed z-50 glass-strong rounded-3xl overflow-hidden flex flex-col",
        isExpanded
          ? "inset-4 sm:inset-8"
          : "bottom-6 right-6 w-[420px] h-[600px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-background" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AegisOps Assistant</h3>
            <p className="text-[10px] text-muted-foreground">AI-powered operations</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title={isExpanded ? "Minimize" : "Maximize"}
          >
            {isExpanded ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-xl hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && showSuggestions ? (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-2xl bg-foreground/5 flex items-center justify-center mx-auto mb-5">
                <Bot className="w-10 h-10 text-foreground/50" />
              </div>
              <h3 className="text-xl font-semibold mb-2">How can I help?</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                I can query logs, analyze code, check service health, create PRs, and much more.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1 font-medium">Try asking:</p>
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(suggestion)}
                  className="w-full text-left px-4 py-3 text-sm rounded-xl glass hover:bg-muted/50 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-foreground text-background"
                      : "glass"
                  )}
                >
                  {/* Tool indicators */}
                  {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {message.toolsUsed.map((tool, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-lg bg-foreground/10 font-medium"
                        >
                          <Terminal className="w-2.5 h-2.5" />
                          {tool.tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Message content with markdown rendering */}
                  <div className={cn(
                    "text-sm prose prose-sm dark:prose-invert max-w-none",
                    "prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
                    "prose-pre:bg-foreground/5 prose-pre:p-2 prose-pre:rounded-lg prose-pre:text-xs",
                    "prose-code:bg-foreground/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs",
                    "prose-a:text-foreground prose-a:underline",
                    message.role === "user" && "prose-invert"
                  )}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre: ({ children }) => (
                          <pre className="my-2 p-3 rounded-xl bg-foreground/5 overflow-x-auto text-xs font-mono">
                            {children}
                          </pre>
                        ),
                        code: ({ className, children, ...props }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-foreground/5 px-1.5 py-0.5 rounded-md text-xs" {...props}>
                              {children}
                            </code>
                          ) : (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        },
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-2">
                            <table className="min-w-full text-xs border-collapse">
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border border-border/50 px-2 py-1.5 bg-muted/50 text-left font-semibold">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="border border-border/50 px-2 py-1.5">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>

                  <p className="text-[10px] opacity-50 mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 glass rounded-2xl px-4 py-3"
          >
            <div className="w-8 h-8 rounded-xl bg-foreground/10 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <span className="text-sm text-muted-foreground">Thinking...</span>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/50 p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              rows={1}
              className={cn(
                "w-full resize-none rounded-xl glass-subtle px-4 py-3 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-foreground/10",
                "placeholder:text-muted-foreground/60",
                "min-h-[48px] max-h-[120px]"
              )}
              style={{
                height: "auto",
                minHeight: "48px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={cn(
              "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
              input.trim() && !isLoading
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </motion.div>
  );
}
