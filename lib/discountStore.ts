"use client";

import { createPersisted, usePersisted } from "./store";
import { DEFAULT_DISCOUNTS, type DiscountState } from "./discounts";

export const discountsStore = createPersisted<DiscountState>("gc.discounts", DEFAULT_DISCOUNTS, true);
export const useDiscounts = () => usePersisted(discountsStore);
