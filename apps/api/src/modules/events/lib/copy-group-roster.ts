import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import { normalizePersonName } from "../../../common/validation/person-name.js";
import { EventParticipant } from "../entities/event-participant.entity.js";

// Called in the transaction that created or locked the event.
export async function copyGroupRoster(
  manager: EntityManager,
  eventId: string,
  members: Pick<EventParticipant, "id" | "name" | "phoneLast4" | "label">[],
) {
  const existing = await manager.find(EventParticipant, {
    where: { eventId },
    select: { groupMemberId: true, position: true },
  });
  const imported = new Set(existing.map((p) => p.groupMemberId));
  const fresh = members.filter((m) => !imported.has(m.id));
  if (fresh.length && existing.length + fresh.length > 500)
    throw new DomainHttpException("ROSTER_LIMIT");
  const position = existing.reduce(
    (max, p) => Math.max(max, p.position + 1),
    0,
  );
  if (fresh.length)
    await manager.insert(
      EventParticipant,
      fresh.map((p, i) => ({
        id: randomUUID(),
        eventId,
        groupMemberId: p.id,
        name: normalizePersonName(p.name),
        phoneLast4: p.phoneLast4,
        label: p.label,
        position: position + i,
        version: 1,
        identityVersion: 1,
        createdAt: new Date(),
      })),
    );
  return { addedCount: fresh.length };
}
