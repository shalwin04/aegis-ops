/**
 * Blast Radius Prediction Utility
 *
 * Calculates the impact of actions on dependent services.
 * "If we restart X, Y and Z will be affected"
 */

import { db, ServiceDependency } from "../db/index.js";

export interface BlastRadiusResult {
  /** Services directly affected by the action */
  directlyAffected: string[];

  /** Services that depend on affected services (cascade) */
  cascadeAffected: ServiceImpact[];

  /** Total number of affected services */
  totalAffected: number;

  /** Risk score based on criticality (0-10) */
  riskScore: number;

  /** Human readable impact summary */
  impactSummary: string;

  /** Warnings about critical dependencies */
  warnings: string[];
}

export interface ServiceImpact {
  serviceName: string;
  affectedBy: string;
  dependencyType: string;
  criticality: string;
  cascadeLevel: number;
}

/**
 * Calculate blast radius for a set of affected services
 */
export function calculateBlastRadius(
  userId: string,
  affectedServices: string[],
  maxCascadeLevel = 3
): BlastRadiusResult {
  const directlyAffected = [...affectedServices];
  const cascadeAffected: ServiceImpact[] = [];
  const visited = new Set<string>(affectedServices);
  const warnings: string[] = [];

  // BFS to find cascade effects
  let currentLevel = affectedServices;
  let cascadeLevel = 1;

  while (currentLevel.length > 0 && cascadeLevel <= maxCascadeLevel) {
    const nextLevel: string[] = [];

    for (const service of currentLevel) {
      // Find services that depend ON this service
      const dependents = db.getDependentServices(userId, service);

      for (const dep of dependents) {
        if (!visited.has(dep.serviceName)) {
          visited.add(dep.serviceName);
          nextLevel.push(dep.serviceName);

          cascadeAffected.push({
            serviceName: dep.serviceName,
            affectedBy: service,
            dependencyType: dep.dependencyType,
            criticality: dep.criticality,
            cascadeLevel,
          });

          // Add warnings for critical dependencies
          if (dep.criticality === "critical") {
            warnings.push(
              `CRITICAL: ${dep.serviceName} has critical dependency on ${service}`
            );
          }
        }
      }
    }

    currentLevel = nextLevel;
    cascadeLevel++;
  }

  // Calculate risk score
  const riskScore = calculateRiskScore(directlyAffected, cascadeAffected);

  // Generate impact summary
  const impactSummary = generateImpactSummary(
    directlyAffected,
    cascadeAffected,
    riskScore
  );

  return {
    directlyAffected,
    cascadeAffected,
    totalAffected: visited.size,
    riskScore,
    impactSummary,
    warnings,
  };
}

/**
 * Calculate risk score based on affected services
 */
function calculateRiskScore(
  directlyAffected: string[],
  cascadeAffected: ServiceImpact[]
): number {
  let score = 0;

  // Base score from direct impact
  score += directlyAffected.length * 1.5;

  // Add cascade impact
  for (const impact of cascadeAffected) {
    const criticalityMultiplier =
      impact.criticality === "critical"
        ? 3
        : impact.criticality === "high"
          ? 2
          : impact.criticality === "medium"
            ? 1
            : 0.5;

    // Earlier cascade levels have higher impact
    const levelMultiplier = 1 / impact.cascadeLevel;

    score += criticalityMultiplier * levelMultiplier;
  }

  // Cap at 10
  return Math.min(Math.round(score * 10) / 10, 10);
}

/**
 * Generate human-readable impact summary
 */
function generateImpactSummary(
  directlyAffected: string[],
  cascadeAffected: ServiceImpact[],
  riskScore: number
): string {
  const parts: string[] = [];

  // Direct impact
  if (directlyAffected.length === 1) {
    parts.push(`Directly affects ${directlyAffected[0]}`);
  } else {
    parts.push(`Directly affects ${directlyAffected.length} services`);
  }

  // Cascade impact
  if (cascadeAffected.length > 0) {
    const criticalCount = cascadeAffected.filter(
      (c) => c.criticality === "critical"
    ).length;

    if (criticalCount > 0) {
      parts.push(
        `${cascadeAffected.length} dependent services will be impacted (${criticalCount} critical)`
      );
    } else {
      parts.push(`${cascadeAffected.length} dependent services will be impacted`);
    }
  }

  // Risk assessment
  if (riskScore >= 8) {
    parts.push("HIGH BLAST RADIUS - proceed with caution");
  } else if (riskScore >= 5) {
    parts.push("Moderate blast radius");
  } else {
    parts.push("Low blast radius");
  }

  return parts.join(". ") + ".";
}

/**
 * Get blast radius prediction formatted for display
 */
export function formatBlastRadiusForDisplay(result: BlastRadiusResult): string {
  const lines: string[] = [];

  lines.push(`=== BLAST RADIUS PREDICTION ===`);
  lines.push(`Risk Score: ${result.riskScore}/10`);
  lines.push(`Total Services Affected: ${result.totalAffected}`);
  lines.push("");

  lines.push(`Direct Impact: ${result.directlyAffected.join(", ")}`);

  if (result.cascadeAffected.length > 0) {
    lines.push("");
    lines.push("Cascade Effects:");
    for (const impact of result.cascadeAffected) {
      const indent = "  ".repeat(impact.cascadeLevel);
      lines.push(
        `${indent}→ ${impact.serviceName} (depends on ${impact.affectedBy}, ${impact.criticality})`
      );
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("⚠️ WARNINGS:");
    for (const warning of result.warnings) {
      lines.push(`  • ${warning}`);
    }
  }

  lines.push("");
  lines.push(result.impactSummary);

  return lines.join("\n");
}

/**
 * Infer service dependencies from incident history
 * This creates dependency mappings based on co-occurrence in incidents
 */
export function inferDependenciesFromHistory(
  userId: string,
  services: string[]
): void {
  // Get all incidents for this user
  const incidents = db.getIncidentsByUser(userId, 100);

  // Build co-occurrence map
  const coOccurrence = new Map<string, Map<string, number>>();

  for (const incident of incidents) {
    const affectedServices: string[] = JSON.parse(incident.affectedServices);

    // Count co-occurrences
    for (const s1 of affectedServices) {
      if (!coOccurrence.has(s1)) {
        coOccurrence.set(s1, new Map());
      }
      for (const s2 of affectedServices) {
        if (s1 !== s2) {
          const count = coOccurrence.get(s1)!.get(s2) || 0;
          coOccurrence.get(s1)!.set(s2, count + 1);
        }
      }
    }
  }

  // Create dependencies for pairs that co-occur frequently
  for (const [service, relations] of coOccurrence) {
    for (const [relatedService, count] of relations) {
      if (count >= 2) {
        // Appeared together at least twice
        const criticality =
          count >= 5 ? "high" : count >= 3 ? "medium" : "low";

        // Only save if this is one of the services we're analyzing
        if (services.includes(service) || services.includes(relatedService)) {
          db.saveServiceDependency({
            userId,
            serviceName: service,
            dependsOn: relatedService,
            dependencyType: "inferred",
            criticality,
          });
        }
      }
    }
  }
}
