import type {
  RegistrationData,
  VerifiedAddress,
} from "../schemas/registration.schema";
export type OwnerContext = {
  restaurants: {
    id: string;
    name: string;
    branchName: string | null;
    published: boolean;
    version: number;
  }[];
  drafts: { id: string; restaurantId: string | null; step: number }[];
  supportEmail: string | null;
};
export type RestaurantDraft = {
  id: string;
  restaurantId: string | null;
  version: number;
  restaurantVersion?: number | null;
  currentRestaurant?: {
    version: number;
    published: boolean;
    data: RegistrationData;
  } | null;
  step: number;
  data: RegistrationData;
  selectedAddress: VerifiedAddress | null;
  verifiedPhone: string | null;
  submitted: boolean;
};
export type DuplicateResult = {
  duplicate: boolean;
  ownRestaurantId: string | null;
  supportEmail: string | null;
};
