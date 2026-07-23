import React, { useState, useEffect, useCallback } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import {
  loadJob, loadAllJobs, createJob, acceptJob, advanceJobStatus,
  createPaymentIntent, completeJob, cancelPayment, createConnectAccount, syncConnectStatus,
  subscribeToJob, subscribeToJobsBoard,
} from "./lib/storage.js";
import { onAuthStateChange, getProfile, updateProfile, signOut } from "./lib/auth.js";
import { getCurrentLocation, formatCoordLabel } from "./lib/geo.js";
import { stripePromise } from "./lib/stripeClient.js";
import AuthGate from "./components/AuthGate.jsx";
import JobsMap from "./components/JobsMap.jsx";
import {
  MapPin, Truck, LifeBuoy, Battery, Droplets, Mountain, Radio, Compass,
  Star, Phone, MessageCircle, CheckCircle2, Clock, Fuel, Wind,
  TriangleAlert, ChevronRight, Power, DollarSign, Bike, CircleDot,
  ArrowRight, Users, ShieldCheck, Zap, Car, Wrench, LogOut, CreditCard
} from "lucide-react";

// ---------- reference data ----------

const VEHICLE_TYPES = [
  { id: "car", label: "Car / sedan", icon: Car },
  { id: "truck", label: "4x4 truck", icon: Truck },
  { id: "suv", label: "SUV / Jeep", icon: Truck },
  { id: "utv", label: "UTV / SxS", icon: CircleDot },
  { id: "bike", label: "Dirt bike", icon: Bike },
];

const SITUATIONS = [
  { id: "mud", label: "Stuck in mud", icon: Droplets, payout: 70 },
  { id: "sand", label: "Stuck in sand", icon: Wind, payout: 75 },
  { id: "highcentered", label: "High-centered on rock", icon: Mountain, payout: 95 },
  { id: "water", label: "Water crossing", icon: Droplets, payout: 110 },
  { id: "battery", label: "Dead battery", icon: Battery, payout: 45 },
  { id: "fuel", label: "Out of fuel", icon: Fuel, payout: 40 },
  { id: "flat", label: "Flat tire", icon: Wrench, payout: 55 },
];

const EQUIPMENT = ["Winch", "Tow strap", "Traction boards", "Air compressor", "Jump start", "Fuel can", "Spare tire"];
const STATUS_STEPS = ["open", "accepted", "en_route", "on_scene", "recovering", "complete"];
const STATUS_LABEL = {
  open: "Waiting for a unit",
  accepted: "Accepted",
  en_route: "En route",
  on_scene: "On scene",
  recovering: "Recovering",
  complete: "Complete",
};
function sit(id) {
  return SITUATIONS.find((s) => s.id === id);
}
function veh(id) {
  return VEHICLE_TYPES.find((v) => v.id === id);
}
// ---------- small UI atoms ----------

