import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Gauge,
  Lightning,
  LockKey,
  Plus,
  ShieldCheck,
  SidebarCollapse,
  SidebarExpand,
  SignOut,
  TerminalWindow,
  Trash,
  Warning,
  X,
} from "./icons";
import {
  OG_CHAIN_ID,
  OG_EXPLORER_URL,
  MANAGER_ADDRESS,
  ASSET_SYMBOL,
  amountToUnits,
  getInjectedProvider,
  getSigner,
  managerWith,
  isValidAddress,
  selectorFromSignature,
  toPolicyRecord,
  type PolicyRecord,
} from "./lib/contract";
type View = "overview" | "policies" | "console" | "activity";
type Activity = {
  id: string;
  action: "SWAP" | "TRANSFER";
  amount: string;
  result: "executed" | "blocked";
  reason?: string;
  time: number;
};
type Draft = {
  name: string;
  agent: string;
  target: string;
  maxPerTx: string;
  totalLimit: string;
  maxTransactions: string;
  expiryHours: string;
  actions: number;
  functionSignature: string;
  prompt: string;
};
const emptyDraft: Draft = {
  name: "",
  agent: "",
  target: "",
  maxPerTx: "10",
  totalLimit: "50",
  maxTransactions: "10",
  expiryHours: "6",
  actions: 1,
  functionSignature: "swap(address,uint256,address)",
  prompt: "",
};
const STORAGE_KEY = "ghostkey.local-state.v1";
const shortAddress = (v: string) =>
  v ? v.slice(0, 6) + "…" + v.slice(-4) : "—";
