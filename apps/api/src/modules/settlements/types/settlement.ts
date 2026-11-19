export type Person = {
  id: string;
  name: string;
  label: string | null;
  phoneLast4: string | null;
  version: number;
};
export type Expense = {
  id: string;
  roundId: string;
  name: string;
  total: number;
  deposit: number;
  includeDeposit: boolean;
  support: number;
  reservationId: string | null;
  memo: string;
  payers: Person[];
  remainder: Person | null;
  fileIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type Payment = {
  id: string;
  participant: Person;
  kind: "RECEIPT" | "RETURN" | "CORRECTION";
  amount: number;
  corrects: string | null;
  reason: string;
  actorId: string;
  at: string;
  calculationVersion: number;
};
export type Bank = { bank: string; account: string; holder: string };
export type Notice = {
  id: string;
  replaces: string | null;
  title: string;
  message: string;
  bank: Bank | null;
  deadline: string | null;
  includePeople: boolean;
  scope: "ALL" | "UNCONFIRMED";
  text: string;
  calculationVersion: number;
  createdAt: string;
  actorId: string;
  snapshot: {
    expenses: Expense[];
    people: {
      id: string;
      name: string;
      label: string | null;
      amount: number;
    }[];
    total: number;
    target: number;
  };
};
export type SettlementState = {
  version: number;
  calculationVersion: number;
  expenses: Expense[];
  payments: Payment[];
  notices: Notice[];
  memo: string;
};
export const initialSettlement = (): SettlementState => ({
  version: 0,
  calculationVersion: 0,
  expenses: [],
  payments: [],
  notices: [],
  memo: "",
});
