import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield,
  Activity,
  Zap,
  GitBranch,
  MessageSquare,
  Brain,
  ArrowRight,
  Sparkles,
  Lock,
  RefreshCw,
  ChevronRight,
  Play,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Shield,
    title: "Sentinel Agent",
    description: "Security analysis with threat detection, IP reputation checks, and WAF rule generation.",
  },
  {
    icon: Activity,
    title: "Healer Agent",
    description: "Observability expert analyzing latency, errors, and traces to find root causes.",
  },
  {
    icon: Brain,
    title: "Correlator",
    description: "Synthesizes findings from all agents to determine incident type and severity.",
  },
  {
    icon: Zap,
    title: "Architect Agent",
    description: "Generates remediation plans with blast radius prediction and rollback strategies.",
  },
];

const capabilities = [
  {
    icon: GitBranch,
    title: "Auto-Remediation",
    description: "Generate code fixes and create PRs automatically",
  },
  {
    icon: MessageSquare,
    title: "Agentic ChatOps",
    description: "Natural language operations with 10+ tools",
  },
  {
    icon: Lock,
    title: "Human-in-the-Loop",
    description: "Approval gates with blast radius visualization",
  },
  {
    icon: RefreshCw,
    title: "Institutional Memory",
    description: "Learns from past incidents and rejections",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />
      <div className="fixed inset-0 bg-radial-bottom pointer-events-none" />

      {/* Floating orbs */}
      <div className="orb w-[800px] h-[800px] -top-60 -left-60" />
      <div className="orb-accent w-[600px] h-[600px] top-1/3 -right-40" />
      <div className="orb w-[500px] h-[500px] bottom-0 left-1/4" />

      {/* Noise texture */}
      <div className="fixed inset-0 noise pointer-events-none" />

      {/* Navigation */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="glass-strong rounded-2xl px-6 py-3 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
                <Shield className="w-5 h-5 text-background" />
              </div>
              <span className="text-xl font-semibold tracking-tight">AegisOps</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                How it Works
              </a>
              <a href="#agents" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Agents
              </a>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/login">
                <Button variant="ghost" size="sm" className="rounded-xl">
                  Sign In
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="rounded-xl">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-center max-w-4xl mx-auto"
          >
            {/* Badge */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-8"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Powered by Splunk MCP & Claude AI</span>
            </motion.div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Autonomous
              <br />
              <span className="text-muted-foreground">Incident Response</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Multi-agent AI platform that unifies Security, Observability, and Platform Operations
              into a single intelligent nexus. Resolve incidents 10x faster.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup">
                <Button size="lg" className="rounded-2xl px-8 h-14 text-base">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="rounded-2xl glass border-border/50 px-8 h-14 text-base group"
              >
                <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                Watch Demo
              </Button>
            </div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="mt-20 relative"
          >
            <div className="glass-strong rounded-3xl p-2 max-w-5xl mx-auto">
              <div className="rounded-2xl bg-background/80 overflow-hidden border border-border/50">
                {/* Mock Dashboard Preview */}
                <div className="p-6 space-y-6">
                  {/* Header bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-foreground/20" />
                      <div className="w-3 h-3 rounded-full bg-foreground/15" />
                      <div className="w-3 h-3 rounded-full bg-foreground/10" />
                    </div>
                    <div className="glass rounded-lg px-4 py-1.5 text-xs text-muted-foreground">
                      aegisops.io/dashboard
                    </div>
                    <div className="w-20" />
                  </div>

                  {/* Content grid */}
                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Agent cards */}
                    {[
                      { name: "Healer", status: "Analyzing latency spikes..." },
                      { name: "Sentinel", status: "Cross-referencing IPs..." },
                      { name: "Architect", status: "Generating remediation..." },
                    ].map((agent, i) => (
                      <motion.div
                        key={agent.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 + i * 0.15 }}
                        className="glass rounded-xl p-4"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <Circle className="w-2 h-2 fill-foreground animate-pulse" />
                          <span className="text-sm font-medium">{agent.name} Agent</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{agent.status}</p>
                        <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "75%" }}
                            transition={{ delay: 1 + i * 0.2, duration: 1.5 }}
                            className="h-full bg-foreground/30"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Bottom section */}
                  <div className="glass rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Correlation Complete</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-foreground/10 text-foreground/70">
                        MIXED: Infra + Security
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      DDoS-style credential stuffing exhausted database connection pool.
                      Remediation plan ready for approval.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating elements */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-8 top-1/4 glass rounded-2xl p-4 hidden lg:block"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Threat Blocked</p>
                  <p className="text-xs text-muted-foreground">12,453 requests</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-8 top-1/3 glass rounded-2xl p-4 hidden lg:block"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">MTTR Reduced</p>
                  <p className="text-xs text-muted-foreground">85% faster</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Specialized AI Agents
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Four autonomous agents working in parallel, each an expert in their domain
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6" id="agents">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="glass-float rounded-3xl p-8 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-7 h-7 text-background" />
                </div>
                <h3 className="text-2xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-32 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How AegisOps Works
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From incident to resolution in minutes, not hours
            </p>
          </motion.div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border hidden md:block" />

            {[
              {
                step: "01",
                title: "Incident Detected",
                description: "An incident is reported or automatically detected through monitoring integrations.",
                align: "left",
              },
              {
                step: "02",
                title: "Parallel Analysis",
                description: "Healer and Sentinel agents simultaneously investigate observability and security aspects.",
                align: "right",
              },
              {
                step: "03",
                title: "Correlation",
                description: "The Correlator synthesizes findings, determining incident type, severity, and root cause.",
                align: "left",
              },
              {
                step: "04",
                title: "Remediation Plan",
                description: "Architect generates a multi-step plan with blast radius prediction for each action.",
                align: "right",
              },
              {
                step: "05",
                title: "Human Approval",
                description: "Operators review and approve actions. Rejections are logged for continuous learning.",
                align: "left",
              },
              {
                step: "06",
                title: "Auto-Execution",
                description: "Approved actions are executed automatically with full audit trail in Splunk.",
                align: "right",
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: item.align === "left" ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`flex items-center gap-8 mb-12 ${item.align === "right" ? "md:flex-row-reverse" : ""}`}
              >
                <div className={`flex-1 ${item.align === "right" ? "md:text-right" : ""}`}>
                  <div className="glass rounded-2xl p-6 inline-block">
                    <div className="text-5xl font-bold text-muted-foreground/30 mb-2">{item.step}</div>
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <div className="w-4 h-4 rounded-full bg-foreground hidden md:block relative z-10 ring-4 ring-background" />
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="py-32 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-strong rounded-3xl p-12"
          >
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Beyond Traditional Incident Response
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                A complete platform for autonomous enterprise reliability
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              {capabilities.map((cap, index) => (
                <motion.div
                  key={cap.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center p-6"
                >
                  <div className="w-12 h-12 rounded-2xl bg-foreground/10 flex items-center justify-center mx-auto mb-4">
                    <cap.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground">{cap.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 relative">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass-strong rounded-3xl p-12 md:p-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Transform Your
              <br />
              Incident Response?
            </h2>
            <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
              Join leading enterprises using AI-powered autonomous operations
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup">
                <Button size="lg" className="rounded-2xl px-10 h-14 text-base">
                  Get Started Free
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="rounded-2xl glass border-border/50 px-10 h-14">
                  Sign In
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                <Shield className="w-4 h-4 text-background" />
              </div>
              <span className="font-semibold">AegisOps</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for Splunk Agentic Ops Hackathon 2026
            </p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
