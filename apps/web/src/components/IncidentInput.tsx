import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { BorderBeam } from "./magicui/border-beam";

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
      "Sudden latency spike and error surge on payment API. Massive burst of identical malformed JSON payloads detected."
    );
    setSelectedServices(["payment-gateway", "user-auth"]);
  };

  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden">
      {isFocused && <BorderBeam size={300} duration={10} />}

      <form onSubmit={handleSubmit} className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-xs sm:text-sm font-medium">New Incident</h2>
          <button
            type="button"
            onClick={loadDemo}
            className="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Zap className="w-3 h-3" />
            Demo
          </button>
        </div>

        {/* Description */}
        <div className="mb-3 sm:mb-4">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Describe the incident..."
            className={cn(
              "w-full bg-transparent border border-border rounded-md px-3 py-2 text-xs sm:text-sm",
              "placeholder:text-muted-foreground resize-none",
              "focus:outline-none focus:border-foreground transition-colors"
            )}
            rows={4}
            disabled={disabled}
          />
        </div>

        {/* Services */}
        <div className="mb-4 sm:mb-5">
          <label className="text-[10px] sm:text-xs text-muted-foreground mb-2 block">
            Affected Services
          </label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {SERVICES.map((service) => (
              <motion.button
                key={service}
                type="button"
                onClick={() => toggleService(service)}
                disabled={disabled}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-mono transition-all",
                  selectedServices.includes(service)
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {service}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={disabled || !description.trim() || selectedServices.length === 0}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            "px-4 sm:px-6 py-2.5 sm:py-3 rounded-md",
            "text-xs sm:text-sm font-medium",
            "bg-foreground text-background",
            "hover:bg-foreground/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          Analyze
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </form>
    </div>
  );
}