function Coord({ children }) {
  return <span className="font-mono text-xs tracking-tight text-orange-600">{children}</span>;
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-gray-700 text-gray-300 border-gray-600",
    warn: "bg-orange-950 text-orange-400 border-orange-800",
    ok: "bg-emerald-950 text-emerald-400 border-emerald-800",
  };
  return <span className={`inline-block px-2.5 py-1 rounded border text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Button({ children, onClick, tone = "orange", disabled, className = "", size = "md" }) {
  const tones = {
    orange: "bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-400 text-white",
    emerald: "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-400 text-white",
    stone: "bg-gray-700 hover:bg-gray-600 active:bg-gray-600 text-gray-100 disabled:bg-gray-800 disabled:text-gray-400",
    ghost: "bg-transparent border border-gray-600 hover:bg-gray-700 text-gray-200",
  };
  const sizes = { md: "py-3 px-4 text-sm", sm: "py-2 px-3 text-xs" };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-semibold tracking-wide transition ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

// generates one closed, irregular contour ring around a peak center
function contourRing(cx, cy, baseR, seed) {
  const N = 48;
  const points = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const r =
      baseR +
      baseR * 0.18 * Math.sin(t * 3 + seed) +
      baseR * 0.1 * Math.sin(t * 5 + seed * 1.7) +
      baseR * 0.06 * Math.sin(t * 2 + seed * 2.3);
    points.push([cx + r * Math.cos(t), cy + r * Math.sin(t) * 0.72]);
  }
  return (
    "M " +
    points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ") +
    " Z"
  );
}

// a set of nested rings sharing one center, like elevation bands around a peak
function peakCluster(cx, cy, maxR, seed, rings = 6) {
  const out = [];
  for (let i = 0; i < rings; i++) {
    const r = maxR * (0.22 + i * (0.78 / (rings - 1)));
    out.push({ d: contourRing(cx, cy, r, seed + i * 0.15), index: i });
  }
  return out;
}

const TERRAIN_PEAKS = [
  peakCluster(140, 120, 180, 0.4, 7),
  peakCluster(640, 360, 230, 2.1, 8),
  peakCluster(380, 540, 150, 4.7, 6),
  peakCluster(700, 60, 110, 6.2, 5),
];

function TopoBackdrop() {
  return (
    <svg
      className="fixed inset-0 w-full h-full opacity-[0.15] pointer-events-none"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
    >
      {TERRAIN_PEAKS.map((cluster, ci) => (
        <g key={ci} className="text-orange-400">
          {cluster.map(({ d, index }) => (
            <path
              key={index}
              d={d}
              stroke="currentColor"
              strokeWidth={index % 5 === 0 ? 1.4 : 0.8}
              fill="none"
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function StatusTracker({ status }) {
  const idx = STATUS_STEPS.indexOf(status);
  return (
    <div className="space-y-0">
      {STATUS_STEPS.slice(1).map((s, i) => {
        const stepIdx = i + 1;
        const active = idx >= stepIdx;
        return (
          <div key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${active ? "bg-emerald-600" : "bg-gray-700"}`}>
                {active ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Clock className="w-3 h-3 text-gray-400" />}
              </div>
              {stepIdx < STATUS_STEPS.length - 1 && <div className={`w-0.5 h-8 ${idx > stepIdx ? "bg-emerald-600" : "bg-gray-700"}`} />}
            </div>
            <p className={`text-sm pt-0.5 ${active ? "text-gray-50" : "text-gray-500"}`}>{STATUS_LABEL[s]}</p>
          </div>
        );
      })}
    </div>
  );
}

// storage helpers now live in ./lib/storage.js — see the TODO(supabase)
// notes there for how to swap localStorage for a real backend.

// ---------- Landing ----------

function Landing({ onStranded, onOps, onViewMap }) {
  return (
    <div className="relative">
      <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <button
          onClick={onViewMap}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-700 bg-gray-900 text-gray-500 hover:text-orange-400 hover:border-orange-800 text-xs font-medium mb-6 transition"
        >
          <Radio className="w-3.5 h-3.5 text-orange-600" /> LIVE MAP
        </button>
        <h1 className="text-4xl md:text-5xl font-bold text-gray-50 tracking-tight leading-tight">
          Stuck on the trail? Or just ran out of gas?<br />Get pulled out by someone nearby.
        </h1>
        <p className="text-gray-400 mt-5 max-w-xl mx-auto text-base">
          TUG connects stranded drivers — off-road, on the highway, or stuck downtown — with local operators who
          have the winch, the rig, or the tow to get you moving again.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
          <Button tone="orange" onClick={onStranded} className="w-full sm:w-auto flex items-center justify-center gap-2">
            <TriangleAlert className="w-4 h-4" /> I'm stuck <ArrowRight className="w-4 h-4" />
          </Button>
          <Button tone="emerald" onClick={onOps} className="w-full sm:w-auto flex items-center justify-center gap-2">
            <Truck className="w-4 h-4" /> I run recovery <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: MapPin, title: "Broadcast your position", body: "Share your coordinates, situation, and what equipment you think is needed." },
          { icon: Users, title: "Get matched nearby", body: "Local recovery units see your request and accept the job in minutes." },
          { icon: ShieldCheck, title: "Track it to completion", body: "Follow status live from accepted to en route to recovered." },
        ].map((f, i) => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <f.icon className="w-5 h-5 text-emerald-600 mb-3" />
            <p className="text-gray-50 font-medium text-sm mb-1">{f.title}</p>
            <p className="text-gray-400 text-sm">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Stranded: form + status ----------

// Card entry + authorize step, shown once a payment intent has been
// created for the chosen situation. Split into an outer Elements provider
// (needs the clientSecret up front) and an inner form that can call the
// useStripe/useElements hooks.
function PaymentStep({ clientSecret, amount, onAuthorized, onBack }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
      <PaymentStepForm amount={amount} onAuthorized={onAuthorized} onBack={onBack} />
    </Elements>
  );
}

