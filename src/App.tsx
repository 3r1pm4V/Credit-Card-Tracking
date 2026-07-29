/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  CreditCard,
  Plus,
  Calendar,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  History,
  Settings,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Trash2,
  TrendingUp,
  Wallet,
  ChevronLeft,
  Sparkles,
  Loader2,
  Edit2,
  Share2,
  Copy,
  Cloud,
  RefreshCw,
  X,
  Download,
  FileText,
} from "lucide-react";
import {
  format,
  addDays,
  subDays,
  isAfter,
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
  lastDayOfMonth,
  eachDayOfInterval,
  isSameDay,
  isBefore,
  isEqual,
  startOfWeek,
  endOfWeek,
  getDay,
  isValid,
  endOfDay,
  startOfDay,
  addMonths,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  Timestamp,
} from "firebase/firestore";

import { auth, db, loginWithGoogle, logout } from "./lib/firebase";
import {
  Card,
  Transaction,
  Category,
  CashbackRule,
  TransactionType,
  UserProfile,
} from "./types";
import { DEFAULT_CARDS, CATEGORIES } from "./constants";
import { cn, formatCurrency } from "./lib/utils";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#475569",
];

// Safe date helpers
const safeFormat = (
  date: Date | string | undefined | null,
  formatStr: string,
  fallback: string = "---",
) => {
  if (!date) return fallback;
  const d = typeof date === "string" ? parseISO(date) : date;
  if (!isValid(d)) return fallback;
  try {
    return format(d, formatStr, { locale: vi });
  } catch (e) {
    return fallback;
  }
};

