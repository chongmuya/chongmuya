import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  RestaurantsQuery,
  RestaurantRegionQuery,
} from "./dto/request/restaurants-query.request.dto.js";
import { RestaurantsService } from "./restaurants.service.js";

@ApiTags("restaurants")
@Controller("api/v1/restaurants")
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}
  @Get() list(@Query() query: RestaurantsQuery) {
    return this.restaurants.list(query);
  }
  @Get("map") map(@Query() query: RestaurantRegionQuery) {
    return this.restaurants.map(query.region, query.expectedGuests);
  }
  @Get(":id") get(@Param("id", ParseUUIDPipe) id: string) {
    return this.restaurants.get(id);
  }
}
