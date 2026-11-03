"use client";

/* eslint-disable react-hooks/set-state-in-effect --
 * This is a data provider that synchronizes external state (SSE, polling,
 * localStorage) into React state. Synchronous state updates inside effects are
 * the intended pattern here. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as api from "@/lib/api";
import type {
  AgentProfile,
  AgentSummary,
  ChainVerification,
  HealthStatus,
  SandboxEvent,
} from "@/lib/types";

export type ConnectionState = "mock" | "connecting" | "live" | "reconnecting" | "offline";

interface PendingState {
  spawn: boolean;
  kill: string | null;
  tamper: boolean;
  reset: boolean;
  verify: boolean;
}

export interface BreachState {
  active: boolean;
  reason: string;
}

interface DashboardContextValue {
  mockMode: boolean;
  connection: ConnectionState;
  reconnectCountdown: number;
  health: HealthStatus | null;
  agents: AgentSummary[];
  events: SandboxEvent[];
  killCount: number;
  chain: ChainVerification | null;
  breach: BreachState;
  queuedAgentIds: string[];
  pending: PendingState;
  error: string;
  loading: boolean;
  toggleMode: () => Promise<void>;
  spawnAgent: (agentId: string, profile: AgentProfile) => Promise<void>;
  killAgent: (agentId: string) => Promise<void>;
  verifyChain: () => Promise<void>;
  tamperWrapper: () => Promise<void>;
  reset: () => Promise<void>;
  retryConnection: () => void;
  clearError: () => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

const MAX_EVENTS = 1000;
const RECONNECT_THRESHOLD = 3;
const RECONNECT_SECONDS = 5;

function mergeEvent(events: SandboxEvent[], incoming: SandboxEvent): SandboxEvent[] {
  if (events.some((event) => event.id === incoming.id)) return events;
  return [incoming, ...events].slice(0, MAX_EVENTS);
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [mockMode, setMockMode] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>("mock");
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [events, setEvents] = useState<SandboxEvent[]>([]);
  const [killCount, setKillCount] = useState(0);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [queuedAgentIds, setQueuedAgentIds] = useState<string[]>([]);
  const [breach, setBreach] = useState<BreachState>({ active: false, reason: "" });
  const [pending, setPending] = useState<PendingState>({
    spawn: false,
    kill: null,
    tamper: false,
    reset: false,
    verify: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const failures = useRef(0);
  const modeRef = useRef(mockMode);
  const countdownTimer = useRef<number | undefined>(undefined);
  const seenKillIds = useRef(new Set<number>());

  const clearKillCount = useCallback(() => {
    seenKillIds.current.clear();
    setKillCount(0);
  }, []);

  useEffect(() => {
    modeRef.current = mockMode;
  }, [mockMode]);

  const clearError = useCallback(() => setError(""), []);

  // One subscription to the single data source (one SSE / one simulator).
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      setEvents((current) => mergeEvent(current, event));
      if (event.type === "kill" && !seenKillIds.current.has(event.id)) {
        seenKillIds.current.add(event.id);
        setKillCount(seenKillIds.current.size);
      }
      if (event.type === "self_destruct") {
        setBreach({
          active: true,
          reason: String(
            event.detail.reason ?? "Wrapper breach detected. Hardcoded self-destruct executed.",
          ),
        });
      }
    });
    return unsubscribe;
  }, []);

  const refreshRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    setConnection("reconnecting");
    let value = RECONNECT_SECONDS;
    setReconnectCountdown(value);
    if (countdownTimer.current) window.clearInterval(countdownTimer.current);
    countdownTimer.current = window.setInterval(() => {
      value -= 1;
      if (value <= 0) {
        window.clearInterval(countdownTimer.current);
        countdownTimer.current = undefined;
        setReconnectCountdown(0);
        refreshRef.current();
      } else {
        setReconnectCountdown(value);
      }
    }, 1000);
  }, []);

  const refresh = useCallback(async () => {
    const live = !modeRef.current;
    try {
      const [healthData, agentData, chainData] = await Promise.all([
        api.fetchHealth(),
        api.fetchAgents(),
        api.verifyHashChain(),
      ]);
      setHealth(healthData);
      setAgents(agentData);
      setChain(chainData);
      if (!healthData.wrapper_intact || !healthData.chain_valid) {
        setBreach({
          active: true,
          reason: !healthData.wrapper_intact
            ? "Wrapper integrity check failed."
            : "Hash-chain integrity verification failed.",
        });
      }
      if (live) {
        failures.current = 0;
        setConnection("live");
      }
    } catch (reason) {
      if (!live) return;
      failures.current += 1;
      if (failures.current >= RECONNECT_THRESHOLD) {
        setConnection("offline");
        setError(reason instanceof Error ? reason.message : "Backend unreachable.");
      } else {
        scheduleReconnect();
      }
    }
    setLoading(false);
  }, [scheduleReconnect]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Hydrate the persisted mode once on the client.
  useEffect(() => {
    const stored = api.getUseMockMode();
    setMockMode(stored);
    if (stored) {
      setConnection("mock");
    } else {
      setConnection("connecting");
    }
    void refresh();
  }, [refresh]);

  // Poll for health/agents while live.
  useEffect(() => {
    if (mockMode || connection !== "live") return;
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [mockMode, connection, refresh]);

  useEffect(() => {
    return () => {
      if (countdownTimer.current) window.clearInterval(countdownTimer.current);
    };
  }, []);

  const toggleMode = useCallback(async () => {
    const next = !mockMode;
    clearError();
    api.setUseMockMode(next);
    setMockMode(next);
    setEvents([]);
    clearKillCount();
    setAgents([]);
    setHealth(null);
    setChain(null);
    setQueuedAgentIds([]);
    failures.current = 0;
    if (countdownTimer.current) {
      window.clearInterval(countdownTimer.current);
      countdownTimer.current = undefined;
    }
    setReconnectCountdown(0);
    if (next) {
      setConnection("mock");
      void refresh();
    } else {
      setConnection("connecting");
      void refresh();
    }
  }, [mockMode, clearError, clearKillCount, refresh]);

  const spawnAgent = useCallback(
    async (agentId: string, profile: AgentProfile) => {
      setPending((current) => ({ ...current, spawn: true }));
      clearError();
      // Optimistic queued agent so the card appears instantly, then reconciles.
      setQueuedAgentIds((current) =>
        current.includes(agentId) ? current : [...current, agentId],
      );
      setAgents((current) => {
        if (current.some((agent) => agent.agent_id === agentId)) return current;
        return [
          {
            agent_id: agentId,
            status: "running",
            last_heartbeat: 0,
            violations: 0,
            container_id: null,
          },
          ...current,
        ];
      });
      try {
        await api.spawnAgent(agentId, profile);
        setQueuedAgentIds((current) => current.filter((id) => id !== agentId));
        void refresh();
      } catch (reason) {
        setQueuedAgentIds((current) => current.filter((id) => id !== agentId));
        setError(reason instanceof Error ? reason.message : "Unable to spawn agent.");
      } finally {
        setPending((current) => ({ ...current, spawn: false }));
      }
    },
    [clearError, refresh],
  );

  const killAgent = useCallback(
    async (agentId: string) => {
      setPending((current) => ({ ...current, kill: agentId }));
      clearError();
      try {
        await api.killAgent(agentId);
        void refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to terminate agent.");
      } finally {
        setPending((current) => ({ ...current, kill: null }));
      }
    },
    [clearError, refresh],
  );

  const verifyChain = useCallback(async () => {
    setPending((current) => ({ ...current, verify: true }));
    clearError();
    try {
      const result = await api.verifyHashChain();
      setChain(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify hash chain.");
    } finally {
      setPending((current) => ({ ...current, verify: false }));
    }
  }, [clearError]);

  const tamperWrapper = useCallback(async () => {
    setPending((current) => ({ ...current, tamper: true }));
    clearError();
    try {
      await api.triggerWrapperTamper();
      setBreach({
        active: true,
        reason: "Wrapper tamper demo triggered. Hardcoded self-destruct executed.",
      });
      void refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to trigger wrapper breach.");
    } finally {
      setPending((current) => ({ ...current, tamper: false }));
    }
  }, [clearError, refresh]);

  const reset = useCallback(async () => {
    setPending((current) => ({ ...current, reset: true }));
    clearError();
    try {
      await api.resetSandboxEnv();
      setEvents([]);
      clearKillCount();
      setAgents([]);
      setQueuedAgentIds([]);
      setBreach({ active: false, reason: "" });
      void refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset sandbox.");
    } finally {
      setPending((current) => ({ ...current, reset: false }));
    }
  }, [clearError, clearKillCount, refresh]);

  const retryConnection = useCallback(() => {
    failures.current = 0;
    setConnection("connecting");
    void refresh();
  }, [refresh]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      mockMode,
      connection,
      reconnectCountdown,
      health,
      agents,
      events,
      killCount,
      chain,
      breach,
      queuedAgentIds,
      pending,
      error,
      loading,
      toggleMode,
      spawnAgent,
      killAgent,
      verifyChain,
      tamperWrapper,
      reset,
      retryConnection,
      clearError,
    }),
    [
      mockMode,
      connection,
      reconnectCountdown,
      health,
      agents,
      events,
      killCount,
      chain,
      breach,
      queuedAgentIds,
      pending,
      error,
      loading,
      toggleMode,
      spawnAgent,
      killAgent,
      verifyChain,
      tamperWrapper,
      reset,
      retryConnection,
      clearError,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used within a DashboardProvider");
  return context;
}
