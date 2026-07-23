import { loadStripe } from "@stripe/stripe-js";

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!key) {
  console.warn(
    "Missing VITE_STRIPE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill it in."
  );
}

export const stripePromise = key ? loadStripe(key) : Promise.resolve(null);