const timeLeft = (unix: number) => {
  const s = Math.max(0, unix - Math.floor(Date.now() / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? h + "h " + m + "m" : m + "m";
};
function GhostMark() {
  return (
    <span className="ghost-icon" aria-hidden="true">
      ◒
    </span>
  );
}
export default function App() {
  const [view, setView] = useState<View>("overview"),
    [address, setAddress] = useState(""),
    [policies, setPolicies] = useState<PolicyRecord[]>([]),
    [activity, setActivity] = useState<Activity[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [showCreate, setShowCreate] = useState(false),
    [step, setStep] = useState(1),
    [consolePolicy, setConsolePolicy] = useState("");
  const [consoleAction, setConsoleAction] = useState<"SWAP" | "TRANSFER">(
      "SWAP",
    ),
    [consoleAmount, setConsoleAmount] = useState("5"),
    [notice, setNotice] = useState<{
      type: "success" | "error" | "info";
      text: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [aiBusy, setAiBusy] = useState(false);
  const active = policies.filter(
      (p) => p.active && p.expiresAt > Date.now() / 1000,
    ),
    selected = policies.find((p) => p.id === consolePolicy) || active[0];
  const loadLocal = useCallback(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setPolicies(v.policies || []);
      setActivity(v.activity || []);
    } catch {
      setPolicies([]);
      setActivity([]);
    }
  }, []);
  const persist = useCallback(
    (p: PolicyRecord[], a: Activity[]) =>
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ policies: p, activity: a }),
      ),
    [],
  );
  const loadChain = useCallback(
    async (wallet: string) => {
      if (!MANAGER_ADDRESS) {
        loadLocal();
        return;
      }
      const provider = getInjectedProvider();
      if (!provider) return;
      try {
        const manager = managerWith(provider);
        const ids = (await manager.getOwnerPolicies(wallet)) as bigint[];
        const rows = await Promise.all(
          ids.map(async (id) =>
            toPolicyRecord(id, await manager.getPolicy(id), "chain"),
          ),
        );
        setPolicies(rows.reverse());
      } catch (e) {
        setNotice({
          type: "error",
          text: e instanceof Error ? e.message : "Could not load policies.",
        });
      }
    },
    [loadLocal],
  );
  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const provider = getInjectedProvider();
      if (!provider)
        throw new Error("Install MetaMask or another EVM wallet to connect.");
      await provider.send("eth_requestAccounts", []);
      const signer = await getSigner();
      const wallet = await signer.getAddress();
      setAddress(wallet);
      await loadChain(wallet);
      setNotice({
        type: "success",
        text: "Connected to " + shortAddress(wallet) + " on 0G Galileo.",
      });
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Wallet connection failed.",
      });
    } finally {
      setBusy(false);
    }
  }, [loadChain]);
  useEffect(() => {
    loadLocal();
  }, [loadLocal]);
  useEffect(() => {
    if (active[0] && !consolePolicy) setConsolePolicy(active[0].id);
  }, [active, consolePolicy]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const eth = (
      window as Window & {
        ethereum?: { on?: Function; removeListener?: Function };
      }
    ).ethereum;
    const changed = (args: string[]) => {
      setAddress(args?.[0] || "");
      if (args?.[0]) loadChain(args[0]);
    };
    eth?.on?.("accountsChanged", changed);
    return () => eth?.removeListener?.("accountsChanged", changed);
  }, [loadChain]);
  const createPolicy = async () => {
    if (
      !draft.name ||
      !isValidAddress(draft.agent) ||
      !isValidAddress(draft.target)
    ) {
      setNotice({
        type: "error",
        text: "Add a name and valid EVM addresses for the agent and target.",
      });
      return;
    }
    if (!draft.actions) {
      setNotice({ type: "error", text: "Allow at least one agent action." });
      return;
    }
    const maxPerTx = Number(draft.maxPerTx);
    const totalLimit = Number(draft.totalLimit);
    const maxTransactions = Number(draft.maxTransactions);
    const expiryHours = Number(draft.expiryHours);
    if (
      !Number.isFinite(maxPerTx) ||
      maxPerTx <= 0 ||
      !Number.isFinite(totalLimit) ||
      totalLimit < maxPerTx ||
      !Number.isInteger(maxTransactions) ||
      maxTransactions <= 0 ||
      !Number.isInteger(expiryHours) ||
      expiryHours <= 0 ||
      expiryHours > 8760
    ) {
      setNotice({
        type: "error",
        text: "Review the limits. Expiry must be between 1 hour and 1 year.",
      });
      return;
    }
    let allowedSelector: string;
    try {
      allowedSelector = selectorFromSignature(draft.functionSignature);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Invalid function signature.",
      });
      return;
    }
    setBusy(true);
    try {
      if (!MANAGER_ADDRESS || !address) {
        const local: PolicyRecord = {
          id: "local-" + Date.now(),
          agent: draft.agent,
          target: draft.target,
          maxPerTx: draft.maxPerTx,
          totalLimit: draft.totalLimit,
          spent: "0",
          expiresAt: Math.floor(Date.now() / 1000) + expiryHours * 3600,
          maxTransactions,
          transactionCount: 0,
          actionMask: draft.actions,
          allowedSelector,
          active: true,
          source: "local",
        };
        const next = [local, ...policies];
        setPolicies(next);
        persist(next, activity);
        setNotice({
          type: "success",
          text: "Permission saved locally. Configure a manager address for onchain signing.",
        });
      } else {
        const manager = managerWith(await getSigner());
        const tx = await manager.createPolicy(
          draft.agent,
          draft.target,
          amountToUnits(String(maxPerTx)),
          amountToUnits(String(totalLimit)),
          Math.floor(Date.now() / 1000) + expiryHours * 3600,
          maxTransactions,
          draft.actions,
          allowedSelector,
        );
        setNotice({
          type: "info",
          text: "Transaction submitted. Waiting for 0G confirmation…",
        });
        await tx.wait();
        await loadChain(address);
        setNotice({
          type: "success",
          text: "Permission created on 0G Galileo.",
        });
      }
      setShowCreate(false);
      setStep(1);
      setDraft(emptyDraft);
      setView("policies");
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Could not create permission.",
      });
    } finally {
      setBusy(false);
    }
  };
  const interpretPolicy = async () => {
    if (draft.prompt.trim().length < 12) {
      setNotice({
        type: "error",
        text: "Describe the permission in a little more detail.",
      });
      return;
    }
    setAiBusy(true);
    try {
      const signer = await getSigner();
      const wallet = await signer.getAddress();
      const timestamp = Date.now();
      const message =
        "GhostKey policy request\nWallet:" +
        wallet.toLowerCase() +
        "\nTimestamp:" +
        timestamp +
        "\nPrompt:" +
        draft.prompt.trim();
      const signature = await signer.signMessage(message);
      const response = await fetch("/api/parse-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          timestamp,
          prompt: draft.prompt.trim(),
          signature,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "0G Compute could not parse the permission.",
        );
      setDraft({
        ...draft,
        maxPerTx: String(result.maxPerTx),
        totalLimit: String(result.totalLimit),
        maxTransactions: String(result.maxTransactions),
        expiryHours: String(result.expiryHours),
        actions:
          (result.allowedActions.includes("SWAP") ? 1 : 0) |
          (result.allowedActions.includes("TRANSFER") ? 2 : 0),
      });
      setNotice({
        type: "success",
        text: "0G Compute structured the limits. Review them before signing.",
      });
      setStep(2);
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not interpret the policy.",
      });
    } finally {
      setAiBusy(false);
    }
  };
  const revoke = async (policy: PolicyRecord) => {
    setBusy(true);
    try {
      if (policy.source === "local" || !MANAGER_ADDRESS) {
        const next = policies.map((p) =>
          p.id === policy.id ? { ...p, active: false } : p,
        );
        setPolicies(next);
        persist(next, activity);
        setNotice({ type: "success", text: "Permission revoked." });
      } else {
        const tx = await managerWith(await getSigner()).revokePolicy(policy.id);
        await tx.wait();
        await loadChain(address);
        setNotice({ type: "success", text: "Permission revoked on 0G." });
      }
    } catch (e) {
      setNotice({
        type: "error",
        text: e instanceof Error ? e.message : "Could not revoke permission.",
      });
    } finally {
      setBusy(false);
    }
  };
  const simulate = () => {
    if (!selected) {
      setNotice({
        type: "error",
        text: "Create or load an active permission first.",
      });
      return;
    }
    const amount = Number(consoleAmount || 0),
      bit = consoleAction === "SWAP" ? 1 : 2,
      violations: string[] = [];
    if (!Number.isFinite(amount) || amount <= 0)
      violations.push("Amount must be greater than zero");
    if (!selected.active) violations.push("Permission is revoked");
    if (selected.expiresAt <= Date.now() / 1000)
      violations.push("Permission has expired");
    if (!(selected.actionMask & bit))
      violations.push(consoleAction.toLowerCase() + " is disabled");
    if (amount > Number(selected.maxPerTx))
      violations.push(
        "Over " + selected.maxPerTx + " " + ASSET_SYMBOL + " per transaction",
      );
    if (Number(selected.spent) + amount > Number(selected.totalLimit))
      violations.push("Total budget exceeded");
    if (selected.transactionCount >= selected.maxTransactions)
      violations.push("Transaction count exceeded");
    const blocked = violations.length > 0,
      row: Activity = {
        id: String(Date.now()),
        action: consoleAction,
        amount: consoleAmount,
        result: blocked ? "blocked" : "executed",
        reason: blocked ? violations.join(" · ") : undefined,
        time: Date.now(),
      },
      nextA = [row, ...activity];
    setActivity(nextA);
    if (!blocked && selected.source === "local") {
      const nextP = policies.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              spent: (Number(p.spent) + amount).toFixed(2),
              transactionCount: p.transactionCount + 1,
            }
          : p,
      );
      setPolicies(nextP);
      persist(nextP, nextA);
      setNotice({
        type: "success",
        text: "Approved — simulated execution recorded.",
      });
    } else if (!blocked) {
      persist(policies, nextA);
      setNotice({
        type: "info",
        text: "Policy check passed. No onchain transaction was submitted by this simulation.",
      });
    } else {
      persist(policies, nextA);
      setNotice({
        type: "error",
        text: "Blocked — " + violations[0] + ". No funds moved.",
      });
    }
  };
  if (!address)
    return (
      <>
        <Landing connect={connect} busy={busy} />
        {notice && <Toast notice={notice} dismiss={() => setNotice(null)} />}
      </>
    );
  const budget = active.reduce((s, p) => s + Number(p.totalLimit), 0),
    spent = active.reduce((s, p) => s + Number(p.spent), 0);
  return (
    <div className={sidebarOpen ? "app-shell" : "app-shell sidebar-collapsed"}>
      <aside className={sidebarOpen ? "sidebar" : "sidebar collapsed"}>
        <div className="brand">
          <span className="brand-mark">
            <GhostMark />
          </span>
          <span className="brand-word">ghostkey</span>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <SidebarCollapse size={17} />
            ) : (
              <SidebarExpand size={17} />
            )}
          </button>
        </div>
        <div className="network-pill">
          <span className="status-dot" />
          0G Galileo <span className="network-id">#{OG_CHAIN_ID}</span>
        </div>
        <nav className="side-nav">
          {(
            [
              ["overview", Gauge, "Overview"],
              ["policies", LockKey, "Permissions"],
              ["console", TerminalWindow, "Agent console"],
              ["activity", FileText, "Activity"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              className={view === key ? "nav-item active" : "nav-item"}
              onClick={() => setView(key)}
            >
              <Icon size={18} weight="duotone" />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            className="wallet-link"
            href={OG_EXPLORER_URL + "/address/" + address}
            target="_blank"
            rel="noreferrer"
          >
            <span className="sidebar-label">{shortAddress(address)}</span>{" "}
            <ArrowUpRight size={14} />
          </a>
          <button className="disconnect" onClick={() => setAddress("")}>
            <SignOut size={16} />
            <span className="sidebar-label">Disconnect</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">SECURITY CONTROL PLANE</p>
            <h1>
              {view === "overview"
                ? "Good to see you."
                : view === "policies"
                  ? "Permissions"
                  : view === "console"
                    ? "Agent console"
                    : "Activity"}
            </h1>
          </div>
          <div className="topbar-actions">
            <span
              className={
                MANAGER_ADDRESS ? "contract-state ready" : "contract-state"
              }
            >
              <span className="status-dot" />
              {MANAGER_ADDRESS ? "Onchain mode" : "Preview mode"}
            </span>
            <button
              className="icon-button"
              title="Copy wallet address"
              onClick={() => navigator.clipboard?.writeText(address)}
            >
              <Copy size={17} />
            </button>
          </div>
        </header>
        {view === "overview" && (
          <Overview
            policies={policies}
            active={active}
            budget={budget}
            spent={spent}
            activity={activity}
            onCreate={() => setShowCreate(true)}
            onNavigate={setView}
          />
        )}
        {view === "policies" && (
          <Policies
            policies={policies}
            onCreate={() => setShowCreate(true)}
            onRevoke={revoke}
            busy={busy}
          />
        )}
        {view === "console" && (
          <Console
            policies={active}
            selected={selected}
            policyId={consolePolicy}
            setPolicyId={setConsolePolicy}
            action={consoleAction}
            setAction={setConsoleAction}
            amount={consoleAmount}
            setAmount={setConsoleAmount}
            onSimulate={simulate}
          />
        )}
        {view === "activity" && <ActivityView activity={activity} />}
      </main>
      {showCreate && (
        <CreateModal
          draft={draft}
          setDraft={setDraft}
          step={step}
          setStep={setStep}
          onClose={() => {
            setShowCreate(false);
            setStep(1);
          }}
          onCreate={createPolicy}
          onInterpret={interpretPolicy}
          aiBusy={aiBusy}
          busy={busy}
        />
      )}
      {notice && <Toast notice={notice} dismiss={() => setNotice(null)} />}
    </div>
  );
}
function Toast({
  notice,
  dismiss,
}: {
  notice: { type: "success" | "error" | "info"; text: string };
  dismiss: () => void;
}) {
  return (
    <div className={"toast " + notice.type} role="status">
      <span className="toast-icon">
        {notice.type === "success" ? (
          <Check size={16} />
        ) : notice.type === "error" ? (
          <Warning size={16} />
        ) : (
          <Lightning size={16} />
        )}
      </span>
      {notice.text}
      <button onClick={dismiss} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}
function Landing({ connect, busy }: { connect: () => void; busy: boolean }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <span className="brand-mark">
            <GhostMark />
          </span>
          <span>ghostkey</span>
        </div>
        <div className="landing-meta">
          <span className="status-dot" />
          Built for 0G Galileo
        </div>
        <button className="button outline" onClick={connect} disabled={busy}>
          {busy ? "Connecting…" : "Connect wallet"}
        </button>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PROGRAMMABLE AGENT PERMISSIONS</p>
          <h1>
            Give agents access.
            <br />
            <em>Keep control.</em>
          </h1>
          <p className="hero-lede">
            GhostKey puts deterministic limits between autonomous agents and
            your wallet. Approve what they can do, cap what they can spend, and
            revoke access in one click.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={connect}
              disabled={busy}
            >
              {busy ? "Connecting…" : "Launch GhostKey"}
              <span className="button-icon" aria-hidden="true">
                <ArrowUpRight size={15} />
              </span>
            </button>
            <a
              className="text-link"
              href="https://build.0g.ai/chain"
              target="_blank"
              rel="noreferrer"
            >
              Why 0G <ArrowUpRight size={15} />
            </a>
          </div>
          <div className="hero-proof">
            <span>
              <ShieldCheck size={18} />
              Policy enforced onchain
            </span>
            <span>
              <Lightning size={18} />
              0G finality
            </span>
            <span>
              <LockKey size={18} />
              Non-custodial
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="terminal-card">
            <div className="terminal-head">
              <span className="terminal-dots">
                <i />
                <i />
                <i />
              </span>
              <span>ghostkey / policy-check</span>
              <span className="terminal-live">
                <span className="status-dot" />
                LIVE
              </span>
            </div>
            <div className="terminal-body">
              <div className="terminal-line dim">agent.request({"{"}</div>
              <div className="terminal-line indent">
                <span className="key">action</span>:{" "}
                <span className="value">"TRANSFER"</span>,
              </div>
              <div className="terminal-line indent">
                <span className="key">amount</span>:{" "}
                <span className="value">"500 {ASSET_SYMBOL}"</span>,
              </div>
              <div className="terminal-line indent">
                <span className="key">recipient</span>:{" "}
                <span className="value">"0x92…BAD"</span>
              </div>
              <div className="terminal-line dim">{"}"})</div>
              <div className="terminal-rule" />
              <div className="decision blocked">
                <Warning size={18} weight="fill" />
                <div>
                  <strong>BLOCKED</strong>
                  <span>Transfer permission disabled</span>
                </div>
                <span className="decision-code">GK-004</span>
              </div>
              <div className="terminal-line dim small">
                No funds moved · policy #8291
              </div>
            </div>
          </div>
          <div className="visual-note">
            <span className="note-line" />
            AI is the actor.
            <br />
            <b>Rules stay yours.</b>
          </div>
        </div>
      </section>
      <section className="landing-strip">
        <span>Security for the agentic economy</span>
        <span>0G Chain · Agentic ID · Compute · Storage</span>
        <span>Open, inspectable, revocable</span>
      </section>
      <section className="landing-details" id="how-it-works">
        <div className="details-heading">
          <div>
            <p className="eyebrow">A CONTROL PLANE FOR AGENTS</p>
            <h2>
              Clear permissions.
              <br />
              <em>Quiet confidence.</em>
            </h2>
          </div>
          <p>
            GhostKey keeps the owner in the loop without slowing the agent down.
            Define the boundary once, inspect every request, and close access
            when the job is done.
          </p>
        </div>
        <div className="workflow-grid">
          <article className="workflow-card workflow-card-featured">
            <span className="workflow-index">01 / DEFINE</span>
            <h3>Give an agent a narrow lane.</h3>
            <p>
              Choose the target, action, function selector, spend cap,
              transaction count, and expiry.
            </p>
            <div className="workflow-meter">
              <span style={{ width: "42%" }} />
            </div>
            <span className="workflow-foot">Scope before speed</span>
          </article>
          <article className="workflow-card">
            <span className="workflow-index">02 / CHECK</span>
            <h3>Make every request legible.</h3>
            <p>
              The console shows what would pass or fail before a target
              transaction is ever submitted.
            </p>
            <div className="workflow-rule">
              <span>agent</span>
              <b>✓</b>
            </div>
            <div className="workflow-rule">
              <span>selector</span>
              <b>✓</b>
            </div>
            <div className="workflow-rule">
              <span>spend cap</span>
              <b>✓</b>
            </div>
          </article>
          <article className="workflow-card">
            <span className="workflow-index">03 / REVOKE</span>
            <h3>End access on your terms.</h3>
            <p>
              Revoke an active policy from the Permissions view, or let its
              onchain expiry close the window.
            </p>
            <div className="workflow-status">
              <span className="status-dot" /> Owner-controlled
            </div>
            <span className="workflow-foot">No silent renewal</span>
          </article>
        </div>
        <div className="landing-callout">
          <div>
            <span className="workflow-index">BUILT FOR 0G GALILEO</span>
            <strong>One wallet. One policy surface. No custody.</strong>
          </div>
          <a
            className="text-link"
            href="https://build.0g.ai/chain"
            target="_blank"
            rel="noreferrer"
          >
            Read the network docs <ArrowUpRight size={15} />
          </a>
        </div>
      </section>
    </div>
  );
}
function Overview({
  policies,
  active,
  budget,
  spent,
  activity,
  onCreate,
  onNavigate,
}: {
  policies: PolicyRecord[];
  active: PolicyRecord[];
  budget: number;
  spent: number;
  activity: Activity[];
  onCreate: () => void;
  onNavigate: (v: View) => void;
}) {
  return (
    <div className="view-stack">
      <div className="overview-grid">
        <section className="metric-panel accent-panel">
          <div className="panel-kicker">ACTIVE AGENT BUDGET</div>
          <div className="metric-value">
            ${budget.toFixed(2)}
            <span> {ASSET_SYMBOL}</span>
          </div>
          <div className="metric-sub">
            ${spent.toFixed(2)} spent across {active.length} active{" "}
            {active.length === 1 ? "permission" : "permissions"}
          </div>
          <div className="budget-track">
            <span
              style={{
                width:
                  (budget ? Math.min(100, (spent / budget) * 100) : 0) + "%",
              }}
            />
          </div>
          <div className="budget-foot">
            <span>Used</span>
            <strong>{budget ? Math.round((spent / budget) * 100) : 0}%</strong>
            <span className="remaining">
              ${Math.max(0, budget - spent).toFixed(2)} remaining
            </span>
          </div>
        </section>
        <section className="metric-panel">
          <div className="panel-kicker">POLICY HEALTH</div>
          <div className="health-row">
            <span className="health-number">{active.length}</span>
            <span className="health-label">
              active
              <br />
              permissions
            </span>
          </div>
          <div className="health-list">
            <span>
              <i className="status-dot" />
              All systems nominal
            </span>
            <span>
              <LockKey size={15} />
              Non-custodial by design
            </span>
          </div>
        </section>
        <section className="metric-panel">
          <div className="panel-kicker">BLOCKED THIS SESSION</div>
          <div className="health-row">
            <span className="health-number danger">
              {activity.filter((a) => a.result === "blocked").length}
            </span>
            <span className="health-label">
              policy
              <br />
              violations
            </span>
          </div>
          <button
            className="quiet-button"
            onClick={() => onNavigate("activity")}
          >
            Review activity <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR CONTROLLED AGENTS</p>
          <h2>Permissions</h2>
        </div>
        <button className="button primary small" onClick={onCreate}>
          <Plus size={16} />
          Add permission
        </button>
      </div>
      {policies.length ? (
        <div className="policy-grid">
          {policies.slice(0, 3).map((p) => (
            <PolicyCard key={p.id} policy={p} />
          ))}
        </div>
      ) : (
        <EmptyPolicies onCreate={onCreate} />
      )}
      <div className="section-heading activity-heading">
        <div>
          <p className="eyebrow">AUDIT TRAIL</p>
          <h2>Recent activity</h2>
        </div>
        <button className="quiet-button" onClick={() => onNavigate("activity")}>
          View all <ArrowUpRight size={15} />
        </button>
      </div>
      <ActivityRows activity={activity.slice(0, 4)} />
    </div>
  );
}
function EmptyPolicies({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <LockKey size={25} />
      </div>
      <div>
        <h3>No permissions yet</h3>
        <p>Create a bounded permission before an agent can act.</p>
      </div>
      <button className="button outline" onClick={onCreate}>
        <Plus size={16} />
        Create permission
      </button>
    </div>
  );
}
function PolicyCard({
  policy,
  onRevoke,
}: {
  policy: PolicyRecord;
  onRevoke?: (p: PolicyRecord) => void;
}) {
  return (
    <article className="policy-card">
      <div className="policy-card-head">
        <div className="agent-avatar">
          <TerminalWindow size={20} />
        </div>
        <div>
          <h3>
            {policy.source === "local" ? "Local agent" : "Agent permission"}
          </h3>
          <p>{shortAddress(policy.agent)}</p>
        </div>
        <span className={policy.active ? "status-chip" : "status-chip revoked"}>
          <i className="status-dot" />
          {policy.active ? "Active" : "Revoked"}
        </span>
      </div>
      <div className="policy-numbers">
        <div>
          <span>Per transaction</span>
          <strong>${policy.maxPerTx}</strong>
        </div>
        <div>
          <span>Total budget</span>
          <strong>${policy.totalLimit}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>
            $
            {Math.max(
              0,
              Number(policy.totalLimit) - Number(policy.spent),
            ).toFixed(2)}
          </strong>
        </div>
      </div>
      <div className="policy-card-foot">
        <span>
          Expires in <b>{policy.active ? timeLeft(policy.expiresAt) : "—"}</b>
        </span>
        {onRevoke && policy.active && (
          <button className="danger-link" onClick={() => onRevoke(policy)}>
            <Trash size={14} />
            Revoke
          </button>
        )}
      </div>
    </article>
  );
}
function Policies({
  policies,
  onCreate,
  onRevoke,
  busy,
}: {
  policies: PolicyRecord[];
  onCreate: () => void;
  onRevoke: (p: PolicyRecord) => void;
  busy: boolean;
}) {
  return (
    <div className="view-stack">
      <div className="section-heading first-heading">
        <div>
          <p className="eyebrow">DETERMINISTIC ACCESS CONTROL</p>
          <h2>Every permission is a boundary.</h2>
          <p className="section-lede">
            The contract checks the agent, action, target, spend, and expiry
            before anything moves.
          </p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={17} />
          Add permission
        </button>
      </div>
      {policies.length ? (
        <div className="policy-list">
          {policies.map((p) => (
            <div key={p.id} className="policy-list-item">
              <PolicyCard policy={p} onRevoke={busy ? undefined : onRevoke} />
              <div className="policy-detail">
                <div>
                  <span className="detail-label">Allowed action</span>
                  <strong>
                    {p.actionMask & 1 ? "Swap" : ""}
                    {p.actionMask & 1 && p.actionMask & 2 ? " + " : ""}
                    {p.actionMask & 2 ? "Transfer" : ""}
                  </strong>
                </div>
                <div>
                  <span className="detail-label">Approved target</span>
                  <strong className="mono">{shortAddress(p.target)}</strong>
                </div>
                <div>
                  <span className="detail-label">Function selector</span>
                  <strong className="mono">{p.allowedSelector}</strong>
                </div>
                <div>
                  <span className="detail-label">Usage</span>
                  <strong>
                    {p.transactionCount} / {p.maxTransactions} txs
                  </strong>
                </div>
                <div>
                  <span className="detail-label">Created</span>
                  <strong>
                    {p.source === "chain" ? "Onchain" : "Local preview"}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPolicies onCreate={onCreate} />
      )}
    </div>
  );
}
function Console({
  policies,
  selected,
  policyId,
  setPolicyId,
  action,
  setAction,
  amount,
  setAmount,
  onSimulate,
}: {
  policies: PolicyRecord[];
  selected?: PolicyRecord;
  policyId: string;
  setPolicyId: (v: string) => void;
  action: "SWAP" | "TRANSFER";
  setAction: (v: "SWAP" | "TRANSFER") => void;
  amount: string;
  setAmount: (v: string) => void;
  onSimulate: () => void;
}) {
  const bit = action === "SWAP" ? 1 : 2;
  return (
    <div className="view-stack console-view">
      <div className="section-heading first-heading">
        <div>
          <p className="eyebrow">SAFE EXECUTION PLAYGROUND</p>
          <h2>Test an agent request.</h2>
          <p className="section-lede">
            Run deterministic checks before execution. Preview mode never moves
            funds.
          </p>
        </div>
        <div className="console-badge">
          <TerminalWindow size={17} />
          Simulation
        </div>
      </div>
      <div className="console-layout">
        <section className="console-form panel">
          <div className="form-section">
            <label htmlFor="policy">Permission</label>
            <select
              id="policy"
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
              disabled={!policies.length}
            >
              <option value="">Select a permission</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortAddress(p.agent)} · ${p.totalLimit} budget
                </option>
              ))}
            </select>
          </div>
          <div className="form-section">
            <label>Requested action</label>
            <div className="segmented">
              <button
                className={action === "SWAP" ? "selected" : ""}
                onClick={() => setAction("SWAP")}
              >
                Swap
              </button>
              <button
                className={action === "TRANSFER" ? "selected" : ""}
                onClick={() => setAction("TRANSFER")}
              >
                Transfer
              </button>
            </div>
          </div>
          <div className="form-section">
            <label htmlFor="amount">
              Amount <span>{ASSET_SYMBOL}</span>
            </label>
            <div className="amount-input">
              <input
                id="amount"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
                inputMode="decimal"
              />
              <span>{ASSET_SYMBOL}</span>
            </div>
          </div>
          <button
            className="button primary execute-button"
            onClick={onSimulate}
          >
            <ShieldCheck size={18} />
            Check permission
          </button>
        </section>
        <section className="check-panel panel">
          <div className="panel-kicker">POLICY EVALUATION</div>
          {selected ? (
            <>
              <div className="check-summary">
                <div className="agent-avatar">
                  <TerminalWindow size={21} />
                </div>
                <div>
                  <strong>{shortAddress(selected.agent)}</strong>
                  <span>
                    requests {action.toLowerCase()} · {amount || "0"}{" "}
                    {ASSET_SYMBOL}
                  </span>
                </div>
                <span className="mini-status">
                  <i className="status-dot" />
                  Ready
                </span>
              </div>
              <div className="check-list">
                <CheckRow
                  label="Agent authorized"
                  value={selected.active ? "Matched" : "Revoked"}
                  ok={selected.active}
                />
                <CheckRow
                  label="Action permission"
                  value={selected.actionMask & bit ? "Allowed" : "Disabled"}
                  ok={Boolean(selected.actionMask & bit)}
                />
                <CheckRow
                  label="Per-transaction cap"
                  value={"$" + selected.maxPerTx}
                  ok={Number(amount || 0) <= Number(selected.maxPerTx)}
                />
                <CheckRow
                  label="Remaining budget"
                  value={
                    "$" +
                    Math.max(
                      0,
                      Number(selected.totalLimit) - Number(selected.spent),
                    ).toFixed(2)
                  }
                  ok={
                    Number(amount || 0) <=
                    Math.max(
                      0,
                      Number(selected.totalLimit) - Number(selected.spent),
                    )
                  }
                />
                <CheckRow
                  label="Expiry"
                  value={timeLeft(selected.expiresAt)}
                  ok={selected.expiresAt > Date.now() / 1000}
                />
              </div>
              <div className="check-foot">
                {selected.source === "local"
                  ? "Preview mode · no wallet transaction"
                  : "Policy loaded from 0G Galileo"}
              </div>
            </>
          ) : (
            <div className="check-empty">
              <LockKey size={23} />
              <p>Select an active permission to inspect a request.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
function CheckRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="check-row">
      <span className={ok ? "check-icon ok" : "check-icon fail"}>
        {ok ? <Check size={13} weight="bold" /> : <X size={13} weight="bold" />}
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function exportActivity(activity: Activity[]) {
  const header = "timestamp,action,amount_usdc,result,reason";
  const rows = activity.map((item) =>
    [
      new Date(item.time).toISOString(),
      item.action,
      item.amount,
      item.result,
      item.reason || "",
    ]
      .map((value) => '"' + value.replace(/"/g, '""') + '"')
      .join(","),
  );
  const blob = new Blob([[header, ...rows].join("\\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ghostkey-activity.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
function ActivityView({ activity }: { activity: Activity[] }) {
  return (
    <div className="view-stack">
      <div className="section-heading first-heading">
        <div>
          <p className="eyebrow">SESSION AUDIT TRAIL</p>
          <h2>Know what your agents tried.</h2>
          <p className="section-lede">
            Simulated checks stay in this browser so successful and blocked
            requests are easy to review.
          </p>
        </div>
        <div className="section-actions">
          <div className="console-badge">
            <FileText size={17} />
            {activity.length} events
          </div>
          <button
            className="button outline small"
            onClick={() => exportActivity(activity)}
            disabled={!activity.length}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="activity-panel panel">
        <ActivityRows activity={activity} />
      </div>
    </div>
  );
}
function ActivityRows({ activity }: { activity: Activity[] }) {
  if (!activity.length)
    return (
      <div className="activity-empty">
        <FileText size={22} />
        <span>No requests recorded yet.</span>
      </div>
    );
  return (
    <div className="activity-rows">
      {activity.map((item) => (
        <div className="activity-row" key={item.id}>
          <div className={"activity-icon " + item.result}>
            {item.result === "executed" ? (
              <Check size={16} weight="bold" />
            ) : (
              <Warning size={16} weight="fill" />
            )}
          </div>
          <div className="activity-main">
            <strong>
              {item.action === "SWAP" ? "Swap" : "Transfer"}{" "}
              <span>
                {item.amount} {ASSET_SYMBOL}
              </span>
            </strong>
            <span>
              {item.result === "executed"
                ? "Permission satisfied · execution recorded"
                : item.reason || "Policy violation"}
            </span>
          </div>
          <div className="activity-side">
            <b className={item.result}>
              {item.result === "executed" ? "Executed" : "Blocked"}
            </b>
            <span>
              {new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(item.time)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
function CreateModal({
  draft,
  setDraft,
  step,
  setStep,
  onClose,
  onCreate,
  onInterpret,
  aiBusy,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  step: number;
  setStep: (n: number) => void;
  onClose: () => void;
  onCreate: () => void;
  onInterpret: () => void;
  aiBusy: boolean;
  busy: boolean;
}) {
  const next =
    step === 1
      ? Boolean(
          draft.name &&
          isValidAddress(draft.agent) &&
          isValidAddress(draft.target) &&
          draft.actions &&
          draft.functionSignature,
        )
      : step === 2
        ? Number(draft.maxPerTx) > 0 &&
          Number(draft.totalLimit) >= Number(draft.maxPerTx)
        : true;
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">NEW PERMISSION</p>
            <h2 id="create-title">Set an agent boundary.</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        <div className="stepper">
          <span className={step >= 1 ? "current" : ""}>
            01 <b>Agent</b>
          </span>
          <i />
          <span className={step >= 2 ? "current" : ""}>
            02 <b>Limits</b>
          </span>
          <i />
          <span className={step >= 3 ? "current" : ""}>
            03 <b>Review</b>
          </span>
        </div>
        {step === 1 && (
          <div className="modal-body">
            <div className="ai-policy">
              <label htmlFor="policy-prompt">Describe the permission</label>
              <textarea
                id="policy-prompt"
                value={draft.prompt}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    prompt: event.target.value.slice(0, 600),
                  })
                }
                placeholder={
                  "Allow my trading agent to swap up to 50 " +
                  ASSET_SYMBOL +
                  " over the next 6 hours, with a maximum of 10 " +
                  ASSET_SYMBOL +
                  " per request."
                }
              />
              <div>
                <small>
                  Structured privately through 0G Compute. You always review
                  before signing.
                </small>
                <button
                  className="quiet-button"
                  onClick={onInterpret}
                  disabled={aiBusy}
                >
                  <Lightning size={14} />
                  {aiBusy ? "Interpreting…" : "Interpret with 0G"}
                </button>
              </div>
            </div>
            <Field label="Permission name">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Trading agent"
              />
            </Field>
            <Field label="Agent wallet">
              <input
                value={draft.agent}
                onChange={(e) => setDraft({ ...draft, agent: e.target.value })}
                placeholder="0x…"
              />
            </Field>
            <Field label="Approved target contract">
              <input
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                placeholder="0x…"
              />
              <small>Only this contract can be called by the permission.</small>
            </Field>
            <Field label="Approved function signature">
              <input
                value={draft.functionSignature}
                onChange={(e) =>
                  setDraft({ ...draft, functionSignature: e.target.value })
                }
                placeholder="swap(address,uint256,address)"
                spellCheck={false}
              />
              <small>
                GhostKey derives and enforces the exact four-byte selector.
              </small>
            </Field>
            <div className="form-section">
              <label>Allowed actions</label>
              <div className="action-checks">
                <button
                  className={
                    draft.actions & 1
                      ? "action-choice selected"
                      : "action-choice"
                  }
                  onClick={() =>
                    setDraft({ ...draft, actions: draft.actions ^ 1 })
                  }
                >
                  <span>{draft.actions & 1 ? <Check size={15} /> : null}</span>
                  Swap tokens
                </button>
                <button
                  className={
                    draft.actions & 2
                      ? "action-choice selected"
                      : "action-choice"
                  }
                  onClick={() =>
                    setDraft({ ...draft, actions: draft.actions ^ 2 })
                  }
                >
                  <span>{draft.actions & 2 ? <Check size={15} /> : null}</span>
                  Transfer tokens
                </button>
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="modal-body">
            <div className="two-col">
              <Field label="Maximum per transaction">
                <div className="input-with-suffix">
                  <input
                    value={draft.maxPerTx}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        maxPerTx: e.target.value.replace(/[^0-9.]/g, ""),
                      })
                    }
                  />
                  <span>{ASSET_SYMBOL}</span>
                </div>
              </Field>
              <Field label="Total budget">
                <div className="input-with-suffix">
                  <input
                    value={draft.totalLimit}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        totalLimit: e.target.value.replace(/[^0-9.]/g, ""),
                      })
                    }
                  />
                  <span>{ASSET_SYMBOL}</span>
                </div>
              </Field>
            </div>
            <div className="two-col">
              <Field label="Maximum transactions">
                <input
                  value={draft.maxTransactions}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      maxTransactions: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </Field>
              <Field label="Expires after">
                <div className="input-with-suffix">
                  <input
                    value={draft.expiryHours}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        expiryHours: e.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                  <span>hours</span>
                </div>
              </Field>
            </div>
            <div className="limit-note">
              <Gauge size={17} />
              <span>
                The contract rejects requests that exceed any one of these
                limits.
              </span>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="modal-body">
            <div className="review-banner">
              <ShieldCheck size={22} />
              <div>
                <strong>Ready to protect {draft.name || "this agent"}</strong>
                <span>
                  {MANAGER_ADDRESS
                    ? "You will sign one transaction on 0G Galileo."
                    : "Local preview until a manager contract is configured."}
                </span>
              </div>
            </div>
            <div className="review-list">
              <div>
                <span>Agent</span>
                <strong className="mono">{shortAddress(draft.agent)}</strong>
              </div>
              <div>
                <span>Can do</span>
                <strong>
                  {draft.actions & 1 ? "Swap" : ""}
                  {draft.actions & 1 && draft.actions & 2 ? " + " : ""}
                  {draft.actions & 2 ? "Transfer" : "—"}
                </strong>
              </div>
              <div>
                <span>Limits</span>
                <strong>
                  ${draft.maxPerTx} / tx · ${draft.totalLimit} total
                </strong>
              </div>
              <div>
                <span>Expiry</span>
                <strong>
                  {draft.expiryHours} hours · {draft.maxTransactions} txs
                </strong>
              </div>
              <div>
                <span>Target</span>
                <strong className="mono">{shortAddress(draft.target)}</strong>
              </div>
              <div>
                <span>Function</span>
                <strong className="mono">{draft.functionSignature}</strong>
              </div>
            </div>
          </div>
        )}
        <div className="modal-foot">
          <button
            className="button quiet"
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              className="button primary"
              disabled={!next}
              onClick={() => setStep(step + 1)}
            >
              Continue <ArrowUpRight size={16} />
            </button>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={onCreate}
            >
              {busy ? "Signing…" : "Create permission"}{" "}
              <ShieldCheck size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-section">
      <label>{label}</label>
      {children}
    </div>
  );
}
