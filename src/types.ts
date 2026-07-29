export type Category = 
  | 'Supermarket' 
  | 'Online' 
  | 'Dining' 
  | 'Transport' 
  | 'Gas'
  | 'Health' 
  | 'Education' 
  | 'Utilities' 
  | 'Travel'
  | 'Digital'
  | 'Ecommerce'
  | 'Cinema'
  | 'Other';

export interface CashbackRule {
  categories: Category[];
  rate: number; // percentage, e.g., 6 for 6%
  cap?: number; // maximum combined cashback for these categories per month
}

export interface Card {
  id: string;
  name: string;
  bank: string;
  lastFourDigits?: string;
  statementDay: number; // e.g. 15 for 15th of the month
  gracePeriod: number; // days until payment due, e.g. 15 or 25
  limit?: number; // credit limit
  cashbackRules: CashbackRule[];
  defaultRate: number; // default rate if no category matches
  monthlyCashbackCap?: number; // global monthly cashback cap for the card
  minSpend?: number; // minimum spending required for cashback eligibility
  sharedLimitId?: string; // ID to group cards sharing the same limit
  settlementDays?: number; // Days until transaction is officially settled/posted
  statementType?: 'monthly' | 'cycle';
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  shareId?: string;
  shareEnabled?: boolean;
  members?: string[]; // List of names sharing the cards
  memberCategories?: Record<string, string[]>; // Child spending categories per member
  updatedAt: string;
}

export type TransactionType = 'standard' | 'installment' | 'payment' | 'cashback_redemption' | 'refund' | 'cancelled' | 'nhan_hoan_tien' | 'giao_dich_bi_huy';

export interface Transaction {
  id: string;
  cardId: string;
  amount: number;
  category: Category;
  description: string;
  date: string; // ISO string
  cashback: number;
  paymentDueDate: string; // ISO string
  nextPaymentDueDate?: string; // ISO string
  prevPaymentDueDate?: string; // ISO string
  type?: TransactionType;
  installments?: number; // Total months
  installmentIndex?: number; // Current month (1, 2, 3...)
  parentId?: string; // To link installments together
  memberName?: string; // Who made this transaction
  memberCategory?: string; // Sub-spending category
  statementCycleOffset?: number; // Adjusts which statement cycle this falls into (-1 = prev, 1 = next)
}
