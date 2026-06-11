import type { AegisState } from "@aegis/shared";
import type { AegisStateWithUser } from "../graph/state.js";

/**
 * In-memory incident store for active incidents
 * Works alongside database for persistence
 */
class IncidentStore {
  private incidents: Map<string, AegisStateWithUser> = new Map();

  get(incidentId: string): AegisStateWithUser | undefined {
    return this.incidents.get(incidentId);
  }

  set(incidentId: string, state: AegisStateWithUser): void {
    this.incidents.set(incidentId, state);
  }

  update(
    incidentId: string,
    updater: (state: AegisStateWithUser) => AegisStateWithUser
  ): AegisStateWithUser | undefined {
    const current = this.incidents.get(incidentId);
    if (!current) return undefined;

    const updated = updater(current);
    this.incidents.set(incidentId, updated);
    return updated;
  }

  delete(incidentId: string): boolean {
    return this.incidents.delete(incidentId);
  }

  getAll(): AegisStateWithUser[] {
    return Array.from(this.incidents.values());
  }

  getAllForUser(userId: string): AegisStateWithUser[] {
    return this.getAll().filter((inc) => inc.userId === userId);
  }

  getByStatus(status: AegisState["status"]): AegisStateWithUser[] {
    return this.getAll().filter((inc) => inc.status === status);
  }
}

export const incidentStore = new IncidentStore();
