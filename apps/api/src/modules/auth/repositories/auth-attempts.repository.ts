import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { consumeRequestLimit } from "../../../common/http/request-limit.js";

// Atomic rate-limit upsert is the only specialized query here. Caller owns connection/transaction.
@Injectable()
export class AuthAttemptsRepository {
  async limit(manager: EntityManager, key: string, maximum: number) {
    return consumeRequestLimit(manager, key, maximum);
  }
}
