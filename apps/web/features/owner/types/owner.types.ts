import type { z } from "zod";
import type { menuInputSchema } from "../schemas/registration.schema";
import type { Reply } from "@/features/merchant-replies/types";
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

export type MenuInput = z.infer<typeof menuInputSchema>;
export type MenuRecord = Omit<MenuInput, "id"> & { id: string };
export type MenuList = { version: number; menus: MenuRecord[] };
export type PhoneChallenge = {
  id: string;
  phone: string;
  message: string;
  receiver: string;
  status: string;
  nextCheckAt: string;
};
export type InquiryList = {
  inquiries: {
    targetId: string;
    restaurantId: string;
    restaurantName: string;
    eventName: string;
    startsAt: string;
    receivedAt: string;
    expectedGuests: number;
    response: Reply | null;
    closed: boolean;
  }[];
  nextCursor: string | null;
};
