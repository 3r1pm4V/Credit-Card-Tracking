import { Card, Category } from './types';

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'Supermarket', label: 'Siêu thị' },
  { value: 'Online', label: 'Mua sắm Online' },
  { value: 'Dining', label: 'Ăn uống' },
  { value: 'Transport', label: 'Di chuyển (Grab/Be/Taxi)' },
  { value: 'Gas', label: 'Xăng dầu' },
  { value: 'Health', label: 'Sức khỏe / Y tế' },
  { value: 'Education', label: 'Giáo dục / Sách' },
  { value: 'Travel', label: 'Du lịch / Nghỉ dưỡng' },
  { value: 'Digital', label: 'Sản phẩm số (Netflix/Spotify...)' },
  { value: 'Ecommerce', label: 'Thương mại điện tử (Shopee/Lazada...)' },
  { value: 'Cinema', label: 'Xem phim Online' },
  { value: 'Utilities', label: 'Điện nước / Cước' },
  { value: 'Other', label: 'Khác' },
];

export const DEFAULT_CARDS: Card[] = [
  {
    id: 'vib-online-plus',
    name: 'VIB SuperCard',
    bank: 'VIB',
    statementDay: 15,
    gracePeriod: 25,
    defaultRate: 0.1,
    cashbackRules: [
      { categories: ['Online'], rate: 6, cap: 600000 },
    ],
  },
  {
    id: 'hsbc-cashback',
    name: 'HSBC Cash Back',
    bank: 'HSBC',
    statementDay: 15,
    gracePeriod: 15,
    defaultRate: 0.5,
    cashbackRules: [
      { categories: ['Supermarket', 'Transport'], rate: 6, cap: 200000 },
      { categories: ['Online'], rate: 1 },
      { categories: ['Education'], rate: 1 },
      { categories: ['Health'], rate: 1 },
    ],
  },
  {
    id: 'sacombank-cashback',
    name: 'Sacombank Uniq',
    bank: 'Sacombank',
    statementDay: 20,
    gracePeriod: 25,
    defaultRate: 0.5,
    cashbackRules: [
      { categories: ['Online'], rate: 5, cap: 600000 },
    ],
  },
  {
    id: 'woori-bank',
    name: 'Woori VV Lux Point',
    bank: 'Woori Bank',
    statementDay: 31,
    gracePeriod: 15,
    defaultRate: 0.3,
    cashbackRules: [
      { categories: ['Health', 'Education', 'Dining'], rate: 10 },
      { categories: ['Supermarket', 'Transport', 'Travel'], rate: 5 }
    ],
  },
  {
    id: 'kbank-visa',
    name: 'KBank Visa',
    bank: 'KBank',
    statementDay: 5,
    gracePeriod: 15,
    defaultRate: 1,
    cashbackRules: [
        { categories: ['Online'], rate: 10, cap: 300000}
    ],
  },
];
