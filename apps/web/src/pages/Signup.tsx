import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, User, AlertCircle, ArrowLeft, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      await signup(email, password, name);
      navigate("/connect-splunk");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    "Parallel multi-agent analysis",
    "Real-time incident correlation",
    "Blast radius prediction",
    "Agentic ChatOps assistant",
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />

      {/* Floating orbs */}
      <div className="orb w-[700px] h-[700px] -top-60 left-1/4" />
      <div className="orb-accent w-[500px] h-[500px] bottom-0 right-1/4" />

      {/* Noise texture */}
      <div className="fixed inset-0 noise pointer-events-none" />

      {/* Left side - Features (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-md"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center">
              <Shield className="w-7 h-7 text-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AegisOps</h1>
              <p className="text-sm text-muted-foreground">Autonomous Ops Platform</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold mb-4">
            Transform Your
            <br />
            <span className="text-muted-foreground">Incident Response</span>
          </h2>

          <p className="text-muted-foreground mb-8 text-lg">
            Join leading enterprises using AI-powered autonomous operations to resolve incidents 10x faster.
          </p>

          <div className="space-y-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span className="text-foreground">{feature}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right side - Signup form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Back to home */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center">
                <Shield className="w-6 h-6 text-background" />
              </div>
              <h1 className="text-3xl font-bold">AegisOps</h1>
            </div>
          </div>

          {/* Signup Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-3xl p-8"
          >
            <h2 className="text-2xl font-semibold mb-2">Create your account</h2>
            <p className="text-muted-foreground mb-6">Get started with a free trial</p>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-center gap-2 p-4 mb-6 text-sm text-destructive bg-destructive/10 rounded-2xl border border-destructive/20"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-glass w-full pl-12"
                    placeholder="Your name"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-glass w-full pl-12"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-glass w-full pl-12"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  At least 8 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-glass w-full pl-12"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base mt-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border/50 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-foreground font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </motion.div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-8">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </p>
        </motion.div>
      </div>
    </div>
  );
}