const getSafeDateObject = (
  year: number,
  month: number,
  targetDay: number | undefined,
) => {
  const sDay = Number(targetDay) || 1;
  const d = new Date(year, month, 1);
  const last = lastDayOfMonth(d).getDate();
  return new Date(year, month, Math.min(sDay, last));
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(
    null,
  );
  const [viewOnly, setViewOnly] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCardId, setSelectedCardId] = useState<string>("all");

  const [activeTab, setActiveTab] = useState<
    "dashboard" | "add" | "history" | "settings" | "statement"
  >("dashboard");
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [memberViewMode, setMemberViewMode] = useState<"current" | "previous">(
    "current",
  );
  const [memberTabs, setMemberTabs] = useState<
    Record<string, "category" | "card">
  >({});
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [showDomainWarning, setShowDomainWarning] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    }
  };

  useEffect(() => {
    // Check if the current domain matches the Firebase config
    if (
      window.location.hostname !== "localhost" &&
      !window.location.hostname.includes("firebaseapp.com")
    ) {
      setShowDomainWarning(true);
    }
  }, []);

  // Auth Listener
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareExtId = params.get("share");
    if (shareExtId) {
      const resolveShare = async () => {
        try {
          const mappingRef = doc(db, "share_mappings", shareExtId);
          const mappingSnap = await getDoc(mappingRef);
          if (mappingSnap.exists()) {
            const uid = mappingSnap.data().userId;
            setTargetUserId(uid);
            setViewOnly(true);

            // Get profile for name
            const profileRef = doc(db, "users", uid);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              setCurrentProfile(profileSnap.data() as UserProfile);
            }
          }
        } catch (err) {
          console.error("Failed to resolve share link:", err);
        }
      };
      resolveShare();
    }

    const localCardsStr = localStorage.getItem("cashback_cards");
    const localTrxStr = localStorage.getItem("cashback_transactions");
    if (localCardsStr && !viewOnly) setCards(JSON.parse(localCardsStr));
    if (localTrxStr && !viewOnly) setTransactions(JSON.parse(localTrxStr));

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Ensure user document exists with basic info
        try {
          const userRef = doc(db, "users", u.uid);

          const profileData = {
            uid: u.uid,
            email: u.email || "",
            displayName: u.displayName || "User",
            photoURL: u.photoURL || null,
            updatedAt: new Date().toISOString(),
          };

          await setDoc(userRef, profileData, { merge: true });

          if (!viewOnly) {
            setTargetUserId(u.uid);
          }
        } catch (err) {
          console.error("Failed to sync user profile initial state:", err);
        }
      } else {
        // If not logged in and no local cache, show defaults
        if (!localCardsStr && !viewOnly) setCards(DEFAULT_CARDS);
        if (!viewOnly) setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [viewOnly]);

  // Save guest data
  useEffect(() => {
    if (!user && cards.length > 0) {
      localStorage.setItem("cashback_cards", JSON.stringify(cards));
    }
  }, [cards, user?.uid]);

  useEffect(() => {
    if (!user && transactions.length > 0) {
      localStorage.setItem(
        "cashback_transactions",
        JSON.stringify(transactions),
      );
    }
  }, [transactions, user?.uid]);

  const [isLoadingSync, setIsLoadingSync] = useState(false);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);

  useEffect(() => {
    // Only run when we have a user and we just loaded an empty card list from Firestore
    // and we have cards in localStorage
    if (user && cards.length === 0 && !loading) {
      const localCards = localStorage.getItem("cashback_cards");
      if (localCards && JSON.parse(localCards).length > 0) {
        setShowSyncPrompt(true);
      }
    }
  }, [user?.uid, cards.length, loading]);

  const handleManualSync = async () => {
    if (!user) return;
    setIsLoadingSync(true);
    try {
      const localCardsStr = localStorage.getItem("cashback_cards");
      const localTrxStr = localStorage.getItem("cashback_transactions");

      const batch = writeBatch(db);

      if (localCardsStr) {
        const localCards: Card[] = JSON.parse(localCardsStr);
        localCards.forEach((card) => {
          const ref = doc(db, "users", user.uid, "cards", card.id);
          batch.set(ref, card);
        });
      }

      if (localTrxStr) {
        const localTrx: Transaction[] = JSON.parse(localTrxStr);
        localTrx.forEach((t) => {
          const ref = doc(db, "users", user.uid, "transactions", t.id);
          batch.set(ref, t);
        });
      }

      await batch.commit();
      setShowSyncPrompt(false);
      localStorage.removeItem("cashback_cards");
      localStorage.removeItem("cashback_transactions");
      alert("Đồng bộ dữ liệu thành công!");
    } catch (error) {
      console.error("Manual sync error:", error);
      alert("Lỗi khi đồng bộ dữ liệu.");
    } finally {
      setIsLoadingSync(false);
    }
  };

  // Profile Sync
  useEffect(() => {
    if (!user?.uid || viewOnly) return;

    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setCurrentProfile(snap.data() as UserProfile);
        }
      },
      (error) => {
        console.error("Profile listen error:", error);
      },
    );

    return () => unsubscribe();
  }, [user?.uid, viewOnly]);

  // Sync Cards
  useEffect(() => {
    const effectiveUid = targetUserId || user?.uid;
    if (!effectiveUid) return;

    const q = collection(db, "users", effectiveUid, "cards");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedCards = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as Card,
        );

        // If we are logged in, we strictly follow the cloud data.
        // If the cloud is empty, we show the empty state and let user decide to add or initialize samples.
        setCards(fetchedCards);
        setLoading(false);
      },
      (error) => {
        console.error("Cards sync error:", error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [user?.uid, targetUserId]);

  // Sync Transactions
  useEffect(() => {
    const effectiveUid = targetUserId || user?.uid;
    if (!effectiveUid) return;

    const q = collection(db, "users", effectiveUid, "transactions");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedTransactions = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as Transaction,
        );
        setTransactions(
          fetchedTransactions.sort((a, b) => {
            const da = a.date ? parseISO(a.date).getTime() : 0;
            const db = b.date ? parseISO(b.date).getTime() : 0;
            return (db || 0) - (da || 0);
          }),
        );
      },
      (error) => {
        console.error("Transactions sync error:", error);
      },
    );

    return unsubscribe;
  }, [user?.uid, targetUserId]);

  // Actions
  const handleAddCard = async (newCard: Card) => {
    // Sanitize to avoid Firestore 'undefined' errors
    const sanitizedCard = Object.fromEntries(
      Object.entries(newCard).filter(([_, v]) => v !== undefined),
    ) as Card;

    if (user) {
      await setDoc(
        doc(db, "users", user.uid, "cards", sanitizedCard.id),
        sanitizedCard,
      );
    } else {
      setCards([...cards, sanitizedCard]);
    }
    setIsAddingCard(false);
  };

  const initializeDefaultCardsTrigger = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    DEFAULT_CARDS.forEach((card) => {
      const ref = doc(db, "users", user.uid, "cards", card.id);
      batch.set(ref, card);
    });
    await batch.commit();
  };

  const handleEditCard = async (updatedCard: Card) => {
    // Sanitize to avoid Firestore 'undefined' errors
    const sanitizedCard = Object.fromEntries(
      Object.entries(updatedCard).filter(([_, v]) => v !== undefined),
    ) as Card;

    try {
      if (auth.currentUser) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid, "cards", sanitizedCard.id),
          sanitizedCard,
        );
      } else {
        setCards(
          cards.map((c) => (c.id === sanitizedCard.id ? sanitizedCard : c)),
        );
      }
      setEditingCard(null);
      setIsAddingCard(false);
    } catch (err: any) {
      console.error("Failed to edit card:", err);
      alert(
        `[HỆ THỐNG] Không thể cập nhật thẻ: ${err.message || "Lỗi không xác định"}`,
      );
    }
  };

  const deleteCard = async (id: string) => {
    if (
      !window.confirm(
        "Bạn có chắc chắn muốn xoá thẻ này? Hành động này không thể hoàn tác.",
      )
    )
      return;

    try {
      if (auth.currentUser) {
        await deleteDoc(doc(db, "users", auth.currentUser.uid, "cards", id));
      } else {
        setCards(cards.filter((c) => c.id !== id));
      }
    } catch (err: any) {
      console.error("Failed to delete card:", err);
      alert(
        `[HỆ THỐNG] Không thể xoá thẻ: ${err.message || "Lỗi không xác định"}`,
      );
    }
  };

  const addTransaction = async (data: {
    cardId: string;
    amount: number;
    category: Category;
    description: string;
    date: string;
    type: TransactionType;
    installments?: number;
    memberName?: string;
    memberCategory?: string;
    statementCycleOffset?: number;
  }) => {
    try {
      const card = cards.find((c) => c.id === data.cardId);
      if (!card) throw new Error("Card not found");

      if (
        data.type === "installment" &&
        data.installments &&
        data.installments > 1
      ) {
        const parentId = generateId();
        const totalAmount = data.amount;
        const numInstallments = data.installments;
        const monthlyAmountBase = Math.floor(totalAmount / numInstallments);
        const installmentTransactions: Transaction[] = [];

        for (let i = 1; i <= numInstallments; i++) {
          const baseDate = parseISO(data.date);
          let dateStr: string;

          if (!isValid(baseDate)) {
            dateStr = new Date().toISOString();
          } else {
            const transDay = baseDate.getDate();
            const statementDay = Number(card.statementDay) || 1;
            let monthOffset = 0;

            // User's specific logic for installment first date:
            // - Before statement day: month + 1
            // - On statement day: month + 0
            // - After statement day: month + 1
            if (transDay < statementDay) {
              monthOffset = 1;
            } else if (transDay === statementDay) {
              monthOffset = 0;
            } else {
              monthOffset = 1;
            }

            const currentDate = new Date(
              baseDate.getFullYear(),
              baseDate.getMonth() + monthOffset + (i - 1),
              transDay,
            );

            // Handle month overflow/end-of-month issues (e.g. 31st to 30th)
            if (currentDate.getDate() !== transDay) {
              currentDate.setDate(0); 
            }

            dateStr = currentDate.toISOString();
          }

          const amount =
            i === numInstallments
              ? totalAmount - monthlyAmountBase * (numInstallments - 1)
              : monthlyAmountBase;

          const cashback =
            i === 1
              ? calculateCashback(
                  totalAmount,
                  data.category,
                  card,
                  data.date,
                  transactions,
                  undefined,
                  data.type,
                )
              : 0;

          const paymentDueDate = calculatePaymentDueDate(dateStr, card);

          installmentTransactions.push({
            id: generateId(),
            ...data,
            amount,
            description: `${data.description} (Kỳ ${i}/${numInstallments})`,
            date: dateStr,
            cashback,
            paymentDueDate,
            installmentIndex: i,
            parentId,
          });
        }

        if (auth.currentUser) {
          const batch = writeBatch(db);
          installmentTransactions.forEach((t) => {
            const ref = doc(
              db,
              "users",
              auth.currentUser!.uid,
              "transactions",
              t.id,
            );
            batch.set(ref, t);
          });
          await batch.commit();
        } else {
          setTransactions([...installmentTransactions, ...transactions]);
        }
      } else {
        const cashback = calculateCashback(
          data.amount,
          data.category,
          card,
          data.date,
          transactions,
          undefined,
          data.type,
        );
        const paymentDueDate = calculatePaymentDueDate(data.date, card);

        const newTransaction: Transaction = {
          id: generateId(),
          ...data,
          cashback,
          paymentDueDate,
        };

        const cleanTransaction = Object.fromEntries(
          Object.entries(newTransaction).filter(([_, v]) => v !== undefined),
        ) as Transaction;

        if (auth.currentUser) {
          await setDoc(
            doc(
              db,
              "users",
              auth.currentUser.uid,
              "transactions",
              cleanTransaction.id,
            ),
            cleanTransaction,
          );
        } else {
          setTransactions([cleanTransaction, ...transactions]);
        }
      }
    } catch (err: any) {
      console.error("Critical: Failed to add transaction:", err);
      const errorMessage =
        err?.message || JSON.stringify(err) || "Lỗi không xác định";
      const debugInfo = user
        ? ` (UID: ${user.uid.substring(0, 5)}..., Path: users/${user.uid.substring(0, 5)}.../transactions)`
        : " (No User)";
      alert(
        `[HỆ THỐNG] Không thể lưu: ${errorMessage}${debugInfo}. Vui lòng thử lại.`,
      );
    }
  };

  const updateTransaction = async (data: any) => {
    if (!editingTransaction) return;
    const id = editingTransaction.id;
    const card = cards.find((c) => c.id === data.cardId);
    if (!card) return;

    try {
      if (
        data.type === "installment" &&
        data.installments &&
        data.installments > 1 &&
        editingTransaction.type !== "installment"
      ) {
        // Converting a standard transaction to installment
        if (auth.currentUser) {
          await deleteDoc(
            doc(db, "users", auth.currentUser.uid, "transactions", id),
          );
        }
        await addTransaction(data);
      } else {
        const cashback = calculateCashback(
          data.amount,
          data.category,
          card,
          data.date,
          transactions,
          id,
          data.type,
        );
        const paymentDueDate = calculatePaymentDueDate(data.date, card);

        const updated: Transaction = {
          ...editingTransaction,
          ...data,
          cashback,
          paymentDueDate,
        };

        // Sanitize to avoid Firestore 'undefined' errors
        Object.keys(updated).forEach((key) => {
          if ((updated as any)[key] === undefined) {
            delete (updated as any)[key];
          }
        });

        if (auth.currentUser) {
          await setDoc(
            doc(db, "users", auth.currentUser.uid, "transactions", id),
            updated,
          );
        } else {
          setTransactions(transactions.map((t) => (t.id === id ? updated : t)));
        }
      }
      setEditingTransaction(null);
      setActiveTab("history");
    } catch (err: any) {
      console.error("Failed to update transaction:", err);
      alert(
        `[HỆ THỐNG] Không thể cập nhật: ${err.message || "Lỗi không xác định"}`,
      );
    }
  };

  const deleteTransaction = async (id: string) => {
    const transactionToDelete = transactions.find((t) => t.id === id);
    if (!transactionToDelete) return;

    let confirmMsg = "Bạn có chắc chắn muốn xoá giao dịch này?";
    if (transactionToDelete.parentId) {
      confirmMsg =
        "Đây là một phần của giao dịch trả góp. Xoá giao dịch này sẽ xoá TOÀN BỘ các kỳ trả góp liên quan. Bạn có chắc chắn?";
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      if (auth.currentUser || targetUserId) {
        const uid = targetUserId || auth.currentUser!.uid;

        if (transactionToDelete.parentId) {
          const batch = writeBatch(db);
          const relatedTransactions = transactions.filter(
            (t) => t.parentId === transactionToDelete.parentId,
          );

          relatedTransactions.forEach((t) => {
            batch.delete(doc(db, "users", uid, "transactions", t.id));
          });

          await batch.commit();
        } else {
          await deleteDoc(doc(db, "users", uid, "transactions", id));
        }
      } else {
        let newTransactions: Transaction[];
        if (transactionToDelete.parentId) {
          newTransactions = transactions.filter(
            (t) => t.parentId !== transactionToDelete.parentId,
          );
        } else {
          newTransactions = transactions.filter((t) => t.id !== id);
        }

        setTransactions(newTransactions);
        localStorage.setItem(
          "cashback_transactions",
          JSON.stringify(newTransactions),
        );
      }
    } catch (err: any) {
      console.error("Failed to delete transaction:", err);
      alert(`[HỆ THỐNG] Không thể xoá: ${err.message || "Lỗi không xác định"}`);
    }
  };

  // Helper functions used by transaction logic
  // Lib Fallbacks
  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return (
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
      );
    }
  };

  const calculateCashback = (
    amount: number,
    category: Category,
    targetCard: Card,
    transDateStr: string,
    currentTransactions: Transaction[],
    excludeId?: string,
    type?: TransactionType,
  ) => {
    if (
      type === "payment" ||
      type === "cashback_redemption" ||
      type === "refund"
    )
      return 0;

    // Validate target date
    if (!transDateStr || typeof transDateStr !== "string") return 0;
    const transDate = parseISO(transDateStr);
    if (!isValid(transDate)) return 0;

    const rules = targetCard.cashbackRules || [];
    const rule = rules.find(
      (r) =>
        r &&
        r.categories &&
        Array.isArray(r.categories) &&
        r.categories.includes(category),
    );

    const rate = rule ? rule.rate : targetCard.defaultRate || 0;
    let cashback = (amount * rate) / 100;

    if (rule && rule.cap && Array.isArray(rule.categories)) {
      const stDay = Number(targetCard.statementDay) || 1;
      const cycleStart = getSafeDateObject(
        transDate.getFullYear(),
        transDate.getMonth(),
        stDay,
      );
      if (transDate.getDate() < stDay) {
        cycleStart.setMonth(cycleStart.getMonth() - 1);
      }
      const cycleEnd = getSafeDateObject(
        cycleStart.getFullYear(),
        cycleStart.getMonth() + 1,
        stDay,
      );

      const monthSum = currentTransactions
        .filter((t) => {
          if (
            !t ||
            t.id === excludeId ||
            t.cardId !== targetCard.id ||
            !rule.categories?.includes(t.category)
          ) {
            return false;
          }
          if (!t.date || typeof t.date !== "string") return false;
          const tDate = parseISO(t.date);
          if (!isValid(tDate)) return false;

          return isWithinInterval(tDate, { start: cycleStart, end: cycleEnd });
        })
        .reduce(
          (acc, t) => acc + (t && !isNaN(t.cashback) ? t.cashback : 0),
          0,
        );

      const remaining = Math.max(0, rule.cap - monthSum);
      cashback = Math.min(cashback, remaining);
    }

    // Global monthly cap check (Follow Statement Cycle)
    if (targetCard.monthlyCashbackCap) {
      const stDay = Number(targetCard.statementDay) || 1;
      const cycleStart = getSafeDateObject(
        transDate.getFullYear(),
        transDate.getMonth(),
        stDay,
      );
      if (transDate.getDate() < stDay) {
        cycleStart.setMonth(cycleStart.getMonth() - 1);
      }
      const cycleEnd = getSafeDateObject(
        cycleStart.getFullYear(),
        cycleStart.getMonth() + 1,
        stDay,
      );

      const totalMonthSum = currentTransactions
        .filter((t) => {
          if (!t || t.id === excludeId || t.cardId !== targetCard.id)
            return false;
          if (!t.date || typeof t.date !== "string") return false;
          const tDate = parseISO(t.date);
          if (!isValid(tDate)) return false;
          return isWithinInterval(tDate, { start: cycleStart, end: cycleEnd });
        })
        .reduce(
          (acc, t) => acc + (t && !isNaN(t.cashback) ? t.cashback : 0),
          0,
        );

      const remainingGlobal = Math.max(
        0,
        targetCard.monthlyCashbackCap - totalMonthSum,
      );
      cashback = Math.min(cashback, remainingGlobal);
    }

    return isNaN(cashback) ? 0 : cashback;
  };

  function calculatePaymentDueDate(dateStr: string, targetCard: Card) {
    const transDate = parseISO(dateStr);
    if (!isValid(transDate)) return new Date().toISOString();

    const stDay = Number(targetCard.statementDay) || 1;
    let statementDate = new Date(
      transDate.getFullYear(),
      transDate.getMonth(),
      stDay,
    );
    if (!isValid(statementDate)) statementDate = new Date();

    if (isAfter(transDate, statementDate)) {
      statementDate = new Date(
        transDate.getFullYear(),
        transDate.getMonth() + 1,
        stDay,
      );
    }
    const sType = targetCard.statementType || "cycle";
    const grace = Number(targetCard.gracePeriod) || 15;
    const finalDate = addDays(
      statementDate,
      sType === "monthly" ? grace - 1 : grace,
    );
    return isValid(finalDate)
      ? finalDate.toISOString()
      : new Date().toISOString();
  }

  // Calculations
  const metrics = useMemo(() => {
    const now = new Date();

    const getCycleRangeForCard = (card: Card, offset: number) => {
      const sType = card.statementType || "cycle";
      let cycleStart: Date;
      let cycleEnd: Date;

      if (sType === "monthly") {
        const targetMonth = now.getMonth() + offset;
        const targetYear = now.getFullYear();
        cycleStart = startOfMonth(new Date(targetYear, targetMonth, 1));
        cycleEnd = addDays(endOfMonth(cycleStart), 1);
      } else {
        const sDay = Number(card.statementDay) || 1;
        let currentCycleStart = getSafeDateObject(
          now.getFullYear(),
          now.getMonth(),
          sDay,
        );
        if (now.getDate() < sDay) {
          currentCycleStart = getSafeDateObject(
            now.getFullYear(),
            now.getMonth() - 1,
            sDay,
          );
        }
        cycleStart = getSafeDateObject(
          currentCycleStart.getFullYear(),
          currentCycleStart.getMonth() + offset,
          sDay,
        );
        cycleEnd = getSafeDateObject(
          cycleStart.getFullYear(),
          cycleStart.getMonth() + 1,
          sDay,
        );
      }
      return { start: cycleStart, end: cycleEnd };
    };

    const isTransInCycle = (t: Transaction, offset: number) => {
      const card = cards.find((c) => c.id === t.cardId);
      if (!card) return false;

      const { start: cycleStart, end: cycleEnd } = getCycleRangeForCard(
        card,
        offset,
      );
      const sType = card.statementType || "cycle";
      const settlementDays = Number(card.settlementDays) || 0;

      const dParsed = t.date ? parseISO(t.date) : null;
      if (!dParsed || !isValid(dParsed)) return false;

      if (sType === "monthly") {
        return isWithinInterval(dParsed, {
          start: startOfDay(cycleStart),
          end: endOfDay(subDays(cycleEnd, 1)),
        });
      } else {
        const settledDate = startOfDay(addDays(dParsed, settlementDays));
        return (
          (isAfter(settledDate, startOfDay(cycleStart)) ||
            isEqual(settledDate, startOfDay(cycleStart))) &&
          isBefore(settledDate, startOfDay(cycleEnd))
        );
      }
    };

    // Member-based breakdown for shared cards
    const userMembers = currentProfile?.members || ["Tôi"];
    const memberBreakdown = userMembers.map((name) => {
      const categories = currentProfile?.memberCategories?.[name] || [];

      // Helper function to get debt for a specific cycle
      const getDebtForCycle = (
        offset: number,
        filterCat?: string | null,
        filterCardId?: string | null,
      ) => {
        const memberDebtTransactions = transactions.filter((t) => {
          const tMember = t.memberName || "Tôi";
          if (tMember !== name) return false;
          if (filterCat !== undefined) {
            if (filterCat === null && t.memberCategory) return false;
            if (filterCat !== null && t.memberCategory !== filterCat)
              return false;
          }
          if (filterCardId !== undefined) {
            if (t.cardId !== filterCardId) return false;
          }

          return isTransInCycle(t, offset);
        });

        const totalSpentValue = memberDebtTransactions.reduce((acc, t) => {
          const amt = Math.abs(Number(t.amount) || 0);
          const type = t.type || "standard";
          if (type === "standard" || type === "installment") return acc + amt;
          if (["refund", "cancelled", "giao_dich_bi_huy"].includes(type))
            return acc - amt;
          return acc;
        }, 0);

        const totalExpectedCashback = memberDebtTransactions.reduce(
          (acc, t) => {
            const type = t.type || "standard";
            const cb = Math.abs(Number(t.cashback) || 0);
            if (type === "standard" || type === "installment") return acc + cb;
            if (["refund", "cancelled", "giao_dich_bi_huy"].includes(type))
              return acc - cb;
            return acc;
          },
          0,
        );

        // chi tiêu thành viên = (chi tiêu chuẩn + chi tiêu trả góp) - (chi tiêu hủy + chi tiêu hoàn dự kiến)
        const debt = totalSpentValue - totalExpectedCashback;
        const totalSpent = totalSpentValue;
        const totalCashback = totalExpectedCashback;

        return { debt, totalSpent, totalCashback };
      };

      return {
        name,
        current: getDebtForCycle(0), // Current cycle overall
        previous: getDebtForCycle(-1), // Previous cycle overall
        categories: [
          {
            name: "Khác",
            current: getDebtForCycle(0, null, undefined),
            previous: getDebtForCycle(-1, null, undefined),
          },
          ...categories.map((cat) => ({
            name: cat,
            current: getDebtForCycle(0, cat, undefined),
            previous: getDebtForCycle(-1, cat, undefined),
          })),
        ],
        cards: cards.map((c) => {
          const currentRange = getCycleRangeForCard(c, 0);
          const previousRange = getCycleRangeForCard(c, -1);
          return {
            id: c.id,
            name: c.name,
            current: {
              ...getDebtForCycle(0, undefined, c.id),
              cycleDates: `${safeFormat(currentRange.start, "dd/MM")} - ${safeFormat(subDays(currentRange.end, 1), "dd/MM")}`,
            },
            previous: {
              ...getDebtForCycle(-1, undefined, c.id),
              cycleDates: `${safeFormat(previousRange.start, "dd/MM")} - ${safeFormat(subDays(previousRange.end, 1), "dd/MM")}`,
            },
          };
        }),
      };
    });

    // Global totals for the CURRENT cycle across all members
    const totalSpent = memberBreakdown.reduce(
      (acc, m) => acc + m.current.totalSpent,
      0,
    );
    const totalCashback = memberBreakdown.reduce(
      (acc, m) => acc + m.current.totalCashback,
      0,
    );
    const getCategoryDataForCycle = (offset: number) => {
      const cycleTransactions = transactions.filter(
        (t) =>
          (!t.type || t.type === "standard" || t.type === "installment") &&
          isTransInCycle(t, offset),
      );

      return CATEGORIES.map((cat) => ({
        name: cat.label,
        value: cycleTransactions
          .filter((t) => t.category === cat.value)
          .reduce((acc, t) => acc + (Number(t.amount) || 0), 0),
      })).filter((d) => d.value > 0);
    };

    const categoryData = {
      current: getCategoryDataForCycle(0),
      previous: getCategoryDataForCycle(-1),
    };

    // Per-card current statement balance
    const baseCardBalances = cards.map((card) => {
      const sType = card.statementType || "cycle";
      const settlementDays = Number(card.settlementDays) || 0;

      let lastStatementDate: Date;
      let nextStatementDate: Date;
      let prevStatementDate: Date;

      if (sType === "monthly") {
        // Monthly: Calendar month boundaries
        lastStatementDate = startOfMonth(now);
        nextStatementDate = addDays(endOfMonth(now), 1);
        prevStatementDate = startOfMonth(subDays(lastStatementDate, 1));
      } else {
        // Cycle: User-defined statement day
        const sDay = Number(card.statementDay) || 1;
        lastStatementDate = getSafeDateObject(
          now.getFullYear(),
          now.getMonth(),
          sDay,
        );
        if (now.getDate() < sDay) {
          lastStatementDate.setMonth(lastStatementDate.getMonth() - 1);
        }
        nextStatementDate = getSafeDateObject(
          lastStatementDate.getFullYear(),
          lastStatementDate.getMonth() + 1,
          sDay,
        );
        prevStatementDate = getSafeDateObject(
          lastStatementDate.getFullYear(),
          lastStatementDate.getMonth() - 1,
          sDay,
        );
      }

      // Helper for cycle filtering based on user's rule
      const isInCycle = (t: Transaction, start: Date, end: Date) => {
        const dParsed = parseISO(t.date);
        if (!isValid(dParsed)) return false;

        let adjustedDate = dParsed;
        if (t.statementCycleOffset) {
          adjustedDate = addMonths(adjustedDate, t.statementCycleOffset);
        }

        if (sType === "monthly") {
          return isWithinInterval(adjustedDate, {
            start: startOfDay(start),
            end: endOfDay(subDays(end, 1)),
          });
        } else {
          const settledDate = startOfDay(addDays(adjustedDate, settlementDays));
          // Bank standard: Statement cycle [start + 1, end]
          return (
            isAfter(settledDate, startOfDay(start)) &&
            (isBefore(settledDate, startOfDay(end)) ||
              isEqual(settledDate, startOfDay(end)))
          );
        }
      };

      // Amount from previous statement
      const lastStatementAmount = transactions
        .filter((t) => t.cardId === card.id)
        .filter((t) => isInCycle(t, prevStatementDate, lastStatementDate))
        .reduce((acc, t) => {
          const amt = Math.abs(Number(t.amount) || 0);
          const type = t.type || "standard";
          // Formula: (Standard + Installment) - (Cancelled + Refund + Others)
          if (type === "standard" || type === "installment") return acc + amt;
          // For statement balance, we subtract all credits
          if (
            [
              "refund",
              "cancelled",
              "giao_dich_bi_huy",
              "nhan_hoan_tien",
              "cashback_redemption",
              "payment",
            ].includes(type) &&
            type !== "payment"
          )
            return acc - amt;
          return acc;
        }, 0);

      const paymentsSinceLastStatement = transactions
        .filter((t) => t.cardId === card.id && t.type === "payment")
        .filter((t) => {
          const dParsed = t.date ? parseISO(t.date) : null;
          // For monthly, payments within the month. For cycle, payments after statement date.
          if (sType === "monthly") {
            return (
              dParsed &&
              isValid(dParsed) &&
              isWithinInterval(dParsed, {
                start: startOfMonth(now),
                end: endOfMonth(now),
              })
            );
          }
          return (
            dParsed &&
            isValid(dParsed) &&
            (isAfter(dParsed, startOfDay(lastStatementDate)) ||
              isEqual(dParsed, startOfDay(lastStatementDate)))
          );
        })
        .reduce((acc, t) => acc + Math.abs(Number(t.amount) || 0), 0);

      const lastStatementPaid =
        paymentsSinceLastStatement >= lastStatementAmount &&
        lastStatementAmount > 0;

      // Current cycle spending
      const currentCycleSpend = transactions
        .filter((t) => t.cardId === card.id)
        .filter((t) => isInCycle(t, lastStatementDate, nextStatementDate))
        .reduce((acc, t) => {
          const amt = Math.abs(Number(t.amount) || 0);
          const type = t.type || "standard";
          if (type === "standard" || type === "installment") return acc + amt;
          if (
            [
              "refund",
              "cancelled",
              "giao_dich_bi_huy",
              "nhan_hoan_tien",
              "cashback_redemption",
            ].includes(type)
          )
            return acc - amt;
          return acc;
        }, 0);

      const grace = Number(card.gracePeriod) || 15;
      const paymentDueDate = addDays(
        lastStatementPaid ? nextStatementDate : lastStatementDate,
        sType === "monthly" ? grace - 1 : grace,
      );
      const nextPaymentDueDate = addDays(
        nextStatementDate,
        sType === "monthly" ? grace - 1 : grace,
      );
      const prevPaymentDueDate = addDays(
        lastStatementDate,
        sType === "monthly" ? grace - 1 : grace,
      );
      const displayAmount = lastStatementPaid
        ? currentCycleSpend
        : lastStatementAmount;
      const balance = currentCycleSpend; // For backward compatibility with other components

      const cashback = transactions
        .filter((t) => t.cardId === card.id)
        .reduce((acc, t) => {
          const cb = Math.abs(Number(t.cashback) || 0);
          const amt = Math.abs(Number(t.amount) || 0);
          const type = t.type || "standard";

          if (type === "standard" || type === "installment") {
            return acc + cb;
          }
          if (type === "cashback_redemption" || type === "nhan_hoan_tien") {
            return acc - (cb || amt);
          }
          if (["refund", "cancelled", "giao_dich_bi_huy"].includes(type)) {
            return acc - cb;
          }
          return acc;
        }, 0);

      // Current cycle cashback for accurate limit tracking
      const currentCycleCashback = transactions
        .filter((t) => t.cardId === card.id)
        .filter((t) => {
          const dParsed = t.date ? parseISO(t.date) : null;
          if (!dParsed || !isValid(dParsed)) return false;
          const settledDate = addDays(dParsed, settlementDays);
          // Banks cap by Statement cycle
          return (
            isAfter(settledDate, lastStatementDate) &&
            !isAfter(settledDate, nextStatementDate)
          );
        })
        .reduce((acc, t) => {
          const cb = Math.abs(Number(t.cashback) || 0);
          const type = t.type || "standard";
          if (type === "standard" || type === "installment") return acc + cb;
          if (["refund", "cancelled", "giao_dich_bi_huy"].includes(type))
            return acc - cb;
          return acc;
        }, 0);

      return {
        ...card,
        balance,
        totalOutstanding: transactions
          .filter((t) => t.cardId === card.id)
          .reduce((acc, t) => {
            const amt = Math.abs(Number(t.amount) || 0);
            const type = t.type || "standard";
            if (type === "standard" || type === "installment") {
              return acc + amt;
            }
            if (
              [
                "refund",
                "cancelled",
                "giao_dich_bi_huy",
                "nhan_hoan_tien",
                "cashback_redemption",
                "payment",
              ].includes(type)
            ) {
              return acc - amt;
            }
            return acc;
          }, 0),
        statementDate: nextStatementDate,
        paymentDueDate,
        nextPaymentDueDate,
        prevPaymentDueDate,
        displayAmount,
        lastStatementAmount: Math.max(0, lastStatementAmount),
        lastStatementPaid,
        currentCycleSpend,
        totalCashback: cashback,
        currentCycleCashback: card.monthlyCashbackCap
          ? Math.min(currentCycleCashback, card.monthlyCashbackCap)
          : currentCycleCashback,
        statementPeriodStart:
          sType === "monthly"
            ? lastStatementDate
            : addDays(lastStatementDate, 1),
        statementPeriodEnd:
          sType === "monthly"
            ? endOfMonth(lastStatementDate)
            : nextStatementDate,
        prevStatementPeriodStart: (sType === "monthly"
          ? prevStatementDate
          : addDays(prevStatementDate, 1)
        ).toISOString(),
        prevStatementPeriodEnd: (sType === "monthly"
          ? endOfMonth(prevStatementDate)
          : lastStatementDate
        ).toISOString(),
      };
    });

    // Handle shared limits
    const sharedLimitOutstanding = baseCardBalances.reduce(
      (acc, card) => {
        if (!card.sharedLimitId) return acc;
        acc[card.sharedLimitId] =
          (acc[card.sharedLimitId] || 0) + card.totalOutstanding;
        return acc;
      },
      {} as Record<string, number>,
    );

    const cardBalances = baseCardBalances.map((card) => ({
      ...card,
      effectiveBalance: card.sharedLimitId
        ? sharedLimitOutstanding[card.sharedLimitId]
        : card.totalOutstanding,
    }));

    // Upcoming Dues (cards with statement due or positive balance)
    const upcomingDues = cardBalances
      .filter((card) => {
        const isDebt =
          card.balance > 0 ||
          (card.lastStatementAmount > 0 && !card.lastStatementPaid);
        return (
          isDebt &&
          isValid(card.paymentDueDate) &&
          isAfter(card.paymentDueDate, now)
        );
      })
      .sort(
        (a, b) =>
          (a.paymentDueDate.getTime() || 0) - (b.paymentDueDate.getTime() || 0),
      );

    // Urgent Dues (Top 4 soonest deadlines)
    const urgentDues = upcomingDues.slice(0, 4);

    // Take top 3 suggestions
    const optimizationSuggestions = CATEGORIES.map((cat) => {
      if (cat.value === "Other") return null;

      const bestMapping = cards
        .map((card) => {
          const rules = card.cashbackRules || [];
          const rule = rules.find(
            (r) =>
              r &&
              r.categories &&
              Array.isArray(r.categories) &&
              r.categories.includes(cat.value as Category),
          );
          const rate = rule ? rule.rate : Number(card.defaultRate) || 0;
          return { cardName: card.name, rate, categoryLabel: cat.label };
        })
        .sort((a, b) => (Number(b.rate) || 0) - (Number(a.rate) || 0))[0];

      // Only suggest if rate > 0.5%
      return bestMapping && bestMapping.rate > 0.5 ? bestMapping : null;
    })
      .filter(Boolean)
      .sort((a, b) => (b?.rate || 0) - (a?.rate || 0))
      .slice(0, 3);

    // Monthly Spending Trend (last 6 months)
    const last6Months = Array.from({ length: 6 })
      .map((_, i) => {
        const monthDate = startOfMonth(
          new Date(now.getFullYear(), now.getMonth() - i, 1),
        );
        const monthTransactions = transactions.filter((t) => {
          const tDate = t.date ? parseISO(t.date) : null;
          return (
            tDate &&
            isValid(tDate) &&
            isWithinInterval(tDate, {
              start: monthDate,
              end: endOfMonth(monthDate),
            })
          );
        });
        return {
          month: safeFormat(monthDate, "MM/yy"),
          amount: monthTransactions.reduce((acc, t) => {
            const amt = Math.abs(Number(t.amount) || 0);
            const type = t.type || "standard";
            if (type === "standard" || type === "installment") return acc + amt;
            if (["refund", "cancelled", "giao_dich_bi_huy"].includes(type))
              return acc - amt;
            // 'nhan_hoan_tien' and 'cashback_redemption' are excluded from spending reduction
            // as they are more like income or usage of rewards.
            return acc;
          }, 0),
          cashback: monthTransactions.reduce((acc, t) => {
            const type = t.type || "standard";
            const cb = Math.abs(
              type === "cashback_redemption" || type === "nhan_hoan_tien"
                ? Number(t.cashback) || Number(t.amount) || 0
                : Number(t.cashback) || 0,
            );

            if (type === "standard" || type === "installment") return acc + cb;
            // Refunds reduce earned cashback, redemptions consume the pool
            if (
              [
                "refund",
                "cancelled",
                "giao_dich_bi_huy",
                "nhan_hoan_tien",
                "cashback_redemption",
              ].includes(type)
            )
              return acc - cb;
            return acc;
          }, 0),
        };
      })
      .reverse();

    return {
      totalSpent,
      totalCashback,
      categoryData,
      upcomingDues,
      urgentDues,
      cardBalances,
      optimizationSuggestions,
      last6Months,
      memberBreakdown,
    };
  }, [transactions, cards, currentProfile]);

  const toggleSharing = async () => {
    if (!user || !currentProfile) return;
    const isEnabling = !currentProfile.shareEnabled;
    const newShareId =
      currentProfile.shareId || Math.random().toString(36).substring(2, 15);

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", user.uid);

      // Update profile with sharing info AND updatedAt to comply with rules
      batch.set(
        userRef,
        {
          shareEnabled: isEnabling,
          shareId: newShareId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      const mappingRef = doc(db, "share_mappings", newShareId);
      if (isEnabling) {
        // Mapping from shareId to userId
        batch.set(mappingRef, { userId: user.uid });
      } else {
        batch.delete(mappingRef);
      }

      await batch.commit();
      // State will be updated by onSnapshot listener automatically
    } catch (err) {
      console.error("Failed to toggle sharing:", err);
      alert("Không thể thay đổi trạng thái chia sẻ. Vui lòng thử lại.");
    }
  };

  const copyShareLink = () => {
    if (!currentProfile?.shareId) return;
    const url = `${window.location.origin}${window.location.pathname}?share=${currentProfile.shareId}`;
    navigator.clipboard.writeText(url);
    alert("Đã sao chép liên kết chia sẻ!");
  };

  const addMember = async (name: string) => {
    if (!user || !currentProfile) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    const members = currentProfile.members || ["Tôi"];
    if (members.includes(cleanName)) return;
    const newMembers = [...members, cleanName];

    try {
      await setDoc(
        doc(db, "users", user.uid),
        { members: newMembers },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const removeMember = async (name: string) => {
    if (!user || !currentProfile || name === "Tôi") return;
    const members = currentProfile.members || ["Tôi"];
    const newMembers = members.filter((m) => m !== name);

    try {
      await setDoc(
        doc(db, "users", user.uid),
        { members: newMembers },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const addMemberCategory = async (memberName: string, category: string) => {
    if (!user || !currentProfile) return;
    const cleanCat = category.trim();
    if (!cleanCat) return;

    const memberCategories = { ...(currentProfile.memberCategories || {}) };
    const memberCats = memberCategories[memberName] || [];
    if (memberCats.includes(cleanCat)) return;

    memberCategories[memberName] = [...memberCats, cleanCat];

    try {
      await setDoc(
        doc(db, "users", user.uid),
        { memberCategories },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to add member category:", err);
    }
  };

  const removeMemberCategory = async (memberName: string, category: string) => {
    if (!user || !currentProfile) return;
    const memberCategories = { ...(currentProfile.memberCategories || {}) };
    if (!memberCategories[memberName]) return;

    memberCategories[memberName] = memberCategories[memberName].filter(
      (c) => c !== category,
    );

    try {
      await setDoc(
        doc(db, "users", user.uid),
        { memberCategories },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to remove member category:", err);
    }
  };

  const filteredHistoryTransactions = useMemo(() => {
    let list = [...transactions];
    // Filter by card if selected
    if (selectedCardId !== "all") {
      list = list.filter((t) => t.cardId === selectedCardId);
    }

    if (selectedDate) {
      list = list.filter((t) => isSameDay(parseISO(t.date), selectedDate));
    } else {
      // Filter by current month of transaction calendar if no date is selected
      list = list.filter((t) => {
        const tDate = parseISO(t.date);
        return (
          tDate.getMonth() === calendarDate.getMonth() &&
          tDate.getFullYear() === calendarDate.getFullYear()
        );
      });
    }
    // Sort from newest to oldest
    return list.sort((a, b) => {
      const da = b.date ? parseISO(b.date).getTime() : 0;
      const db = a.date ? parseISO(a.date).getTime() : 0;
      return (da || 0) - (db || 0);
    });
  }, [transactions, selectedDate, selectedCardId, calendarDate]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {viewOnly && (
        <div className="bg-blue-600/20 border-b border-blue-500/30 p-2 text-center text-[9px] font-black uppercase tracking-[0.3em] text-blue-400 fixed top-0 left-0 right-0 z-[101] backdrop-blur-md">
          Chùm thẻ của {currentProfile?.displayName || "Người dùng"} • Chế độ
          xem (Chỉ đọc)
        </div>
      )}
      <div
        className={cn(
          "max-w-7xl mx-auto px-4 md:px-8 pb-32",
          viewOnly ? "pt-16" : "pt-8",
        )}
      >
        {showDomainWarning && !user && (
          <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-start gap-4">
            <AlertCircle
              className="text-orange-500 shrink-0 mt-0.5"
              size={18}
            />
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-orange-500 mb-1">
                Lưu ý về đồng bộ
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bạn đang sử dụng link chia sẻ. Tính năng "Đồng bộ đám mây"
                (Google Login) có thể bị chặn bởi trình duyệt do chính sách bảo
                mật tên miền.
                <br />
                <span className="font-bold text-slate-300">
                  Dữ liệu của bạn hiện được lưu tạm thời trên trình duyệt này
                  (LocalStorage).
                </span>
              </p>
            </div>
          </div>
        )}
        {showSyncPrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-6 bg-blue-600 rounded-3xl text-white shadow-xl shadow-blue-500/20 flex flex-col md:flex-row items-center gap-6 justify-between border border-white/10"
          >
            <div className="flex items-center gap-4">
              <div className="size-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <RefreshCw size={24} />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-tight text-white mb-1 leading-none">
                  Phát hiện dữ liệu cục bộ!
                </p>
                <p className="text-[11px] text-blue-100 opacity-90 leading-relaxed max-w-md">
                  Bạn có các thẻ và giao dịch cũ. Bạn có muốn đưa chúng lên tài
                  khoản đám mây vừa đăng nhập không?
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button
                onClick={() => setShowSyncPrompt(false)}
                className="flex-1 md:flex-none px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
              >
                Bỏ qua
              </button>
              <button
                onClick={handleManualSync}
                disabled={isLoadingSync}
                className="flex-1 md:flex-none px-6 py-3 bg-white text-blue-600 hover:bg-blue-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {isLoadingSync ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Đồng bộ ngay
              </button>
            </div>
          </motion.div>
        )}

        <div className="flex justify-end gap-3 mb-6 items-center">
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2"
            >
              <Download size={14} /> Tải ứng dụng
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-3 bg-slate-900/50 p-2 pr-4 rounded-2xl border border-slate-700">
              <img
                src={user.photoURL || ""}
                alt={user.displayName || ""}
                className="size-8 rounded-xl border border-slate-700"
                referrerPolicy="no-referrer"
              />
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase leading-none mb-1">
                  Đã đồng bộ
                </p>
                <p className="text-xs font-black uppercase text-white truncate max-w-[120px]">
                  {user.displayName || "Thành viên"}
                </p>
              </div>
              <button
                onClick={logout}
                className="ml-2 p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
              >
                <Settings size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
            >
              <Sparkles size={14} /> Đồng bộ đám mây
            </button>
          )}
        </div>

        {loading && user && (
          <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 className="text-blue-500 animate-spin mb-4" size={48} />
            <p className="text-sm font-black uppercase tracking-widest text-slate-400 animate-pulse">
              Đang đồng bộ dữ liệu...
            </p>
          </div>
        )}

        <main className="max-w-6xl mx-auto pb-24">
          <header className="mb-8 pl-4 border-l-4 border-blue-500">
            <h1 className="text-4xl font-black tracking-tight mb-1 uppercase">
              {activeTab === "dashboard" && "Tổng quan"}
              {activeTab === "add" && "Chi tiêu mới"}
              {activeTab === "history" && "Dòng thời gian"}
              {activeTab === "settings" && "Kho lưu trữ thẻ"}
              {activeTab === "statement" && "Kiểm tra sao kê"}
            </h1>
            <p className="text-slate-400 font-medium text-sm">
              {activeTab === "dashboard" &&
                (viewOnly
                  ? `Đang xem tổng quan chi tiêu của ${currentProfile?.displayName || "bạn bè"}.`
                  : "Tối ưu hóa hoàn tiền và quản lý hạn mức.")}
              {activeTab === "add" && "Ghi nhanh giao dịch vừa thực hiện."}
              {activeTab === "history" &&
                "Chi tiết các khoản chi qua từng loại thẻ."}
              {activeTab === "settings" && "Thay đổi ưu đãi ngân hàng."}
              {activeTab === "statement" && "Đối chiếu giao dịch với sao kê thực tế."}
            </p>
          </header>

          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="grid grid-cols-12 gap-4"
              >
                <div className="col-span-12 md:col-span-4 lg:col-span-3">
                  <div className="bento-card p-5 h-full space-y-4">
                    <div className="flex justify-between items-start">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Tài chính
                      </p>
                      <div className="p-2 bg-slate-900 border border-slate-700/50 rounded-xl shadow-inner">
                        <Wallet className="text-blue-400" size={18} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                        Tổng hoàn tiền
                      </p>
                      <p className="text-xl font-black text-emerald-500 tabular-nums">
                        {formatCurrency(metrics.totalCashback)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                        Tổng chi tiêu
                      </p>
                      <p className="text-xl font-black text-white tabular-nums">
                        {formatCurrency(metrics.totalSpent)}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-0.5">
                        {transactions.length} Giao dịch
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-span-12 md:col-span-8 lg:col-span-9">
                  <div className="bento-card h-full justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
                        Hạn trả nợ gần nhất
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {metrics.urgentDues.length > 0 ? (
                          metrics.urgentDues.map((card) => (
                            <div
                              key={card.id}
                              className="flex justify-between items-center bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl transition-all hover:bg-orange-500/20"
                            >
                              <div className="flex items-center gap-2">
                                <div className="p-2 bg-orange-500/20 rounded-lg shrink-0">
                                  <Calendar
                                    size={14}
                                    className="text-orange-500"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black uppercase text-orange-400 truncate mb-0.5">
                                    {card.name}
                                  </p>
                                  <p className="text-[9px] font-bold text-slate-500 whitespace-nowrap">
                                    Hạn:{" "}
                                    {safeFormat(
                                      card.paymentDueDate,
                                      "dd/MM/yyyy",
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <p className="text-xs font-black text-white tabular-nums leading-none mb-1">
                                  {formatCurrency(card.displayAmount)}
                                </p>
                                <p className="text-[8px] font-bold text-orange-500 uppercase whitespace-nowrap">
                                  {isValid(card.paymentDueDate)
                                    ? `Còn ${Math.max(0, Math.ceil((card.paymentDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} ngày`
                                    : "---"}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-slate-600 h-full">
                            <div className="relative mb-2">
                              <CheckCircle2
                                size={32}
                                className="opacity-20 translate-x-0.5"
                              />
                              <div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full" />
                            </div>
                            <p className="text-xs font-black uppercase tracking-widest italic opacity-50">
                              Sẵn sàng! Không có nợ gấp
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4">
                      <CardSection
                        title="Dư nợ theo thành viên"
                        icon={<Wallet size={18} />}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <button
                            onClick={() => setMemberViewMode("previous")}
                            className="p-3 -m-3 text-slate-500 hover:text-white"
                          >
                            <ChevronLeft size={24} />
                          </button>
                          <p className="text-sm font-bold uppercase text-slate-400">
                            {memberViewMode === "current"
                              ? "Kỳ hiện tại"
                              : "Kỳ trước"}
                          </p>
                          <button
                            onClick={() => setMemberViewMode("current")}
                            className="p-3 -m-3 text-slate-500 hover:text-white"
                          >
                            <ChevronLeft size={24} className="rotate-180" />
                          </button>
                        </div>
                        <div className="space-y-4">
                          {metrics.memberBreakdown.map((member) => {
                            const data = member[memberViewMode];
                            return (
                              <div
                                key={member.name}
                                className="flex flex-col p-4 bg-slate-900 border border-slate-700/50 rounded-2xl gap-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={cn(
                                        "size-10 rounded-xl flex items-center justify-center font-black text-sm",
                                        data.debt > 0
                                          ? "bg-orange-500/10 text-orange-500"
                                          : "bg-emerald-500/10 text-emerald-500",
                                      )}
                                    >
                                      {member.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-100">
                                        {member.name}
                                      </p>
                                      <p className="text-[10px] text-slate-500 font-bold uppercase text-left">
                                        Dư nợ thành viên
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p
                                      className={cn(
                                        "text-xl font-black tabular-nums leading-none mb-1",
                                        data.debt > 0
                                          ? "text-orange-400"
                                          : "text-emerald-400",
                                      )}
                                    >
                                      {formatCurrency(data.debt)}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase">
                                      Hoàn {formatCurrency(data.totalCashback)}
                                    </p>
                                  </div>
                                </div>

                                {/* Breakdown Tabs */}
                                {(member.categories?.length > 0 ||
                                  member.cards?.length > 0) && (
                                  <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
                                    <div className="flex bg-slate-800/50 p-1 rounded-lg mb-1">
                                      <button
                                        onClick={() =>
                                          setMemberTabs((prev) => ({
                                            ...prev,
                                            [member.name]: "category",
                                          }))
                                        }
                                        className={cn(
                                          "px-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors flex-1",
                                          !memberTabs[member.name] ||
                                            memberTabs[member.name] ===
                                              "category"
                                            ? "bg-slate-700 text-white shadow-sm"
                                            : "text-slate-400 hover:text-slate-300",
                                        )}
                                      >
                                        Theo danh mục
                                      </button>
                                      <button
                                        onClick={() =>
                                          setMemberTabs((prev) => ({
                                            ...prev,
                                            [member.name]: "card",
                                          }))
                                        }
                                        className={cn(
                                          "px-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-colors flex-1",
                                          memberTabs[member.name] === "card"
                                            ? "bg-slate-700 text-white shadow-sm"
                                            : "text-slate-400 hover:text-slate-300",
                                        )}
                                      >
                                        Theo thẻ
                                      </button>
                                    </div>

                                    {!memberTabs[member.name] ||
                                    memberTabs[member.name] === "category" ? (
                                      member.categories.filter(
                                        (c) =>
                                          c[memberViewMode].debt > 0 ||
                                          c[memberViewMode].totalSpent > 0,
                                      ).length > 0 ? (
                                        member.categories
                                          .filter(
                                            (c) =>
                                              c[memberViewMode].debt > 0 ||
                                              c[memberViewMode].totalSpent > 0,
                                          )
                                          .map((cat) => (
                                            <div
                                              key={cat.name}
                                              className="flex justify-between items-center bg-slate-800/30 p-2 rounded-lg"
                                            >
                                              <p
                                                className="text-xs font-bold text-slate-400 max-w-[120px] truncate"
                                                title={cat.name}
                                              >
                                                {cat.name}
                                              </p>
                                              <p
                                                className={cn(
                                                  "text-xs font-black tabular-nums",
                                                  cat[memberViewMode].debt > 0
                                                    ? "text-orange-400"
                                                    : "text-slate-500",
                                                )}
                                              >
                                                {formatCurrency(
                                                  cat[memberViewMode].debt,
                                                )}
                                              </p>
                                            </div>
                                          ))
                                      ) : (
                                        <div className="text-center p-2 text-xs text-slate-500">
                                          {" "}
                                          Không có chi tiêu{" "}
                                        </div>
                                      )
                                    ) : member.cards.filter(
                                        (c) =>
                                          c[memberViewMode].debt > 0 ||
                                          c[memberViewMode].totalSpent > 0,
                                      ).length > 0 ? (
                                      member.cards
                                        .filter(
                                          (c) =>
                                            c[memberViewMode].debt > 0 ||
                                            c[memberViewMode].totalSpent > 0,
                                        )
                                        .map((cCard) => (
                                          <div
                                            key={cCard.id}
                                            className="flex flex-col bg-slate-800/30 p-2 rounded-lg gap-1"
                                          >
                                            <div className="flex justify-between items-center gap-2">
                                              <p
                                                className="text-xs font-bold text-slate-400 truncate flex-1"
                                                title={cCard.name}
                                              >
                                                {cCard.name}
                                              </p>
                                              <p className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                                                {cCard[memberViewMode].cycleDates}
                                              </p>
                                              <p
                                                className={cn(
                                                  "text-xs font-black tabular-nums",
                                                  cCard[memberViewMode].debt > 0
                                                    ? "text-orange-400"
                                                    : "text-slate-500",
                                                )}
                                              >
                                                {formatCurrency(
                                                  cCard[memberViewMode].debt,
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        ))
                                    ) : (
                                      <div className="text-center p-2 text-xs text-slate-500">
                                        {" "}
                                        Không có chi tiêu{" "}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardSection>
                    </div>
                  </div>
                </div>

                <div className="col-span-12 lg:col-span-12 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {metrics.cardBalances.map((card) => (
                      <div
                        key={card.id}
                        className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50 hover:border-blue-500/50 transition-all group"
                      >
                        <div className="flex items-center justify-between mb-3 text-sm">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-1.5 h-8 rounded-full"
                              style={{
                                backgroundColor:
                                  COLORS[
                                    Math.abs(card.id.length) % COLORS.length
                                  ],
                              }}
                            />
                            <div>
                              <p className="font-bold tracking-tight text-slate-100">
                                {card.name}
                              </p>
                              <p className="text-[10px] text-slate-500 font-bold uppercase">
                                {card.bank}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={cn(
                                "font-black text-xl leading-none mb-1 tabular-nums transition-colors",
                                (card.minSpend || 0) > 0
                                  ? card.currentCycleSpend >=
                                    (card.minSpend || 0)
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                                  : "text-white",
                              )}
                            >
                              {formatCurrency(card.currentCycleSpend)}
                            </p>
                            <p className="text-[10px] text-emerald-500 font-bold uppercase">
                              +{formatCurrency(card.currentCycleCashback || 0)}{" "}
                              Hoàn tiền
                            </p>
                            {card.limit && card.limit > 0 && (
                              <div className="mt-2 space-y-1">
                                <div className="flex justify-end items-center text-[9px] font-black uppercase">
                                  <span className="text-blue-400">
                                    {formatCurrency(card.effectiveBalance)} /{" "}
                                    {formatCurrency(card.limit)}
                                  </span>
                                </div>
                                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{
                                      width: `${Math.min(100, Math.max(0, (card.effectiveBalance / card.limit) * 100))}%`,
                                    }}
                                    className={cn(
                                      "h-full rounded-full transition-all duration-1000",
                                      card.effectiveBalance / card.limit > 0.9
                                        ? "bg-rose-500"
                                        : "bg-blue-500",
                                    )}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800">
                          <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                              Ngày sao kê
                            </p>
                            <p className="text-[11px] font-black text-slate-300">
                              {safeFormat(card.statementDate, "dd/MM/yyyy")}
                            </p>
                          </div>
                          <div className="space-y-0.5 text-right">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                              Hạn trả nợ
                            </p>
                            <p className="text-[11px] font-black text-orange-400">
                              {safeFormat(
                                card.nextPaymentDueDate,
                                "dd/MM/yyyy",
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-center">
                          <div className="text-left">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                              Kỳ sao kê
                            </p>
                            <p className="text-[10px] font-medium text-slate-400">
                              {safeFormat(
                                card.prevStatementPeriodStart,
                                "dd/MM",
                              )}{" "}
                              -{" "}
                              {safeFormat(card.prevStatementPeriodEnd, "dd/MM")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                              TT trước{" "}
                              {safeFormat(
                                card.prevPaymentDueDate
                                  ? subDays(card.prevPaymentDueDate, 1)
                                  : null,
                                "dd/MM",
                              )}
                            </p>
                            <p
                              className={cn(
                                "text-[11px] font-black",
                                card.lastStatementPaid
                                  ? "text-emerald-400"
                                  : "text-rose-400",
                              )}
                            >
                              {formatCurrency(card.lastStatementAmount || 0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <p className="col-span-2 text-[10px] text-slate-600 italic text-center py-8">
                        Chưa có thẻ nào được thêm.
                      </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <CardSection
                      title="Sao kê chưa thanh toán"
                      icon={<AlertCircle size={18} className="text-rose-400" />}
                    >
                      <div className="text-xs space-y-3">
                        <p className="text-slate-400">
                          Các khoản sao kê đã chốt nhưng chưa ghi nhận thanh toán trong ứng dụng:
                        </p>
                        {metrics.cardBalances.filter(
                          (c) => c.lastStatementAmount > 0 && !c.lastStatementPaid,
                        ).length > 0 ? (
                          metrics.cardBalances
                            .filter(
                              (c) =>
                                c.lastStatementAmount > 0 && !c.lastStatementPaid,
                            )
                            .map((card) => (
                              <div
                                key={card.id}
                                className="p-3 bg-slate-900 border border-slate-700/50 rounded-xl flex items-center justify-between hover:bg-slate-800 transition-colors"
                              >
                                <div className="flex flex-col">
                                  <p className="font-bold text-white">
                                    {card.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                    Kỳ chốt:{" "}
                                    {safeFormat(
                                      card.prevStatementPeriodEnd,
                                      "dd/MM/yyyy",
                                    )}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-rose-400">
                                    {formatCurrency(card.lastStatementAmount)}
                                  </p>
                                  <p className="text-[9px] font-black bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20 uppercase">
                                    Hạn: {safeFormat(card.paymentDueDate, "dd/MM")}
                                  </p>
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-900/30 border border-dashed border-slate-800 rounded-xl">
                            <CheckCircle2
                              className="text-emerald-500 mb-2"
                              size={24}
                            />
                            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                              Đã thanh toán hết
                            </p>
                            <p className="text-[10px] text-slate-600 italic mt-1">
                              Không có sao kê nào tồn đọng.
                            </p>
                          </div>
                        )}
                      </div>
                    </CardSection>

                    <CardSection
                      title="Phân bổ"
                      icon={<PieChartIcon size={18} />}
                    >
                      <div className="flex flex-col md:flex-row gap-4 mb-2">
                        <div className="flex-1 flex flex-col pt-2">
                          <p className="text-[10px] font-bold uppercase text-slate-500 text-center mb-1">
                            Kỳ trước
                          </p>
                          {metrics.categoryData.previous.length > 0 ? (
                            <div className="h-[140px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={metrics.categoryData.previous}
                                    innerRadius={30}
                                    outerRadius={50}
                                    paddingAngle={4}
                                    dataKey="value"
                                    stroke="none"
                                  >
                                    {metrics.categoryData.previous.map(
                                      (entry, index) => (
                                        <Cell
                                          key={`cell-${index}`}
                                          fill={COLORS[index % COLORS.length]}
                                        />
                                      ),
                                    )}
                                  </Pie>
                                  <Tooltip
                                    formatter={(value: number) =>
                                      formatCurrency(value)
                                    }
                                    contentStyle={{
                                      backgroundColor: "#0f172a",
                                      border: "none",
                                      borderRadius: "12px",
                                      fontSize: "12px",
                                      padding: "8px",
                                    }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="h-[140px] flex items-center justify-center">
                              <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">
                                Trống
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="hidden md:block w-px bg-slate-800 self-stretch my-2"></div>

                        <div className="flex-1 flex flex-col pt-2">
                          <p className="text-[10px] font-bold uppercase text-slate-500 text-center mb-1">
                            Kỳ hiện tại
                          </p>
                          {metrics.categoryData.current.length > 0 ? (
                            <div className="h-[140px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={metrics.categoryData.current}
                                    innerRadius={30}
                                    outerRadius={50}
                                    paddingAngle={4}
                                    dataKey="value"
                                    stroke="none"
                                  >
                                    {metrics.categoryData.current.map(
                                      (entry, index) => (
                                        <Cell
                                          key={`cell-${index}`}
                                          fill={COLORS[index % COLORS.length]}
                                        />
                                      ),
                                    )}
                                  </Pie>
                                  <Tooltip
                                    formatter={(value: number) =>
                                      formatCurrency(value)
                                    }
                                    contentStyle={{
                                      backgroundColor: "#0f172a",
                                      border: "none",
                                      borderRadius: "12px",
                                      fontSize: "12px",
                                      padding: "8px",
                                    }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="h-[140px] flex items-center justify-center">
                              <p className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">
                                Trống
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardSection>

                    <CardSection
                      title="Xu hướng chi tiêu"
                      icon={<BarChartIcon size={18} />}
                    >
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={metrics.last6Months}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#334155"
                              opacity={0.3}
                            />
                            <XAxis
                              dataKey="month"
                              fontSize={10}
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "#64748b" }}
                              dy={10}
                            />
                            <Tooltip
                              cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                              contentStyle={{
                                backgroundColor: "#0f172a",
                                border: "none",
                                borderRadius: "12px",
                                fontSize: "12px",
                                padding: "8px",
                              }}
                              formatter={(value: number) =>
                                formatCurrency(value)
                              }
                            />
                            <Bar
                              dataKey="amount"
                              fill="#3b82f6"
                              radius={[4, 4, 0, 0]}
                              barSize={20}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardSection>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "add" && (
              <motion.div
                key="add"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="max-w-xl mx-auto"
              >
                {cards.length === 0 ? (
                  <div className="bento-card p-12 flex flex-col items-center justify-center text-center">
                    <div className="size-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-6">
                      <CreditCard size={32} />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight mb-2">
                      Bạn chưa có thẻ nào
                    </h3>
                    <p className="text-slate-500 text-sm mb-8 italic">
                      Vui lòng thêm thẻ trong mục "Thẻ" hoặc dùng thẻ mẫu trước
                      khi ghi chép chi tiêu.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setActiveTab("settings")}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Xem mục Thẻ
                      </button>
                      {user && (
                        <button
                          onClick={initializeDefaultCardsTrigger}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                        >
                          Dùng thẻ mẫu
                        </button>
                      )}
                    </div>
                  </div>
                ) : editingTransaction ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => setEditingTransaction(null)}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 flex items-center gap-1 transition-colors"
                      >
                        <ChevronLeft size={18} /> Quay lại
                      </button>
                      <h2 className="text-xl font-bold uppercase tracking-tight">
                        Sửa Giao Dịch
                      </h2>
                    </div>
                    <TransactionForm
                      cards={cards}
                      initialData={editingTransaction}
                      onSubmit={updateTransaction}
                      members={currentProfile?.members || ["Tôi"]}
                      memberCategories={currentProfile?.memberCategories || {}}
                    />
                  </div>
                ) : (
                  <TransactionForm
                    cards={cards}
                    onSubmit={addTransaction}
                    members={currentProfile?.members || ["Tôi"]}
                    memberCategories={currentProfile?.memberCategories || {}}
                  />
                )}
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <TransactionCalendar
                  transactions={transactions}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  currentDate={calendarDate}
                  onPrevMonth={() =>
                    setCalendarDate((prev) => addDays(startOfMonth(prev), -1))
                  }
                  onNextMonth={() =>
                    setCalendarDate((prev) => addDays(endOfMonth(prev), 1))
                  }
                />

                <div className="flex justify-between items-center mb-4 px-2 gap-4">
                  <select
                    className="bento-input text-[10px] py-1 px-2 w-48"
                    value={selectedCardId}
                    onChange={(e) => setSelectedCardId(e.target.value)}
                  >
                    <option value="all">Tất cả các thẻ</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name} - {card.bank}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                      {selectedDate
                        ? `Giao dịch ngày ${safeFormat(selectedDate, "dd/MM/yyyy")}`
                        : `Giao dịch tháng ${safeFormat(calendarDate, "MM/yyyy")}`}
                    </h3>
                    {selectedDate && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => setSelectedDate(null)}
                          className="text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Xem tất cả tháng
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <HistoryTable
                  transactions={filteredHistoryTransactions}
                  cards={cards}
                  onDelete={viewOnly ? () => {} : deleteTransaction}
                  onEdit={
                    viewOnly
                      ? () => {}
                      : (t) => {
                          setEditingTransaction(t);
                          setActiveTab("add");
                        }
                  }
                />
              </motion.div>
            )}

            {activeTab === "statement" && (
              <StatementTab
                transactions={transactions}
                cards={cards}
                members={currentProfile?.members || ["Tôi"]}
                onDelete={viewOnly ? () => {} : deleteTransaction}
                onEdit={
                  viewOnly
                    ? () => {}
                    : (t) => {
                        setEditingTransaction(t);
                        setActiveTab("add");
                      }
                }
              />
            )}

            {activeTab === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  isAddingCard || editingCard
                    ? ""
                    : "grid grid-cols-1 md:grid-cols-3 gap-4",
                )}
              >
                {!viewOnly && (isAddingCard || editingCard) ? (
                  <div className="col-span-full">
                    <div className="flex items-center gap-2 mb-6">
                      <button
                        onClick={() => setIsAddingCard(false)}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 flex items-center gap-1 transition-colors"
                      >
                        <ChevronLeft size={18} /> Quay lại
                      </button>
                      <h2 className="text-xl font-bold uppercase tracking-tight">
                        Thêm Thẻ Mới
                      </h2>
                    </div>
                    <CardForm
                      onSubmit={editingCard ? handleEditCard : handleAddCard}
                      initialData={editingCard || undefined}
                    />
                  </div>
                ) : (
                  <>
                    {cards.length === 0 && !viewOnly && user && (
                      <div className="col-span-full bento-card p-20 flex flex-col items-center justify-center border-dashed border-slate-700">
                        <CreditCard size={48} className="text-slate-700 mb-4" />
                        <h3 className="text-xl font-black uppercase tracking-tight mb-2">
                          Đám mây hiện đang trống
                        </h3>
                        <p className="text-slate-500 text-sm max-w-sm text-center mb-8 italic">
                          Bạn có muốn bắt đầu với dữ liệu trống hay khởi tạo bộ
                          5 thẻ phổ biến tại Việt Nam?
                        </p>
                        <div className="flex gap-4">
                          <button
                            onClick={() => setIsAddingCard(true)}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                          >
                            Bắt đầu từ đầu
                          </button>
                          <button
                            onClick={initializeDefaultCardsTrigger}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                          >
                            Dùng thẻ mẫu
                          </button>
                        </div>
                      </div>
                    )}
                    {cards.map((card) => (
                      <div
                        key={card.id}
                        className="bento-card group flex flex-col"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-black text-lg leading-tight uppercase tracking-tighter">
                              {card.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {card.bank}
                            </p>
                          </div>
                          {!viewOnly && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => setEditingCard(card)}
                                className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg transition-all"
                                title="Sửa"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => deleteCard(card.id)}
                                className="p-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                                title="Xoá"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-[10px] font-bold uppercase mb-4">
                          <div>
                            <p className="text-slate-500">Chốt</p>
                            <p>Ngày {card.statementDay}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Ân hạn</p>
                            <p>{card.gracePeriod} ngày</p>
                          </div>
                        </div>
                        <div className="flex-1 space-y-1">
                          {card.cashbackRules.slice(0, 3).map((rule, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-[11px] py-1 border-b border-slate-700/50"
                            >
                              <span className="text-slate-400 truncate max-w-[150px]">
                                {(rule.categories || [])
                                  .map(
                                    (cat) =>
                                      CATEGORIES.find((c) => c.value === cat)
                                        ?.label,
                                  )
                                  .join(", ")}
                              </span>
                              <span className="font-bold text-emerald-500 whitespace-nowrap">
                                {rule.rate}%
                              </span>
                            </div>
                          ))}
                          {card.cashbackRules.length === 0 && (
                            <p className="text-[10px] text-slate-500 italic">
                              Không có ưu đãi riêng.
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {!viewOnly && (
                      <>
                        <button
                          onClick={() => setIsAddingCard(true)}
                          className="bento-card border-dashed border-slate-700 hover:bg-blue-600/5 hover:border-blue-500/50 transition-all flex flex-col items-center justify-center p-8 group h-full min-h-[200px]"
                        >
                          <div className="size-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-500 group-hover:border-blue-400 transition-all group-hover:scale-110">
                            <Plus
                              className="text-slate-500 group-hover:text-white"
                              size={24}
                            />
                          </div>
                          <p className="text-xs font-black uppercase tracking-widest">
                            Thêm Thẻ Mới
                          </p>
                        </button>

                        {user && (
                          <div className="bento-card bg-slate-900/40 border-slate-800 flex flex-col justify-between overflow-hidden relative min-h-[200px]">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                              <Share2 size={48} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-4">
                                <Share2 size={18} className="text-blue-400" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                                  Chia sẻ chế độ xem
                                </h3>
                              </div>
                              <p className="text-[10px] text-slate-500 font-medium leading-relaxed mb-6">
                                Liên kết bí mật giúp người khác có thể xem chi
                                tiêu của bạn mà không cần đăng nhập.
                              </p>
                            </div>

                            <div className="space-y-4 pt-2">
                              <button
                                onClick={toggleSharing}
                                className={cn(
                                  "w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                                  currentProfile?.shareEnabled
                                    ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
                                )}
                              >
                                {currentProfile?.shareEnabled
                                  ? "Tắt chia sẻ"
                                  : "Kích hoạt chia sẻ"}
                              </button>

                              {currentProfile?.shareEnabled && (
                                <button
                                  onClick={copyShareLink}
                                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                                >
                                  <Copy size={12} /> Sao chép liên kết
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Member Management Section */}
                {!viewOnly && user && !isAddingCard && !editingCard && (
                  <div className="col-span-full mt-12 pt-12 border-t border-slate-800">
                    <div className="max-w-2xl mx-auto">
                      <header className="mb-8 flex justify-between items-end">
                        <div>
                          <h3 className="text-xl font-black uppercase tracking-tight mb-1">
                            Quản lý thành viên
                          </h3>
                          <p className="text-slate-500 text-sm italic text-left">
                            Thêm thành viên để phân chia dư nợ khi xài chung
                            thẻ.
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const name = prompt(
                              "Nhập tên thành viên (vợ, chồng, con...):",
                            );
                            if (name) addMember(name);
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                          <Plus size={14} /> Thêm người dùng
                        </button>
                      </header>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(currentProfile?.members || ["Tôi"]).map((member) => {
                          const categories =
                            currentProfile?.memberCategories?.[member] || [];
                          return (
                            <div
                              key={member}
                              className="p-4 bg-slate-900 border border-slate-700/50 rounded-2xl flex flex-col justify-between group gap-3 text-left"
                            >
                              <div className="flex flex-row items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                  <div className="size-10 bg-slate-800 rounded-xl flex items-center justify-center font-black text-blue-400">
                                    {member.charAt(0).toUpperCase()}
                                  </div>
                                  <p className="font-bold text-slate-100">
                                    {member}
                                  </p>
                                </div>
                                {member !== "Tôi" && (
                                  <button
                                    onClick={() => removeMember(member)}
                                    className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 items-center">
                                {categories.map((cat) => (
                                  <span
                                    key={cat}
                                    className="flex items-center gap-1 px-2 py-1 bg-slate-800 text-xs font-medium text-slate-300 rounded-lg whitespace-nowrap"
                                  >
                                    {cat}
                                    <button
                                      onClick={() =>
                                        removeMemberCategory(member, cat)
                                      }
                                      className="hover:text-rose-400 p-0.5"
                                      title="Xoá"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                ))}
                                <button
                                  onClick={() => {
                                    const name = prompt(
                                      `Nhập mục chi tiêu cho ${member} (vd: Cá nhân, Cho con...):`,
                                    );
                                    if (name) addMemberCategory(member, name);
                                  }}
                                  className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] font-black rounded-lg transition-colors flex items-center gap-1 uppercase tracking-wider"
                                >
                                  <Plus size={12} /> Thêm mục
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Navbar - Styled as a floating bento bar */}
        <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-2 flex gap-1 items-center z-50 rounded-2xl shadow-2xl">
          <NavItem
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
            icon={<TrendingUp size={20} />}
            label="Tổng quan"
          />
          {!viewOnly && (
            <NavItem
              active={activeTab === "add"}
              onClick={() => {
                setEditingTransaction(null);
                setActiveTab("add");
              }}
              icon={<Plus size={20} />}
              label="Thêm mới"
            />
          )}
          <NavItem
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            icon={<History size={20} />}
            label="Lịch sử"
          />
          <NavItem
            active={activeTab === "statement"}
            onClick={() => setActiveTab("statement")}
            icon={<FileText size={20} />}
            label="Sao kê"
          />
          <NavItem
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
            icon={<Settings size={20} />}
            label="Thẻ"
          />
        </nav>
      </div>
    </div>
  );
}

function CardForm({
  onSubmit,
  initialData,
}: {
  onSubmit: (card: Card) => void;
  initialData?: Card;
}) {
  const [name, setName] = useState(initialData?.name || "");
  const [bank, setBank] = useState(initialData?.bank || "");
  const [statementDay, setStatementDay] = useState(
    initialData?.statementDay || 15,
  );
  const [gracePeriod, setGracePeriod] = useState(
    initialData?.gracePeriod || 15,
  );
  const [limit, setLimit] = useState(initialData?.limit || 0);
  const [minSpend, setMinSpend] = useState(initialData?.minSpend || 0);
  const [cashbackRules, setCashbackRules] = useState<CashbackRule[]>(
    initialData?.cashbackRules || [],
  );
  const [defaultRate, setDefaultRate] = useState(initialData?.defaultRate || 0);
  const [monthlyCashbackCap, setMonthlyCashbackCap] = useState(
    initialData?.monthlyCashbackCap || 0,
  );
  const [sharedLimitId, setSharedLimitId] = useState(
    initialData?.sharedLimitId || "",
  );
  const [settlementDays, setSettlementDays] = useState(
    initialData?.settlementDays || 0,
  );
  const [statementType, setStatementType] = useState<"monthly" | "cycle">(
    initialData?.statementType || "cycle",
  );
  const [isSearching, setIsSearching] = useState(false);

  const searchCardDetails = async () => {
    if (!name || !bank) {
      alert("Vui lòng nhập tên thẻ và ngân hàng để tìm kiếm.");
      return;
    }
    setIsSearching(true);
    try {
      const response = await fetch("/api/card-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bank }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.statementDay) setStatementDay(data.statementDay);
      if (data.gracePeriod) setGracePeriod(data.gracePeriod);
      if (data.defaultRate !== undefined) setDefaultRate(data.defaultRate);
      if (data.minSpend !== undefined) setMinSpend(data.minSpend || 0);
      if (data.cashbackRules) setCashbackRules(data.cashbackRules);
    } catch (error: any) {
      console.error("Search failed:", error);
      alert(
        error.message ||
          "Không thể sử dụng AI tìm kiếm lúc này. Bạn có thể tự điền tay.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const addRule = () => {
    setCashbackRules([...cashbackRules, { categories: ["Other"], rate: 0 }]);
  };

  const updateRule = (index: number, rule: CashbackRule) => {
    const newRules = [...cashbackRules];
    newRules[index] = rule;
    setCashbackRules(newRules);
  };

  const removeRule = (index: number) => {
    setCashbackRules(cashbackRules.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cardData: Card = {
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      name,
      bank,
      statementDay: Number(statementDay) || 1,
      gracePeriod: Number(gracePeriod) || 15,
      limit: Number(limit) || 0,
      cashbackRules: cashbackRules.map((rule) => {
        const cleaned: any = {
          categories: rule.categories,
          rate: Number(rule.rate) || 0,
        };
        if (
          rule.cap !== undefined &&
          rule.cap !== null &&
          !isNaN(Number(rule.cap))
        ) {
          cleaned.cap = Number(rule.cap);
        }
        return cleaned;
      }),
      defaultRate: Number(defaultRate) || 0,
      monthlyCashbackCap: Number(monthlyCashbackCap) || 0,
      minSpend: Number(minSpend) || 0,
      sharedLimitId: sharedLimitId || "",
      settlementDays: Number(settlementDays) || 0,
      statementType: statementType || "cycle",
    };

    onSubmit(cardData);
  };

  return (
    <form onSubmit={handleSubmit} className="bento-card p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Tên Thẻ
              </label>
              <input
                required
                placeholder="Ví dụ: SuperCard"
                className="bento-input h-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Ngân hàng
              </label>
              <input
                required
                placeholder="VIB, HSBC, VCB..."
                className="bento-input h-12"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={searchCardDetails}
            disabled={isSearching}
            className="flex items-center justify-center gap-2 w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-blue-500/20 transition-all disabled:opacity-50"
          >
            {isSearching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {isSearching ? "Đang tìm kiếm..." : "Tìm ưu đãi tự động bằng AI"}
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-full">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Loại sao kê
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStatementType("cycle")}
                  className={cn(
                    "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    statementType === "cycle"
                      ? "bg-blue-600/20 border-blue-500 text-blue-400"
                      : "bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800",
                  )}
                >
                  Theo kỳ sao kê
                </button>
                <button
                  type="button"
                  onClick={() => setStatementType("monthly")}
                  className={cn(
                    "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    statementType === "monthly"
                      ? "bg-blue-600/20 border-blue-500 text-blue-400"
                      : "bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800",
                  )}
                >
                  Theo tháng
                </button>
              </div>
              <p className="text-[8px] text-slate-500 italic mt-1 px-1">
                {statementType === "cycle"
                  ? "Tính từ (ngày chốt trước + 2 ngày bút toán) đến (ngày chốt tháng này)."
                  : "Tính tất cả giao dịch được thực hiện trong tháng dương lịch."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Ngày chốt sao kê
              </label>
              <input
                type="number"
                min="1"
                max="31"
                required
                className="bento-input h-12"
                value={isNaN(statementDay) ? "" : statementDay}
                onChange={(e) => setStatementDay(parseInt(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Thời gian ân hạn
              </label>
              <select
                className="bento-input h-12"
                value={isNaN(gracePeriod) ? 15 : gracePeriod}
                onChange={(e) => setGracePeriod(parseInt(e.target.value))}
              >
                <option value={15} className="bg-slate-900">
                  15 ngày
                </option>
                <option value={20} className="bg-slate-900">
                  20 ngày
                </option>
                <option value={25} className="bg-slate-900">
                  25 ngày
                </option>
                <option value={45} className="bg-slate-900">
                  45 ngày
                </option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Hạn mức thẻ (VND)
            </label>
            <input
              type="number"
              placeholder="Ví dụ: 50000000"
              className="bento-input h-12"
              value={isNaN(limit) || limit === 0 ? "" : limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Mã nhóm hạn mức (Nêu dùng chung với thẻ khác)
            </label>
            <input
              placeholder="Ví dụ: MSB_COMMON"
              className="bento-input h-12 text-[11px]"
              value={sharedLimitId}
              onChange={(e) => setSharedLimitId(e.target.value)}
            />
            <p className="text-[8px] text-slate-500 italic mt-1 px-1">
              Các thẻ có cùng mã này sẽ chia sẻ chung một hạn mức chi tiêu.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Chi tiêu tối thiểu để được hoàn tiền (VND)
            </label>
            <input
              type="number"
              placeholder="Ví dụ: 1000000"
              className="bento-input h-12"
              value={isNaN(minSpend) ? "" : minSpend}
              onChange={(e) => setMinSpend(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Số ngày bút toán (settlement days)
            </label>
            <input
              type="number"
              placeholder="0"
              className="bento-input h-12"
              value={isNaN(settlementDays) ? "" : settlementDays}
              onChange={(e) => setSettlementDays(parseInt(e.target.value) || 0)}
            />
            <p className="text-[8px] text-slate-500 italic mt-1 px-1">
              Khoảng cách ngày giao dịch lên sao kê.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Các danh mục hoàn tiền
            </label>
            <button
              type="button"
              onClick={addRule}
              className="text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors"
            >
              + Thêm danh mục
            </button>
          </div>
          <div className="space-y-3 max-h-[200px] overflow-y-auto no-scrollbar pr-2">
            {cashbackRules.map((rule, idx) => (
              <div
                key={idx}
                className="space-y-2 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50"
              >
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase text-slate-500">
                    Danh mục áp dụng chung hạn mức
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORIES.map((cat) => {
                      const isSelected =
                        rule.categories &&
                        Array.isArray(rule.categories) &&
                        rule.categories.includes(cat.value);
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => {
                            const newCategories = isSelected
                              ? (rule.categories || []).filter(
                                  (c) => c !== cat.value,
                                )
                              : [...(rule.categories || []), cat.value];
                            if (newCategories.length === 0) return;
                            updateRule(idx, {
                              ...rule,
                              categories: newCategories,
                            });
                          }}
                          className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold border transition-all",
                            isSelected
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                              : "bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600",
                          )}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500">
                      Tỷ lệ (%)
                    </label>
                    <div className="flex items-center gap-1 bg-slate-950 px-3 py-2 rounded-lg border border-slate-700">
                      <input
                        type="number"
                        step="0.1"
                        className="bg-transparent border-none text-xs font-bold w-full text-right focus:ring-0 p-0"
                        value={isNaN(rule.rate) ? "" : rule.rate}
                        onChange={(e) =>
                          updateRule(idx, {
                            ...rule,
                            rate: parseFloat(e.target.value),
                          })
                        }
                      />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase text-slate-500">
                      Hạn mức (VND/tháng)
                    </label>
                    <div className="flex items-center gap-1 bg-slate-950 px-3 py-2 rounded-lg border border-slate-700">
                      <input
                        type="number"
                        placeholder="Không h.m"
                        className="bg-transparent border-none text-xs font-bold w-full text-right focus:ring-0 p-0"
                        value={
                          rule.cap === undefined || rule.cap === null
                            ? ""
                            : rule.cap
                        }
                        onChange={(e) =>
                          updateRule(idx, {
                            ...rule,
                            cap: e.target.value ? parseInt(e.target.value) : 0,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => removeRule(idx)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} /> Xóa quy tắc
                  </button>
                </div>
              </div>
            ))}
            {cashbackRules.length === 0 && (
              <p className="text-[10px] text-slate-600 italic text-center py-4">
                Chưa có quy tắc hoàn tiền cụ thể nào.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Cơ chế hoàn tiền cuối cùng (%)
            </label>
            <input
              type="number"
              step="0.1"
              required
              className="bento-input h-12"
              value={isNaN(defaultRate) ? "" : defaultRate}
              onChange={(e) => setDefaultRate(parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Giới hạn hoàn tiền tối đa / tháng (VND)
            </label>
            <input
              type="number"
              placeholder="Ví dụ: 300000"
              className="bento-input h-12"
              value={
                isNaN(monthlyCashbackCap) || monthlyCashbackCap === 0
                  ? ""
                  : monthlyCashbackCap
              }
              onChange={(e) =>
                setMonthlyCashbackCap(parseInt(e.target.value) || 0)
              }
            />
            <p className="text-[8px] text-slate-500 italic mt-1 px-1">
              Tổng tiền hoàn tối đa của tất cả danh mục trong một tháng.
            </p>
          </div>
        </div>
      </div>
      <button
        type="submit"
        className="bento-btn w-full h-14 uppercase tracking-widest font-black text-sm"
      >
        Xác nhận Thêm Thẻ
      </button>
    </form>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 transition-all relative group",
        active ? "text-blue-400" : "text-slate-400 hover:text-slate-200",
      )}
    >
      <div
        className={cn(
          "transition-transform group-hover:scale-110",
          active && "scale-110",
        )}
      >
        {icon}
      </div>
      <span className="text-[11px] font-black uppercase tracking-widest hidden md:inline">
        {label}
      </span>
      {active && (
        <motion.div
          layoutId="nav-pill"
          className="absolute inset-0 bg-blue-500/10 rounded-xl -z-10"
        />
      )}
    </button>
  );
}

// Helper for Category Icons
function catEmoji(label?: string) {
  if (!label) return "";
  if (label.includes("Siêu thị")) return "🛒";
  if (label.includes("Online")) return "💻";
  if (label.includes("Ăn uống")) return "🍽️";
  if (label.includes("Di chuyển")) return "🚗";
  if (label.includes("Xăng")) return "⛽";
  if (label.includes("Sức khỏe")) return "🏥";
  if (label.includes("Giáo dục")) return "📚";
  if (label.includes("Du lịch")) return "✈️";
  if (label.includes("Sản phẩm số")) return "🎮";
  if (label.includes("Thương mại điện tử")) return "🛍️";
  if (label.includes("Xem phim")) return "🎬";
  if (label.includes("Điện nước")) return "⚡";
  return "✨";
}

function MetricCard({
  label,
  value,
  subValue,
  icon,
  colorClass = "text-slate-50",
}: {
  label: string;
  value: string;
  subValue: string;
  icon: React.ReactNode;
  colorClass?: string;
}) {
  return (
    <div className="bento-card p-5">
      <div className="flex justify-between items-start mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </p>
        <div className="flex-shrink-0 p-2 bg-slate-900 border border-slate-700/50 rounded-xl shadow-inner">
          {icon}
        </div>
      </div>
      <div>
        <p
          className={cn(
            "text-xl font-black mb-0.5 tabular-nums transition-all",
            colorClass,
          )}
        >
          {value}
        </p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
          {subValue}
        </p>
      </div>
    </div>
  );
}

function CardSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bento-card">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-700 pb-3">
        <div className="text-slate-400">{icon}</div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function TransactionForm({
  cards,
  onSubmit,
  initialData,
  members,
  memberCategories,
}: {
  cards: Card[];
  onSubmit: (data: any) => void;
  initialData?: Partial<Transaction>;
  members: string[];
  memberCategories?: Record<string, string[]>;
}) {
  const [formData, setFormData] = useState({
    cardId: initialData?.cardId || cards[0]?.id || "",
    amount: initialData?.amount?.toString() || "",
    category: initialData?.category || ("Other" as Category),
    description: initialData?.description || "",
    memberName: initialData?.memberName || members[0] || "Tôi",
    memberCategory: initialData?.memberCategory || "",
    date: initialData?.date
      ? safeFormat(initialData.date, "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    type: initialData?.type || ("standard" as TransactionType),
    installments: initialData?.installments || 3,
    statementCycleOffset: initialData?.statementCycleOffset || 0,
  });

  useEffect(() => {
    const cardExists = cards.some((c) => c.id === formData.cardId);
    if (!cardExists && cards.length > 0) {
      setFormData((prev) => ({ ...prev, cardId: cards[0].id }));
    }
  }, [cards, formData.cardId]);

  const selectedCard = cards.find((c) => c.id === formData.cardId);
  const estimatedCashback = useMemo(() => {
    if (formData.type === "payment" || formData.type === "cashback_redemption")
      return 0;
    const amt = parseFloat(formData.amount) || 0;

    // Cancellation type check
    if (
      formData.type === "cashback_redemption" ||
      formData.type === "nhan_hoan_tien"
    ) {
      return -amt;
    }

    if (formData.type === "refund" || formData.type === "cancelled") {
      const rules = selectedCard?.cashbackRules || [];
      const rule = rules.find(
        (r) =>
          r &&
          Array.isArray(r.categories) &&
          r.categories.includes(String(formData.category) as any),
      );
      const rate =
        rule && typeof rule.rate === "number"
          ? rule.rate
          : selectedCard?.defaultRate || 0;
      return -(amt * rate) / 100;
    }

    const rules = selectedCard?.cashbackRules || [];

    // Find matching rule with extreme defensive checks
    const rule = rules.find(
      (r) =>
        r &&
        Array.isArray(r.categories) &&
        r.categories.includes(String(formData.category) as any),
    );

    const rate =
      rule && typeof rule.rate === "number"
        ? rule.rate
        : selectedCard?.defaultRate || 0;
    const result = (amt * rate) / 100;
    return isNaN(result) ? 0 : result;
  }, [formData, selectedCard]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cardId || !formData.amount) return;

    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount),
      cashback: estimatedCashback, // Pass the calculated cashback
      installments:
        formData.type === "installment"
          ? Number(formData.installments)
          : undefined,
    });

    // Reset form
    setFormData({
      cardId: cards[0]?.id || "",
      amount: "",
      category: "Other",
      description: "",
      memberName: members[0] || "Tôi",
      memberCategory: "",
      date: safeFormat(new Date(), "yyyy-MM-dd"),
      type: "standard",
      installments: 3,
      statementCycleOffset: 0,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bento-card p-8 space-y-6 shadow-2xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Chọn Thẻ
            </label>
            <select
              className="bento-input h-12"
              value={formData.cardId}
              onChange={(e) =>
                setFormData({ ...formData, cardId: e.target.value })
              }
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Số tiền {formData.type === "installment" ? "Tổng" : ""} (VND)
            </label>
            <input
              type="number"
              required
              placeholder="500,000"
              className="bento-input h-12 font-black text-xl"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Danh mục
            </label>
            <select
              className="bento-input h-12"
              value={formData.category}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  category: e.target.value as Category,
                })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value} className="bg-slate-900">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Ngày GD
              </label>
              <input
                type="date"
                className="bento-input h-12"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Kỳ sao kê
              </label>
              <select
                className="bento-input h-12"
                value={formData.statementCycleOffset || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    statementCycleOffset: Number(e.target.value),
                  })
                }
              >
                <option value={0}>Tự động</option>
                <option value={-1}>Đã lên (Kỳ trước)</option>
                <option value={1}>Chưa lên (Kỳ sau)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Loại giao dịch
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "standard" })}
                className={cn(
                  "h-12 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all",
                  formData.type === "standard"
                    ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800",
                )}
              >
                Chi tiêu
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, type: "installment" })
                }
                className={cn(
                  "h-12 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all",
                  formData.type === "installment"
                    ? "bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-500/20"
                    : "bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800",
                )}
              >
                Trả góp
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "payment" })}
                className={cn(
                  "h-12 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all",
                  formData.type === "payment"
                    ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20"
                    : "bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800",
                )}
              >
                Trả nợ
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: "refund" })}
                className={cn(
                  "h-12 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all",
                  formData.type === "refund"
                    ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-500/20"
                    : "bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800",
                )}
              >
                Giao dịch bị hủy
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, type: "cashback_redemption" })
                }
                className={cn(
                  "h-12 rounded-xl text-[9px] font-black uppercase tracking-tight border transition-all",
                  formData.type === "cashback_redemption"
                    ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    : "bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800",
                )}
              >
                Nhận hoàn tiền
              </button>
            </div>
          </div>
          {formData.type === "installment" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Số kỳ (tháng)
              </label>
              <select
                className="bento-input h-12"
                value={formData.installments}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    installments: Number(e.target.value),
                  })
                }
              >
                {[3, 6, 9, 12, 18, 24].map((n) => (
                  <option key={n} value={n} className="bg-slate-900">
                    {n} tháng (Gói tiêu chuẩn)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5 flex gap-2 w-full">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                Người chi tiêu
              </label>
              <select
                className="bento-input h-12"
                value={formData.memberName}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    memberName: e.target.value,
                    memberCategory: "",
                  });
                }}
              >
                {members.map((m) => (
                  <option key={m} value={m} className="bg-slate-900">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {memberCategories?.[formData.memberName]?.length ? (
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
                  Mục
                </label>
                <select
                  className="bento-input h-12"
                  value={formData.memberCategory}
                  onChange={(e) =>
                    setFormData({ ...formData, memberCategory: e.target.value })
                  }
                >
                  <option value="" className="bg-slate-900">
                    Không chọn
                  </option>
                  {memberCategories[formData.memberName].map((c) => (
                    <option key={c} value={c} className="bg-slate-900">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">
              Ghi chú
            </label>
            <textarea
              placeholder="Ăn trưa, Shopee..."
              className="bento-input h-[94px] resize-none"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>
        </div>
      </div>
      {formData.type === "installment" && formData.amount && (
        <div className="bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl">
          <div className="flex justify-between items-center text-[10px] font-bold uppercase text-orange-400">
            <p>Mỗi tháng bạn sẽ trả</p>
            <p>
              {formatCurrency(
                parseFloat(formData.amount) / (formData.installments || 1),
              )}
            </p>
          </div>
        </div>
      )}
      <div className="bg-slate-900 p-5 border border-slate-700 rounded-xl flex justify-between items-center">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">
            {estimatedCashback >= 0 ? "Dự kiến hoàn tiền" : "Hoàn tiền sẽ trừ"}
          </p>
          <p
            className={cn(
              "text-2xl font-black",
              estimatedCashback >= 0 ? "text-emerald-500" : "text-rose-500",
            )}
          >
            {formatCurrency(Math.abs(estimatedCashback))}
          </p>
        </div>
        <div
          className={cn(
            "p-3 border rounded-lg font-black text-sm",
            estimatedCashback >= 0
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
              : "bg-rose-500/10 border-rose-500/20 text-rose-500",
          )}
        >
          {estimatedCashback >= 0 ? "+" : "-"}
          {(
            (Math.abs(estimatedCashback) / (parseFloat(formData.amount) || 1)) *
            100
          ).toFixed(1)}
          %
        </div>
      </div>
      <button
        type="submit"
        className="bento-btn w-full h-14 uppercase tracking-widest font-black text-sm"
      >
        Lưu Giao dịch
      </button>
    </form>
  );
}

function TransactionCalendar({
  transactions,
  selectedDate,
  onSelectDate,
  currentDate,
  onPrevMonth,
  onNextMonth,
}: {
  transactions: Transaction[];
  selectedDate: Date | null;
  onSelectDate: (day: Date | null) => void;
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDailySpending = (day: Date) => {
    return transactions
      .filter((t) => {
        const d = t.date ? parseISO(t.date) : null;
        return d && isValid(d) && isSameDay(d, day);
      })
      .reduce((sum, t) => {
        const type = t.type || "standard";
        const amt = Math.abs(Number(t.amount) || 0);
        if (type === "standard" || type === "installment") return sum + amt;
        if (["refund", "cancelled", "giao_dich_bi_huy"].includes(type))
          return sum - amt;
        return sum;
      }, 0);
  };

  const getDailyPayments = (day: Date) => {
    return transactions
      .filter((t) => {
        const d = t.date ? parseISO(t.date) : null;
        const type = t.type || "standard";
        return (
          d &&
          isValid(d) &&
          isSameDay(d, day) &&
          ["payment", "cashback_redemption", "nhan_hoan_tien"].includes(type)
        );
      })
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
  };

  const getDailyCashback = (day: Date) => {
    return transactions
      .filter((t) => {
        const d = t.date ? parseISO(t.date) : null;
        return d && isValid(d) && isSameDay(d, day);
      })
      .reduce((sum, t) => sum + (Number(t.cashback) || 0), 0);
  };

  return (
    <div className="bento-card p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-base font-black uppercase tracking-tight">
            Lịch Giao Dịch
          </h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {safeFormat(currentDate, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPrevMonth}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700"
          >
            <ChevronLeft size={16} className="text-slate-400" />
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors border border-slate-700 rotate-180"
          >
            <ChevronLeft size={16} className="text-slate-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
          <div
            key={day}
            className="text-center py-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest border-b border-slate-800 mb-1"
          >
            {day}
          </div>
        ))}
        {calendarDays.map((day) => {
          const dailySpending = getDailySpending(day);
          const dailyPayments = getDailyPayments(day);
          const dailyCashback = getDailyCashback(day);
          const isCurrentMonth =
            safeFormat(day, "MM") === safeFormat(currentDate, "MM");
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDate && isSameDay(day, selectedDate);

          return (
            <div
              key={day.toISOString()}
              onClick={() =>
                isCurrentMonth && onSelectDate(isSelected ? null : day)
              }
              className={cn(
                "min-h-[70px] p-1.5 border rounded-lg flex flex-col justify-between transition-all cursor-pointer",
                isCurrentMonth
                  ? "bg-slate-900/40 border-slate-800/40 hover:border-blue-500/30"
                  : "opacity-10 bg-transparent grayscale border-transparent cursor-default",
                isToday && "border-blue-500/50 bg-blue-500/10",
                isSelected &&
                  "ring-2 ring-blue-500 border-blue-500 bg-blue-500/20 z-10",
              )}
            >
              <div className="flex justify-between items-start">
                <span
                  className={cn(
                    "text-[10px] font-black",
                    isToday || isSelected ? "text-blue-400" : "text-slate-500",
                  )}
                >
                  {safeFormat(day, "d")}
                </span>
                {isToday && (
                  <div className="size-1 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                )}
              </div>
              {(dailySpending > 0 || dailyPayments > 0 || dailyCashback > 0) &&
                isCurrentMonth && (
                  <div className="mt-auto flex flex-col gap-0.5">
                    {dailyCashback > 0 && (
                      <p className="text-[8px] font-black text-emerald-400 leading-none truncate tracking-tighter bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 w-fit">
                        +{Math.round(dailyCashback).toLocaleString()}
                      </p>
                    )}
                    {dailyPayments > 0 && (
                      <p className="text-[9px] font-black text-emerald-400 leading-none truncate tracking-tighter">
                        +{Math.round(dailyPayments / 1000).toLocaleString()}k
                      </p>
                    )}
                    {dailySpending > 0 && (
                      <p className="text-[9px] font-black text-rose-400 leading-none truncate tracking-tighter">
                        -{Math.round(dailySpending / 1000).toLocaleString()}k
                      </p>
                    )}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTransactionInfo(type: string = "standard") {
  switch (type) {
    case "payment":
      return {
        icon: <CheckCircle2 size={16} />,
        color: "text-purple-400",
        bgColor: "bg-purple-500/10",
        borderColor: "border-purple-500/20",
        label: "Thanh toán",
      };
    case "cashback_redemption":
    case "nhan_hoan_tien":
      return {
        icon: <ArrowDownLeft size={16} />,
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/20",
        label: "Tiền hoàn",
      };
    case "refund":
    case "cancelled":
    case "giao_dich_bi_huy":
      return {
        icon: <RotateCcw size={16} />,
        color: "text-rose-400",
        bgColor: "bg-rose-500/10",
        borderColor: "border-rose-500/20",
        label: "Giao dịch hủy",
      };
    case "installment":
      return {
        icon: <ShoppingBag size={16} />,
        color: "text-orange-400",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/20",
        label: "Trả góp",
      };
    default:
      return {
        icon: <ShoppingBag size={16} />,
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/20",
        label: "Chi tiêu",
      };
  }
}

function HistoryTable({
  transactions,
  cards,
  onDelete,
  onEdit,
}: {
  transactions: Transaction[];
  cards: Card[];
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
}) {
  if (transactions.length === 0) {
    return (
      <div className="bento-card p-20 text-center items-center justify-center">
        <History size={48} className="text-slate-700 mb-4" />
        <p className="text-slate-500 font-medium italic">
          Chưa có giao dịch nào được ghi lại.
        </p>
      </div>
    );
  }

  return (
    <div className="bento-card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-700">
              <th className="px-4 md:px-6 py-4">Ngày</th>
              <th className="px-4 md:px-6 py-4">Mô tả</th>
              <th className="px-4 md:px-6 py-4 text-right">Số tiền</th>
              <th className="px-4 md:px-6 py-4 text-right text-emerald-500 hidden md:table-cell">
                Hoàn
              </th>
              <th className="px-4 md:px-6 py-4 hidden md:table-cell">Hạn trả</th>
              <th className="px-4 md:px-6 py-4 text-right hidden md:table-cell">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            <AnimatePresence initial={false}>
              {transactions.map((t) => (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  cards={cards}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TransactionRowProps {
  key?: string;
  transaction: Transaction;
  cards: Card[];
  onDelete: (id: string) => void;
  onEdit: (t: Transaction) => void;
}

function TransactionRow({
  transaction: t,
  cards,
  onDelete,
  onEdit,
}: TransactionRowProps) {
  const info = getTransactionInfo(t.type || "standard");
  const isReduction = [
    "payment",
    "cashback_redemption",
    "refund",
    "cancelled",
    "nhan_hoan_tien",
    "giao_dich_bi_huy",
  ].includes(t.type || "standard");

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      className="relative group"
    >
      <td colSpan={6} className="p-0 border-none">
        <div className="relative overflow-hidden">
          {/* Nút Xóa nằm phía sau hàng (chỉ hiện khi vuốt trên mobile) */}
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-rose-600 flex flex-col items-center justify-center text-white md:hidden">
            <Trash2 size={20} />
            <span className="text-[10px] font-black uppercase mt-1">Xóa</span>
          </div>

          {/* Nội dung hàng giao dịch */}
          <motion.div
            drag="x"
            dragConstraints={{ left: -80, right: 0 }}
            dragElastic={{ left: 0.1, right: 0.1 }}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) {
                onDelete(t.id);
              }
            }}
            className="bg-slate-950/50 backdrop-blur-sm flex items-center w-full hover:bg-slate-700/20 transition-colors cursor-grab active:cursor-grabbing"
          >
            {/* Giả lập các cột của table bằng flexbox */}
            <div className="w-[80px] md:w-[120px] px-4 md:px-6 py-4 font-medium text-slate-500 text-xs md:text-sm shrink-0">
              {safeFormat(t.date, "dd/MM")}
              <span className="hidden md:inline">
                /{safeFormat(t.date, "yyyy")}
              </span>
            </div>

            <div className="flex-1 min-w-0 px-4 md:px-6 py-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div
                  className={cn(
                    "p-1.5 md:p-2 rounded-lg border shrink-0",
                    info.bgColor,
                    info.color,
                    info.borderColor,
                  )}
                >
                  {React.cloneElement(info.icon as React.ReactElement, {
                    size: 14,
                  })}
                </div>
                <div className="flex flex-col min-w-0 overflow-hidden">
                  <div className="flex flex-wrap items-center gap-1 md:gap-2">
                    <p className="font-bold text-white text-xs md:text-sm truncate">
                      {t.description || "Giao dịch"}
                    </p>
                    <span
                      className={cn(
                        "text-[8px] md:text-[9px] font-black px-1 md:px-1.5 py-0.5 rounded border uppercase tracking-tighter shrink-0",
                        info.bgColor,
                        info.color,
                        info.borderColor,
                      )}
                    >
                      {info.label}
                    </span>
                    {t.memberName && t.memberName !== "Tôi" && (
                      <span className="text-[8px] md:text-[9px] font-black bg-slate-800 text-slate-400 px-1 md:px-1.5 py-0.5 rounded border border-slate-700 uppercase tracking-tighter shrink-0">
                        {t.memberName}
                      </span>
                    )}
                    {t.statementCycleOffset === -1 && (
                      <span className="text-[8px] md:text-[9px] font-black bg-blue-500/10 text-blue-400 px-1 md:px-1.5 py-0.5 rounded border border-blue-500/20 uppercase tracking-tighter shrink-0">
                        Đã lên (Kỳ trước)
                      </span>
                    )}
                    {t.statementCycleOffset === 1 && (
                      <span className="text-[8px] md:text-[9px] font-black bg-orange-500/10 text-orange-400 px-1 md:px-1.5 py-0.5 rounded border border-orange-500/20 uppercase tracking-tighter shrink-0">
                        Chưa lên (Kỳ sau)
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">
                    {cards.find((c) => c.id === t.cardId)?.name}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "w-[100px] md:w-[150px] px-4 md:px-6 py-4 text-right font-black tabular-nums whitespace-nowrap text-xs md:text-sm shrink-0",
                isReduction ? "text-emerald-400" : "text-white",
              )}
            >
              {isReduction ? "-" : ""}
              {formatCurrency(Math.abs(Number(t.amount) || 0))}
            </div>

            {/* Cột Hoàn tiền (Chỉ hiện trên Desktop) */}
            <div className="hidden md:flex w-[120px] px-6 py-4 text-right text-emerald-500 font-black whitespace-nowrap justify-end items-center shrink-0">
              {t.cashback && Number(t.cashback) > 0
                ? `+${formatCurrency(Number(t.cashback))}`
                : "-"}
            </div>

            {/* Cột Hạn thanh toán (Chỉ hiện trên Desktop) */}
            <div className="hidden md:flex w-[100px] px-6 py-4 justify-center items-center shrink-0">
              <span className="text-[10px] font-black bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20">
                {t.paymentDueDate ? safeFormat(t.paymentDueDate, "dd/MM") : "-"}
              </span>
            </div>

            {/* Cột Thao tác (Chỉ hiện trên Desktop) */}
            <div className="hidden md:flex w-[120px] px-6 py-4 justify-end items-center shrink-0">
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(t);
                  }}
                  className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-lg transition-all"
                  title="Sửa"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t.id);
                  }}
                  className="p-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-all"
                  title="Xoá"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </td>
    </motion.tr>
  );
}

function StatementTab({
  transactions,
  cards,
  members,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  cards: Card[];
  members: string[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [statementDate, setStatementDate] = useState<Date>(new Date());

  useEffect(() => {
    if (cards.length > 0 && !selectedCardId) {
      setSelectedCardId(cards[0].id);
    }
  }, [cards, selectedCardId]);

  const card = cards.find((c) => c.id === selectedCardId);

  const statementData = useMemo(() => {
    if (!card) return null;

    const sDay = Number(card.statementDay) || 1;
    const sType = card.statementType || "cycle";
    const settlementDays = Number(card.settlementDays) || 0;

    let cycleEnd = new Date(
      statementDate.getFullYear(),
      statementDate.getMonth(),
      1,
    );
    let cycleStart = new Date(cycleEnd);

    if (sType === "monthly") {
      cycleStart = startOfMonth(cycleEnd);
      cycleEnd = endOfMonth(cycleEnd);
    } else {
      cycleEnd = new Date(
        statementDate.getFullYear(),
        statementDate.getMonth(),
        sDay,
      );
      cycleStart = new Date(
        cycleEnd.getFullYear(),
        cycleEnd.getMonth() - 1,
        sDay,
      );
    }

    const isInCycle = (t: Transaction, start: Date, end: Date) => {
      const dParsed = parseISO(t.date);
      if (!isValid(dParsed)) return false;

      let adjustedDate = dParsed;
      if (t.statementCycleOffset) {
        adjustedDate = addMonths(adjustedDate, t.statementCycleOffset);
      }

      if (sType === "monthly") {
        return isWithinInterval(adjustedDate, {
          start: startOfDay(start),
          end: endOfDay(subDays(end, 1)),
        });
      } else {
        const settledDate = startOfDay(addDays(adjustedDate, settlementDays));
        return (
          (settledDate > startOfDay(start) ||
            (settledDate.getTime() === startOfDay(start).getTime() &&
              adjustedDate.getTime() > startOfDay(start).getTime())) &&
          settledDate <= startOfDay(end)
        );
      }
    };

    const periodTxs = transactions
      .filter(
        (t) =>
          t.cardId === card.id &&
          isInCycle(t, cycleStart, cycleEnd) &&
          (selectedMember === "all" || t.memberName === selectedMember),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let totalSpent = 0;
    let totalCashback = 0;
    let totalRefunds = 0;

    periodTxs.forEach((t) => {
      const amt = Number(t.amount) || 0;
      const cb = Number(t.cashback) || 0;
      const type = t.type || "standard";

      if (type === "payment") {
        // Skip payments when calculating current statement totals
        // since they are usually paying off a previous statement.
      } else if (
        [
          "cashback_redemption",
          "nhan_hoan_tien",
          "refund",
          "cancelled",
          "giao_dich_bi_huy",
        ].includes(type)
      ) {
        totalRefunds += amt;
      } else {
        totalSpent += amt;
      }

      if (
        ![
          "payment",
          "cashback_redemption",
          "nhan_hoan_tien",
          "refund",
          "cancelled",
          "giao_dich_bi_huy",
        ].includes(type)
      ) {
        totalCashback += cb;
      }
    });

    const netAmount = totalSpent - totalRefunds;

    return {
      cycleStart,
      cycleEnd,
      transactions: periodTxs,
      totalSpent,
      totalRefunds,
      totalCashback,
      netAmount,
    };
  }, [card, statementDate, transactions, selectedMember]);

  const handlePrevMonth = () => {
    const newDate = new Date(statementDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setStatementDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(statementDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setStatementDate(newDate);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row gap-4 justify-between md:items-end">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
          <div className="space-y-2 flex-1">
            <label className="text-xs font-bold uppercase text-slate-500 ml-1">
              Chọn thẻ
            </label>
            <select
              className="bento-input w-full h-12"
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 flex-1">
            <label className="text-xs font-bold uppercase text-slate-500 ml-1">
              Cá nhân
            </label>
            <select
              className="bento-input w-full h-12"
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
            >
              <option value="all">Tất cả cá nhân</option>
              {members.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-center gap-4 bento-card p-2 md:w-auto w-full">
          <button
            onClick={handlePrevMonth}
            className="p-2 bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-[120px]">
            <p className="text-sm font-bold text-white uppercase tracking-widest">
              Tháng {statementDate.getMonth() + 1}
            </p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              {statementDate.getFullYear()}
            </p>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors rotate-180"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      </div>

      {statementData && card && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bento-card p-4 space-y-1 text-center md:text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Tổng chi tiêu
              </p>
              <p className="text-xl font-black tabular-nums text-white">
                {formatCurrency(statementData.totalSpent)}
              </p>
            </div>
            <div className="bento-card p-4 space-y-1 text-center md:text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Hoàn tiền / Trả lại
              </p>
              <p className="text-xl font-black tabular-nums text-emerald-400">
                - {formatCurrency(statementData.totalRefunds)}
              </p>
            </div>
            <div className="bento-card p-4 space-y-1 text-center md:text-left bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                Cần thanh toán
              </p>
              <p className="text-xl font-black tabular-nums text-blue-400">
                {formatCurrency(Math.max(0, statementData.netAmount))}
              </p>
            </div>
            <div className="bento-card p-4 space-y-1 text-center md:text-left bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                Dự kiến nhận hoàn
              </p>
              <p className="text-xl font-black tabular-nums text-emerald-400">
                + {formatCurrency(statementData.totalCashback)}
              </p>
            </div>
          </div>

          <div className="bento-card p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/20">
              <h3 className="font-bold text-sm text-white uppercase tracking-widest">
                Kỳ chốt:{" "}
                {safeFormat(
                  statementData.cycleEnd.toISOString(),
                  "dd/MM/yyyy",
                )}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                (Từ{" "}
                {safeFormat(
                  statementData.cycleStart.toISOString(),
                  "dd/MM/yyyy",
                )}{" "}
                đến{" "}
                {safeFormat(
                  statementData.cycleEnd.toISOString(),
                  "dd/MM/yyyy",
                )}
                )
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="hidden md:table-header-group">
                  <tr className="bg-slate-900/50 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-700">
                    <th className="px-4 md:px-6 py-4">Ngày</th>
                    <th className="px-4 md:px-6 py-4">Mô tả</th>
                    <th className="px-4 md:px-6 py-4 text-right">Số tiền</th>
                    <th className="px-4 md:px-6 py-4 text-right text-emerald-500 hidden md:table-cell">
                      Hoàn
                    </th>
                    <th className="px-4 md:px-6 py-4 hidden md:table-cell text-center">
                      Hạn trả
                    </th>
                    <th className="px-4 md:px-6 py-4 text-right hidden md:table-cell">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 block md:table-row-group">
                  <AnimatePresence initial={false}>
                    {statementData.transactions.length > 0 ? (
                      statementData.transactions.map((t) => (
                        <TransactionRow
                          key={t.id}
                          transaction={t}
                          cards={cards}
                          onDelete={onDelete}
                          onEdit={onEdit}
                        />
                      ))
                    ) : (
                      <tr className="block md:table-row">
                        <td
                          colSpan={6}
                          className="py-12 text-center text-slate-500 block md:table-cell"
                        >
                          <CheckCircle2
                            size={32}
                            className="mx-auto mb-2 opacity-50"
                          />
                          <p className="text-sm font-medium uppercase tracking-widest">
                            Không có giao dịch
                          </p>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}