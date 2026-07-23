import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// mirrors SITUATIONS payouts in src/App.jsx — server is the source of truth
// for pricing so a client can't submit an arbitrary charge amount.
export const PAYOUTS = {
  mud: 70,
  sand: 75,
  highcentered: 95,
  water: 110,
  battery: 45,
  fuel: 40,
  flat: 55,
};

export const PLATFORM_FEE_PCT = 0.15;
