import { IsUUID, IsOptional, IsBoolean } from "class-validator";
export class FavoritesQuery {
  @IsOptional() @IsUUID() groupId?: string;
}
export class FavoriteInput {
  @IsOptional() @IsUUID() groupId?: string;
  @IsUUID() restaurantId!: string;
  @IsBoolean() saved!: boolean;
}
