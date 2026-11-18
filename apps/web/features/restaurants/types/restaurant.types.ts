export type RestaurantSpace = {
  id: string;
  label: string;
  kind: "HALL" | "FLOOR" | "WHOLE";
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
  photoPath: string | null;
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

export type RestaurantConditions = {
  expectedGuests: number;
  seating: "CLOSE" | "SEPARATED" | "ANY";
  space: "HALL" | "FLOOR" | "WHOLE" | "ANY";
};
