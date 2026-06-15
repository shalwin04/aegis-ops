import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, AlertCircle, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-6">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />

      {/* Floating orbs */}
      <div className="orb w-[600px] h-[600px] -top-40 -right-40" />
      <div className="orb-accent w-[500px] h-[500px] bottom-0 -left-40" />

      {/* Noise texture */}
      <div className="fixed inset-0 noise pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Back to home */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center justify-center gap-3 mb-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-foreground flex items-center justify-center">
              <Shield className="w-6 h-6 text-background" />
            </div>
            <h1 className="text-3xl font-bold">AegisOps</h1>
          </motion.div>
          <p className="text-muted-foreground">
            Sign in to access your dashboard
          </p>
        </div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-strong rounded-3xl p-8"
        >
          <h2 className="text-2xl font-semibold mb-6">Welcome back</h2>

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

          <form onSubmit={handleSubmit} className="space-y-5">
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
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-border/50 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="text-foreground font-medium hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </div>
  );
}
