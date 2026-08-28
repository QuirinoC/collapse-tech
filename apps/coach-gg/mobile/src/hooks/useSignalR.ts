import { useEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';

export interface StatEntry {
  total: number;
  winCount: number;
  winRate: number;
}

export interface Stats {
  winrateByStage: Record<string, StatEntry>;
  winrateByCharacter: Record<string, StatEntry>;
  winrateStageByCharacter: Record<string, Record<string, StatEntry>>;
}

export type JobStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error';

export interface ProgressState {
  status: JobStatus;
  currentPage: number;
  totalPages: number;
  stats: Stats | null;
  error: string | null;
}

export function useSignalR(serverUrl: string) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const connectionStartRef = useRef<Promise<void> | null>(null);
  const currentSlugRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    status: 'idle',
    currentPage: 0,
    totalPages: 0,
    stats: null,
    error: null,
  });

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${serverUrl}/analysishub`)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    const isCurrentSlug = (slug: string) => slug === currentSlugRef.current;
    const resubscribe = async () => {
      const slug = currentSlugRef.current;
      if (slug) await connection.invoke('Subscribe', slug);
    };

    connection.onclose(() => setConnected(false));
    connection.onreconnecting(() => setConnected(false));
    connection.onreconnected(() => {
      setConnected(true);
      void resubscribe().catch(error => {
        setProgress(p => ({ ...p, status: 'error', error: `Could not resume analysis: ${String(error)}` }));
      });
    });

    connection.on('JobQueued', (data: { slug: string }) => {
      if (!isCurrentSlug(data.slug)) return;
      setProgress(p => ({ ...p, status: 'running', currentPage: 0, totalPages: 0, error: null }));
    });

    connection.on('Progress', (data: { slug: string; currentPage: number; totalPages: number; partialStats: Stats }) => {
      if (!isCurrentSlug(data.slug)) return;
      setProgress(p => ({
        ...p,
        status: 'running',
        currentPage: data.currentPage,
        totalPages: data.totalPages,
        stats: data.partialStats && Object.keys(data.partialStats?.winrateByStage ?? {}).length > 0
          ? data.partialStats : p.stats,
      }));
    });

    connection.on('JobComplete', (data: { slug: string; stats: Stats }) => {
      if (!isCurrentSlug(data.slug)) return;
      setProgress(p => ({ ...p, status: 'complete', stats: data.stats }));
    });

    connection.on('JobError', (data: { slug: string; error: string }) => {
      if (!isCurrentSlug(data.slug)) return;
      setProgress(p => ({ ...p, status: 'error', error: data.error }));
    });

    connectionRef.current = connection;
    const start = connection.start()
      .then(() => setConnected(true))
      .catch(e => console.error('SignalR connection failed:', e));
    connectionStartRef.current = start;
    void start.finally(() => {
      if (connectionStartRef.current === start) connectionStartRef.current = null;
    });

    return () => {
      currentSlugRef.current = null;
      connectionRef.current = null;
      void connection.stop();
    };
  }, [serverUrl]);

  const analyze = useCallback(async (slug: string) => {
    const normalizedSlug = slug.trim().replace(/^user\//i, '').toLowerCase();
    currentSlugRef.current = normalizedSlug;
    setProgress({ status: 'connecting', currentPage: 0, totalPages: 0, stats: null, error: null });

    const connection = connectionRef.current;
    if (!connection) {
      setProgress(p => ({ ...p, status: 'error', error: 'Analysis connection is still initializing. Please retry.' }));
      return;
    }

    try {
      if (connection.state === signalR.HubConnectionState.Connecting) {
        await connectionStartRef.current;
      } else if (connection.state === signalR.HubConnectionState.Disconnected) {
        await connection.start();
        setConnected(true);
      }
      if (connection.state !== signalR.HubConnectionState.Connected) {
        throw new Error('Analysis connection is not ready.');
      }
      await connection.invoke('Subscribe', normalizedSlug);
    } catch (e) {
      setProgress(p => ({ ...p, status: 'error', error: String(e) }));
    }
  }, []);

  const reset = useCallback(() => {
    currentSlugRef.current = null;
    setProgress({ status: 'idle', currentPage: 0, totalPages: 0, stats: null, error: null });
  }, []);

  return { connected, progress, analyze, reset };
}
