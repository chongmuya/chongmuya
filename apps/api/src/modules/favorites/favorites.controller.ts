import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Header,
} from "@nestjs/common";
import { AccessGuard } from "../auth/guards/jwt-access.guard.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/types/auth-user.js";
import { FavoritesService } from "./favorites.service.js";
import {
  FavoriteInput,
  FavoritesQuery,
} from "./dto/request/favorite.request.dto.js";
@UseGuards(AccessGuard)
@Controller("api/v1/favorites")
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @CurrentUser() user: AuthUser,
    @Query() q: FavoritesQuery,
  ) {
    return this.favorites.list(user.id, q.groupId);
  }
  @Post() @Header("Cache-Control", "no-store") save(
    @CurrentUser() user: AuthUser,
    @Body() input: FavoriteInput,
  ) {
    return this.favorites.save(user.id, input);
  }
}
