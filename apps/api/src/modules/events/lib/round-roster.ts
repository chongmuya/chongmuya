import { NotFoundException } from "@nestjs/common";
import { In, Not, type EntityManager } from "typeorm";
import { AttendanceRound } from "../entities/attendance-round.entity.js";
import { AttendanceRoundExclusion } from "../entities/attendance-round-exclusion.entity.js";
import { EventParticipant } from "../entities/event-participant.entity.js";

export async function requireAttendanceRound(
  eventId: string,
  id: string,
  manager: EntityManager,
) {
  const round = await manager.findOneBy(AttendanceRound, { id, eventId });
  if (!round) throw new NotFoundException();
  return round;
}

export function attendancePeople(
  eventId: string,
  roundId: string,
  manager: EntityManager,
) {
  return manager
    .createQueryBuilder(EventParticipant, "p")
    .where("p.eventId = :eventId", { eventId })
    .andWhere(
      `NOT EXISTS (
      SELECT 1 FROM attendance_round_exclusions x
      WHERE x.round_id = :roundId AND x.participant_id = p.id
    )`,
      { roundId },
    )
    .orderBy("p.position", "ASC")
    .addOrderBy("p.id", "ASC")
    .getMany();
}

// All roster writes hold the event lock. New identities enroll only in the selected round.
export async function includeInRound(
  eventId: string,
  roundId: string,
  newIds: string[],
  existingIds: string[],
  manager: EntityManager,
) {
  if (newIds.length) {
    const otherRounds = await manager.find(AttendanceRound, {
      where: { eventId, id: Not(roundId) },
      select: { id: true },
    });
    for (const other of otherRounds)
      await manager.insert(
        AttendanceRoundExclusion,
        newIds.map((participantId) => ({
          roundId: other.id,
          eventId,
          participantId,
        })),
      );
  }
  const restored = existingIds.length
    ? ((
        await manager.delete(AttendanceRoundExclusion, {
          eventId,
          roundId,
          participantId: In(existingIds),
        })
      ).affected ?? 0)
    : 0;
  return newIds.length + restored;
}
