import { Injectable, NotFoundException } from "@nestjs/common";
import { IsNull, type EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { GroupsService } from "../groups/groups.service.js";
import { RestaurantsService } from "../restaurants/restaurants.service.js";
import { Favorite } from "./entities/favorite.entity.js";
import type { FavoriteInput } from "./dto/request/favorite.request.dto.js";
@Injectable()
export class FavoritesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly groups: GroupsService,
    private readonly restaurants: RestaurantsService,
  ) {}
  async count(groupId: string, m: EntityManager) {
    return m.countBy(Favorite, { groupId });
  }
  async list(accountId: string, groupId?: string) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      if (groupId) await this.groups.assertOwned(accountId, groupId, m);
      const rows = await m.find(Favorite, {
        where: groupId ? { groupId } : { accountId, groupId: IsNull() },
        order: { createdAt: "DESC" },
      });
      const catalog = await this.restaurants.favoriteSummaries(
        rows.map((r) => r.restaurantId),
        m,
      );
      return rows.map((r) => ({
        id: r.id,
        restaurantId: r.restaurantId,
        groupId: r.groupId,
        restaurant: catalog.find((c) => c.id === r.restaurantId) ?? null,
      }));
    });
  }
  async save(accountId: string, input: FavoriteInput) {
    const db = await this.database.connect();
    return db.transaction(async (m) => {
      if (input.groupId)
        await this.groups.assertOwned(accountId, input.groupId, m);
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `favorite:${input.groupId ?? accountId}:${input.restaurantId}`,
      ]);
      const where = input.groupId
        ? { groupId: input.groupId, restaurantId: input.restaurantId }
        : { accountId, groupId: IsNull(), restaurantId: input.restaurantId };
      const row = await m.findOneBy(Favorite, where);
      if (input.saved && !row) {
        if (
          !(await this.restaurants.favoriteSummaries([input.restaurantId], m))
            .length
        )
          throw new NotFoundException();
        await m.insert(Favorite, {
          id: randomUUID(),
          accountId,
          groupId: input.groupId ?? null,
          restaurantId: input.restaurantId,
          createdAt: new Date(),
        });
      } else if (!input.saved && row) await m.delete(Favorite, { id: row.id });
      return { saved: input.saved };
    });
  }
}
