import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface IncidentInputProps {
  onSubmit: (data: { description: string; affectedServices: string[] }) => void;
  disabled?: boolean;
}

const SERVICES = [
  "payment-gateway",
  "user-auth",
  "inventory-api",
  "checkout",
  "notifications",
  "search",
  "api-gateway",
  "database",
];

export function IncidentInput({ onSubmit, disabled }: IncidentInputProps) {
  const [description, setDescription] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim() && selectedServices.length > 0) {
      onSubmit({ description, affectedServices: selectedServices });
      setDescription("");
      setSelectedServices([]);
    }
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  };

  const loadDemo = () => {
    setDescription(
      "Sudden latency spike and error surge on payment API. Massive burst of identical malformed JSON payloads detected from suspicious IPs."
    );
    setSelectedServices(["payment-gateway", "user-auth", "api-gateway"]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "glass-strong rounded-2xl overflow-hidden transition-all duration-300 h-full flex flex-col",
        isFocused && "ring-2 ring-foreground/10"
      )}
    >
      <form onSubmit={handleSubmit} className="p-4 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold">New Incident</h2>
              <p className="text-[9px] text-muted-foreground">Report an issue</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadDemo}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Zap className="w-3 h-3" />
            Demo
          </button>
        </div>

        {/* Description */}
        <div className="mb-3 flex-1 min-h-0 flex flex-col">
          <label className="text-[10px] font-medium text-muted-foreground mb-1 block flex-shrink-0">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Describe the incident..."
            className={cn(
              "flex-1 min-h-[80px] w-full glass-subtle rounded-lg px-3 py-2 text-xs",
              "placeholder:text-muted-foreground/60 resize-none",
              "focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all"
            )}
            disabled={disabled}
          />
        </div>

        {/* Services */}
        <div className="mb-3 flex-shrink-0">
          <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">
            Affected Services
          </label>
          <div className="flex flex-wrap gap-1">
            {SERVICES.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => toggleService(service)}
                disabled={disabled}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                  selectedServices.includes(service)
                    ? "bg-foreground text-background"
                    : "glass hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {service.split("-")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={disabled || !description.trim() || selectedServices.length === 0}
          className={cn(
            "w-full flex items-center justify-center gap-2 flex-shrink-0",
            "px-4 py-2.5 rounded-lg",
            "text-xs font-medium",
            "bg-foreground text-background",
            "hover:bg-foreground/90 transition-all",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          Analyze
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>
    </motion.div>
  );
}
