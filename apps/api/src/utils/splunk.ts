/**
 * Splunk SPL Query Utilities
 * Prevents SPL injection attacks
 */

/**
 * Escape special SPL characters in a string
 */
export function escapeSPL(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\|/g, "\\|")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

/**
 * Validate a service name against whitelist pattern
 * Only allows alphanumeric, hyphens, underscores, and dots
 */
export function validateServiceName(name: string): boolean {
  if (!name || name.length > 100) return false;
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

/**
 * Build a safe SPL IN clause for service names
 * Validates and escapes all service names
 */
export function buildServiceQuery(services: string[]): string {
  const validServices = services.filter(validateServiceName);

  if (validServices.length === 0) {
    throw new Error("No valid service names provided");
  }

  const escaped = validServices
    .map((s) => `"${escapeSPL(s)}"`)
    .join(",");

  return `service IN (${escaped})`;
}

/**
 * Build a safe SPL query for IP addresses
 */
export function buildIPQuery(ips: string[]): string {
  const validIPs = ips.filter((ip) => {
    // Basic IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) return false;
    const parts = ip.split(".").map(Number);
    return parts.every((p) => p >= 0 && p <= 255);
  });

  if (validIPs.length === 0) {
    throw new Error("No valid IP addresses provided");
  }

  const escaped = validIPs.map((ip) => `"${ip}"`).join(",");
  return `src_ip IN (${escaped})`;
}

/**
 * Sanitize a search query string for safe use in SPL
 */
export function sanitizeSearchQuery(query: string): string {
  // Remove potentially dangerous SPL commands
  const dangerous = [
    /\|\s*delete/gi,
    /\|\s*outputlookup/gi,
    /\|\s*collect/gi,
    /\|\s*sendemail/gi,
    /\|\s*script/gi,
    /\|\s*run/gi,
  ];

  let sanitized = query;
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, "");
  }

  return escapeSPL(sanitized);
}