function PaymentStepForm({ amount, onAuthorized, onBack }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message || "Payment failed. Try again.");
      setSubmitting(false);
      return;
    }
    if (paymentIntent?.status === "requires_capture" || paymentIntent?.status === "succeeded") {
      onAuthorized();
    } else {
      setError("Payment wasn't authorized. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Your card is authorized for <span className="text-gray-100 font-medium">${amount}</span> now — you're
        only actually charged once a recovery unit marks the job complete.
      </p>
      <PaymentElement />
      {error && <p className="text-orange-400 text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button tone="stone" onClick={onBack} disabled={submitting}>Back</Button>
        <Button tone="orange" onClick={pay} disabled={!stripe || submitting} className="flex-1">
          {submitting ? "AUTHORIZING..." : `AUTHORIZE $${amount} & BROADCAST`}
        </Button>
      </div>
    </div>
  );
}

function StrandedForm({ userId, profile, onCreated, onCancel, onNeedAuth }) {
  const [vehicle, setVehicle] = useState(null);
  const [situation, setSituation] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [payment, setPayment] = useState(null); // { clientSecret, paymentIntentId, amount } once authorize step is reached

  function toggleEquip(item) {
    setEquipment((e) => (e.includes(item) ? e.filter((x) => x !== item) : [...e, item]));
  }

  async function proceedToPayment() {
    if (!vehicle || !situation) return;
    if (!userId) {
      onNeedAuth("Sign in to broadcast your request.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { clientSecret, paymentIntentId, amount } = await createPaymentIntent(situation);
      setPayment({ clientSecret, paymentIntentId, amount });
    } catch (err) {
      setError(err.message || "Couldn't start payment. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishBroadcast() {
    setBroadcasting(true);
    setError("");
    try {
      const loc = await getCurrentLocation();
      const s = sit(situation);
      const job = await createJob(userId, {
        vehicle,
        situation,
        equipment,
        notes: notes.trim(),
        lat: loc.lat,
        lng: loc.lng,
        coords: formatCoordLabel(loc.lat, loc.lng),
        distance: +(2 + Math.random() * 6).toFixed(1),
        payout: s.payout,
        stripePaymentIntentId: payment.paymentIntentId,
      });
      onCreated(job.id);
    } catch (err) {
      setError(err.message || "Payment was authorized but the request couldn't be posted — contact support.");
      setBroadcasting(false);
    }
  }

  const canSubmit = vehicle && situation;

  if (payment) {
    return (
      <div className="max-w-lg mx-auto px-6 py-10">
        <button onClick={() => setPayment(null)} className="text-gray-400 text-xs mb-6 flex items-center gap-1" disabled={broadcasting}>
          <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
        </button>
        <h2 className="text-gray-50 font-semibold text-xl mb-1 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-orange-500" /> Authorize payment
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {sit(situation)?.label} &middot; {veh(vehicle)?.label}
        </p>

        {broadcasting ? (
          <p className="text-gray-400 text-sm">Broadcasting your request...</p>
        ) : (
          <PaymentStep
            clientSecret={payment.clientSecret}
            amount={payment.amount}
            onBack={() => setPayment(null)}
            onAuthorized={finishBroadcast}
          />
        )}
        {error && <p className="text-orange-400 text-xs mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <button onClick={onCancel} className="text-gray-400 text-xs mb-6 flex items-center gap-1">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
      </button>
      <h2 className="text-gray-50 font-semibold text-xl mb-1">Report your situation</h2>
      <p className="text-gray-400 text-sm mb-6">
        {profile ? (
          <>Posting as <span className="text-gray-200">{profile.display_name}</span> — this goes to the live board,
          any online recovery unit can see and accept it.</>
        ) : (
          "Fill this out, then sign in to broadcast it to the live board."
        )}
      </p>

      <div className="space-y-6">
        <div>
          <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">Vehicle type</p>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((v) => {
              const Icon = v.icon;
              const active = vehicle === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setVehicle(v.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm ${active ? "bg-orange-950 border-orange-600 text-orange-400" : "bg-gray-800 border-gray-700 text-gray-300"}`}
                >
                  <Icon className="w-4 h-4 shrink-0" /> {v.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">Situation</p>
          <div className="grid grid-cols-2 gap-2">
            {SITUATIONS.map((s) => {
              const Icon = s.icon;
              const active = situation === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSituation(s.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left ${active ? "bg-orange-950 border-orange-600 text-orange-400" : "bg-gray-800 border-gray-700 text-gray-300"}`}
                >
                  <Icon className="w-4 h-4 shrink-0" /> {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">Equipment you think is needed</p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((item) => {
              const active = equipment.includes(item);
              return (
                <button
                  key={item}
                  onClick={() => toggleEquip(item)}
                  className={`px-3 py-1.5 rounded-full border text-xs ${active ? "bg-emerald-950 border-emerald-600 text-emerald-400" : "bg-gray-800 border-gray-700 text-gray-500"}`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">Notes for the rescuer</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Rear axle buried past the frame, on a slope, two passengers, no cell signal below this point..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-100 placeholder-gray-500 resize-none"
            rows={3}
          />
        </div>

        {error && <p className="text-orange-400 text-xs">{error}</p>}

        <Button tone="orange" disabled={!canSubmit || submitting} onClick={proceedToPayment} className="w-full">
          {submitting ? "STARTING PAYMENT..." : "CONTINUE TO PAYMENT"}
        </Button>
      </div>
    </div>
  );
}

function StrandedStatus({ jobId, onDone, onCancel }) {
  const [job, setJob] = useState(null);

  const refresh = useCallback(async () => {
    const j = await loadJob(jobId);
    if (j) setJob(j);
  }, [jobId]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToJob(jobId, refresh);
    return unsubscribe;
  }, [jobId, refresh]);

  async function handleCancel() {
    try {
      await cancelPayment(jobId);
    } catch (err) {
      console.error(err);
    }
    onCancel();
  }

  if (!job) {
    return <div className="max-w-lg mx-auto px-6 py-10 text-gray-400 text-sm">Loading request...</div>;
  }

  if (job.status === "open") {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 flex flex-col items-center text-center gap-4">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-orange-600 opacity-20 animate-ping" />
          <Radio className="w-8 h-8 text-orange-600 relative" />
        </div>
        <p className="text-gray-100 font-medium text-sm">Broadcasting to nearby units...</p>
        <p className="text-gray-400 text-xs">Open the ops board in another tab or account to accept this job live.</p>
        <Coord>{job.coords}</Coord>
        <button onClick={handleCancel} className="text-gray-400 text-xs underline underline-offset-2 mt-2">Cancel request</button>
      </div>
    );
  }

  if (job.status === "complete") {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-950 border border-emerald-600 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <p className="text-gray-50 font-semibold">Recovered</p>
        <p className="text-gray-400 text-sm">Total charged: <span className="text-gray-50 font-medium">${job.payout}</span></p>
        <Button tone="stone" onClick={onDone}>DONE</Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <h2 className="text-gray-50 font-semibold text-xl mb-1">Recovery in progress</h2>
      <p className="text-gray-400 text-sm mb-6">{STATUS_LABEL[job.status]}</p>

      {job.assignedUnit && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center text-gray-200 font-semibold shrink-0">
            {job.assignedUnit.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1">
            <p className="text-gray-50 font-medium text-sm">{job.assignedUnit.name}</p>
            <p className="text-gray-400 text-xs">{job.assignedUnit.rig}</p>
          </div>
          <div className="flex gap-2">
            <span className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center"><Phone className="w-3.5 h-3.5 text-gray-200" /></span>
            <span className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center"><MessageCircle className="w-3.5 h-3.5 text-gray-200" /></span>
          </div>
        </div>
      )}

      <StatusTracker status={job.status} />
    </div>
  );
}

// ---------- Ops: board + job ----------

function OpsBoard({ userId, profile, onProfileUpdate, onAccept, onNeedAuth }) {
  const [jobs, setJobs] = useState([]);
  const [online, setOnline] = useState(true);
  const [rigInput, setRigInput] = useState("");
  const [savingRig, setSavingRig] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [selfLocation, setSelfLocation] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const refresh = useCallback(async () => {
    const all = await loadAllJobs();
    setJobs(all);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToJobsBoard(refresh);
    return unsubscribe;
  }, [refresh]);

  // only ask for location once the operator actually opens the map view
  useEffect(() => {
    if (showMap && !selfLocation) {
      getCurrentLocation().then(setSelfLocation);
    }
  }, [showMap, selfLocation]);

  const open = jobs.filter((j) => j.status === "open");
  const mine = userId ? jobs.filter((j) => j.assignedOperatorId === userId && j.status !== "complete") : [];

  async function saveRig() {
    if (!userId) {
      onNeedAuth("Sign in to set up your recovery unit.");
      return;
    }
    if (!rigInput.trim()) return;
    setSavingRig(true);
    try {
      await updateProfile(userId, { rig: rigInput.trim(), role: "operator" });
      onProfileUpdate();
    } finally {
      setSavingRig(false);
    }
  }

  async function accept(job) {
    if (!userId) {
      onNeedAuth("Sign in to accept this job.");
      return;
    }
    setAcceptError("");
    try {
      await acceptJob(job.id, userId);
      onAccept(job.id);
    } catch (err) {
      setAcceptError(
        err.message?.includes("row-level security") || err.code === "42501"
          ? "Your account isn't fully set up to accept jobs yet — check verification and payout status above."
          : err.message || "Couldn't accept that job — someone may have just taken it."
      );
    }
  }

  async function startConnect() {
    setConnecting(true);
    setConnectError("");
    try {
      const { url } = await createConnectAccount();
      window.location.href = url;
    } catch (err) {
      setConnectError(err.message || "Couldn't start payout setup. Try again.");
      setConnecting(false);
    }
  }

  // signed in but no rig on file yet — treat this as "not set up as an operator"
  if (userId && !profile?.rig) {
    return (
      <div className="max-w-lg mx-auto px-6 py-10">
        <h2 className="text-gray-50 font-semibold text-xl mb-1">Set up your recovery unit</h2>
        <p className="text-gray-400 text-sm mb-6">
          Tell requesters what you're driving so they know what kind of recovery you can do.
        </p>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <label className="text-gray-400 text-xs font-medium block uppercase tracking-wide">Your rig</label>
          <input
            value={rigInput}
            onChange={(e) => setRigInput(e.target.value)}
            placeholder="e.g. Ram 2500 w/ 12k winch"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500"
          />
          <Button tone="emerald" onClick={saveRig} disabled={savingRig || !rigInput.trim()} className="w-full">
            {savingRig ? "SAVING..." : "SAVE AND CONTINUE"}
          </Button>
        </div>
      </div>
    );
  }

  // rig is set but Stripe payouts aren't connected yet — required before
  // accepting jobs, since acceptance now implies being able to receive the
  // eventual payout transfer (see the jobs_operator_update RLS policy).
  if (userId && profile?.rig && !profile?.stripe_payouts_enabled) {
    return (
      <div className="max-w-lg mx-auto px-6 py-10">
        <h2 className="text-gray-50 font-semibold text-xl mb-1">Set up payouts</h2>
        <p className="text-gray-400 text-sm mb-6">
          Connect a payout account so you're paid automatically as soon as you mark a job complete.
        </p>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-gray-400 text-sm">
            You'll be redirected to Stripe to verify your identity and add a bank account — takes a few minutes.
          </p>
          {connectError && <p className="text-orange-400 text-xs">{connectError}</p>}
          <Button
            tone="emerald"
            onClick={startConnect}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" /> {connecting ? "REDIRECTING..." : "CONNECT PAYOUT ACCOUNT"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-gray-50 font-semibold text-xl">Recovery board</h2>
          {profile ? (
            <p className="text-gray-400 text-sm">Signed in as <span className="text-gray-200">{profile.display_name}</span> &middot; {profile.rig}</p>
          ) : (
            <p className="text-gray-400 text-sm">Browsing as a guest — sign in to accept jobs.</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex bg-gray-800 border border-gray-700 rounded-full p-1">
            <button
              onClick={() => setShowMap(false)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${!showMap ? "bg-gray-600 text-white" : "text-gray-400"}`}
            >
              List
            </button>
            <button
              onClick={() => setShowMap(true)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${showMap ? "bg-gray-600 text-white" : "text-gray-400"}`}
            >
              <MapPin className="w-3.5 h-3.5" /> Map
            </button>
          </div>
          {userId && (
            <button
              onClick={() => setOnline((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${online ? "bg-emerald-950 border-emerald-600 text-emerald-400" : "bg-gray-700 border-gray-600 text-gray-500"}`}
            >
              <Power className="w-3.5 h-3.5" /> {online ? "Online" : "Offline"}
            </button>
          )}
        </div>
      </div>

      {userId && !profile?.is_verified && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl p-4 mb-6 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
          <p className="text-orange-400 text-sm">
            Your account is pending verification. You can browse the board, but you won't be able to accept jobs
            until an admin verifies your account.
          </p>
        </div>
      )}

      {acceptError && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl p-3 mb-6">
          <p className="text-orange-400 text-sm">{acceptError}</p>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mb-8">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Your active job</p>
          {mine.map((j) => (
            <button
              key={j.id}
              onClick={() => onAccept(j.id)}
              className="w-full text-left bg-gray-800 border border-emerald-800 rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-gray-50 font-medium text-sm">{sit(j.situation)?.label}</p>
                <p className="text-gray-400 text-xs">{j.requester} &middot; {STATUS_LABEL[j.status]}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          ))}
        </div>
      )}

      {!online ? (
        <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-2 border border-dashed border-gray-700 rounded-xl">
          <Compass className="w-8 h-8 text-gray-500" />
          <p className="text-gray-400 text-sm">You're offline. Go online to see nearby requests.</p>
        </div>
      ) : showMap ? (
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{open.length} open request{open.length === 1 ? "" : "s"} &middot; live map</p>
          <JobsMap
            jobs={open.map((j) => ({ ...j, situationLabel: sit(j.situation)?.label, vehicleLabel: veh(j.vehicle)?.label }))}
            selfLocation={selfLocation}
            selfLabel={profile?.display_name || "You"}
            onAccept={accept}
            acceptDisabled={userId ? !profile?.is_verified : false}
          />
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">{open.length} open request{open.length === 1 ? "" : "s"}</p>
          {open.length === 0 && (
            <p className="text-gray-500 text-sm py-8 text-center border border-dashed border-gray-700 rounded-xl">
              No open requests right now. Post one from the "I'm stuck" side to see it appear here live.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {open.map((j) => {
              const s = sit(j.situation);
              const v = veh(j.vehicle);
              return (
                <div key={j.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-50 font-medium text-sm">{s?.label}</p>
                      <p className="text-gray-400 text-xs">{v?.label} &middot; {j.requester}</p>
                    </div>
                    <Badge tone="warn">${j.payout}</Badge>
                  </div>
                  {j.equipment?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {j.equipment.map((e) => (
                        <span key={e} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{e}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                    <Coord>{j.coords}</Coord>
                    <span>{j.distance} mi away</span>
                  </div>
                  <Button
                    tone="emerald"
                    size="sm"
                    onClick={() => accept(j)}
                    disabled={userId ? !profile?.is_verified : false}
                    className="w-full mt-1"
                  >
                    Accept job
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OpsJob({ jobId, onExit }) {
  const [job, setJob] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const j = await loadJob(jobId);
    if (j) setJob(j);
  }, [jobId]);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToJob(jobId, refresh);
    return unsubscribe;
  }, [jobId, refresh]);

  async function advance() {
    if (!job) return;
    const idx = STATUS_STEPS.indexOf(job.status);
    const next = STATUS_STEPS[Math.min(idx + 1, STATUS_STEPS.length - 1)];
    setAdvancing(true);
    setError("");
    try {
      // the final transition captures payment and pays the operator out,
      // so it goes through the server function instead of a direct update
      const updated = next === "complete" ? await completeJob(job.id) : await advanceJobStatus(job.id, next);
      setJob(updated);
    } catch (err) {
      setError(err.message || "Couldn't update this job. Try again.");
    } finally {
      setAdvancing(false);
    }
  }

  if (!job) return <div className="max-w-lg mx-auto px-6 py-10 text-gray-400 text-sm">Loading job...</div>;

  const done = job.status === "complete";
  const nextLabel = STATUS_LABEL[STATUS_STEPS[STATUS_STEPS.indexOf(job.status) + 1]];

  return (
    <div className="max-w-lg mx-auto px-6 py-10">
      <button onClick={onExit} className="text-gray-400 text-xs mb-6 flex items-center gap-1">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to board
      </button>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-gray-50 font-semibold text-xl">{job.requester}</h2>
        <Badge tone="ok">${job.payout}</Badge>
      </div>
      <p className="text-gray-400 text-sm mb-2">{sit(job.situation)?.label} &middot; {veh(job.vehicle)?.label}</p>
      <div className="flex items-center gap-2 text-gray-400 text-xs mb-6">
        <MapPin className="w-3.5 h-3.5" /> <Coord>{job.coords}</Coord>
      </div>

      {job.notes && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Requester notes</p>
          <p className="text-gray-200 text-sm">{job.notes}</p>
        </div>
      )}

      <StatusTracker status={job.status} />

      {error && <p className="text-orange-400 text-xs mt-4">{error}</p>}

      <div className="mt-6">
        {done ? (
          <Button tone="stone" disabled className="w-full">JOB COMPLETE</Button>
        ) : (
          <Button tone="emerald" onClick={advance} disabled={advancing} className="w-full">
            {advancing
              ? nextLabel === "Complete" ? "CAPTURING PAYMENT..." : "UPDATING..."
              : `MARK: ${nextLabel?.toUpperCase()}`}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- public live map ----------

function LiveMapView({ userId, profile, onNeedAuth, onAccept, onBack }) {
  const [jobs, setJobs] = useState([]);
  const [selfLocation, setSelfLocation] = useState(null);
  const [acceptError, setAcceptError] = useState("");

  const refresh = useCallback(async () => {
    const all = await loadAllJobs();
    setJobs(all);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToJobsBoard(refresh);
    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    getCurrentLocation().then(setSelfLocation);
  }, []);

  const open = jobs.filter((j) => j.status === "open");

  async function accept(job) {
    if (!userId) {
      onNeedAuth("Sign in to accept this job.");
      return;
    }
    setAcceptError("");
    try {
      await acceptJob(job.id, userId);
      onAccept(job.id);
    } catch (err) {
      setAcceptError(
        err.message?.includes("row-level security") || err.code === "42501"
          ? "Your account isn't verified as a recovery operator yet — set up your rig from the Recovery Unit tab."
          : err.message || "Couldn't accept that job — someone may have just taken it."
      );
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <button onClick={onBack} className="text-gray-400 text-xs mb-6 flex items-center gap-1">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
      </button>
      <h2 className="text-gray-50 font-semibold text-xl mb-1">Live board</h2>
      <p className="text-gray-400 text-sm mb-6">
        {open.length} open request{open.length === 1 ? "" : "s"} right now &middot; updates live
      </p>

      {acceptError && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl p-3 mb-6">
          <p className="text-orange-400 text-sm">{acceptError}</p>
        </div>
      )}

      <JobsMap
        jobs={open.map((j) => ({ ...j, situationLabel: sit(j.situation)?.label, vehicleLabel: veh(j.vehicle)?.label }))}
        selfLocation={selfLocation}
        selfLabel={profile?.display_name || "You"}
        onAccept={accept}
        acceptDisabled={userId ? !profile?.is_verified : false}
      />
    </div>
  );
}

// ---------- app shell ----------

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("landing"); // landing | stranded-form | stranded-status | ops-board | ops-job | map
  const [myJobId, setMyJobId] = useState(null);
  const [opsJobId, setOpsJobId] = useState(null);
  const [authPrompt, setAuthPrompt] = useState(null); // null | { mode, message }

  useEffect(() => {
    const unsubscribe = onAuthStateChange((s) => setSession(s));
    return unsubscribe;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) setProfile(await getProfile(session.user.id));
  }, [session]);

  useEffect(() => {
    if (session?.user) refreshProfile();
    else setProfile(null);
  }, [session, refreshProfile]);

  // once a sign-in/sign-up succeeds, dismiss whatever prompted it
  useEffect(() => {
    if (session) setAuthPrompt(null);
  }, [session]);

  // Stripe redirects operators back here after hosted Connect onboarding —
  // re-check their payout status immediately rather than waiting on a
  // webhook, since it needs to be right the moment they land back.
  useEffect(() => {
    if (!session?.user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") !== "return") return;
    window.history.replaceState({}, "", window.location.pathname);
    syncConnectStatus().then(refreshProfile).catch((err) => console.error("syncConnectStatus failed", err));
  }, [session, refreshProfile]);

  function needAuth(message) {
    setAuthPrompt({ mode: "signup", message });
  }

  if (session === undefined) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Loading...</div>;
  }

  if (session && !profile) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Setting up your account...</div>;
  }

  const userId = session?.user?.id ?? null;

  return (
    <div className="min-h-screen bg-gray-950 relative">
      <TopoBackdrop />
      <div className="relative z-10">
      <div className="border-b border-gray-700 sticky top-0 bg-gray-950/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <button onClick={() => setView("landing")} className="flex items-center gap-2 text-gray-200 font-semibold text-sm">
            <Zap className="w-4 h-4 text-orange-600" /> TUG
          </button>
          <div className="flex items-center gap-3">
            {view !== "landing" && (
              <div className="flex bg-gray-800 border border-gray-700 rounded-full p-1">
                <button
                  onClick={() => setView(myJobId ? "stranded-status" : "stranded-form")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${view.startsWith("stranded") ? "bg-orange-600 text-white" : "text-gray-400"}`}
                >
                  <LifeBuoy className="w-3.5 h-3.5" /> STRANDED
                </button>
                <button
                  onClick={() => setView("ops-board")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${view.startsWith("ops") ? "bg-emerald-600 text-white" : "text-gray-400"}`}
                >
                  <Truck className="w-3.5 h-3.5" /> RECOVERY UNIT
                </button>
              </div>
            )}
            {session ? (
              <button onClick={() => signOut()} className="text-gray-500 hover:text-gray-300" aria-label="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAuthPrompt({ mode: "signin" })}
                  className="text-gray-300 hover:text-gray-100 text-xs font-semibold px-3 py-1.5"
                >
                  SIGN IN
                </button>
                <Button tone="orange" size="sm" onClick={() => setAuthPrompt({ mode: "signup" })}>
                  SIGN UP
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {view === "landing" && (
        <Landing
          onStranded={() => setView("stranded-form")}
          onOps={() => setView("ops-board")}
          onViewMap={() => setView("map")}
        />
      )}

      {view === "map" && (
        <LiveMapView
          userId={userId}
          profile={profile}
          onNeedAuth={needAuth}
          onBack={() => setView("landing")}
          onAccept={(id) => {
            setOpsJobId(id);
            setView("ops-job");
          }}
        />
      )}

      {view === "stranded-form" && (
        <StrandedForm
          userId={userId}
          profile={profile}
          onNeedAuth={needAuth}
          onCreated={(id) => {
            setMyJobId(id);
            setView("stranded-status");
          }}
          onCancel={() => setView("landing")}
        />
      )}

      {view === "stranded-status" && myJobId && (
        <StrandedStatus
          jobId={myJobId}
          onDone={() => {
            setMyJobId(null);
            setView("landing");
          }}
          onCancel={() => {
            setMyJobId(null);
            setView("landing");
          }}
        />
      )}

      {view === "ops-board" && (
        <OpsBoard
          userId={userId}
          profile={profile}
          onProfileUpdate={refreshProfile}
          onNeedAuth={needAuth}
          onAccept={(id) => {
            setOpsJobId(id);
            setView("ops-job");
          }}
        />
      )}

      {view === "ops-job" && opsJobId && <OpsJob jobId={opsJobId} onExit={() => setView("ops-board")} />}
      </div>

      {authPrompt && (
        <AuthGate
          initialMode={authPrompt.mode}
          message={authPrompt.message}
          onClose={() => setAuthPrompt(null)}
        />
      )}
    </div>
  );
}
