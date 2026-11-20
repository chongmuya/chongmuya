export type ReservationContactDto = {
  kind: "restaurant" | "organizer";
  name: string;
  phone: string | null;
  changedAt: string | null;
};
