export type RestaurantSpace = {
  id: string;
  label: string;
  kind: "HALL" | "ROOM" | "FLOOR" | "WHOLE";
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
  togetherSeating: "YES" | "NO" | "UNKNOWN";
  capacity: number | null;
  minGuests: number | null;
  minSpend: number | null;
  separateFee: number | null;
  conditions: string | null;
};
export type Restaurant = {
  id: string;
  name: string;
  address: string;
  region: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  maxCapacity: number | null;
  minimumGuests?: number | null;
  minimumOrder?: {
    kind: string;
    amount: number | null;
    quantity: number | null;
    unit: string;
  } | null;
  photoPath: string | null;
  spacePhotos: { path: string; description: string; position: number }[];
  operatingHours: string | null;
  facilities: string | null;
  bookingPolicy: string | null;
  depositPolicy: string | null;
  menuPolicy: string | null;
  cancellationPolicy: string | null;
  isDemo: boolean;
  inquiryAvailable: boolean;
  spaces: RestaurantSpace[];
  menus: {
    id: string;
    name: string;
    kind: "REGULAR" | "SET";
    price: number | null;
    unit: string;
  }[];
};

export type RestaurantSummary = Pick<
  Restaurant,
  | "id"
  | "name"
  | "address"
  | "region"
  | "category"
  | "latitude"
  | "longitude"
  | "maxCapacity"
  | "minimumGuests"
  | "photoPath"
  | "isDemo"
  | "inquiryAvailable"
> & {
  spaces: Pick<
    RestaurantSpace,
    | "id"
    | "label"
    | "kind"
    | "availability"
    | "capacity"
    | "minGuests"
    | "togetherSeating"
  >[];
};
export type RestaurantMap = Pick<
  Restaurant,
  "id" | "name" | "address" | "region" | "latitude" | "longitude"
>;

export type BrowseNavigation = {
  selected: string[];
  restaurantId: string | null;
  view: "list" | "map" | "detail";
  page: number;
  onSelect: (ids: string[]) => void;
  onNavigate: (changes: Record<string, string | null>) => void;
};
