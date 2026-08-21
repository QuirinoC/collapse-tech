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

    connection.onclose(() => setConnected(false));
    connection.onreconnecting(() => setConnected(false));
    connection.onreconnected(() => setConnected(true));

    connection.on('JobQueued', () => {
      setProgress(p => ({ ...p, status: 'running', currentPage: 0, totalPages: 0, error: null }));
    });

    connection.on('Progress', (data: { slug: string; currentPage: number; totalPages: number; partialStats: Stats }) => {
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
      setProgress(p => ({ ...p, status: 'complete', stats: data.stats }));
    });

    connection.on('JobError', (data: { slug: string; error: string }) => {
      setProgress(p => ({ ...p, status: 'error', error: data.error }));
    });

    connection.start()
      .then(() => setConnected(true))
      .catch(e => console.error('SignalR connection failed:', e));

    connectionRef.current = connection;
    return () => { connection.stop(); };
  }, [serverUrl]);

  const analyze = useCallback(async (slug: string) => {
    if (!connectionRef.current) return;
    setProgress({ status: 'connecting', currentPage: 0, totalPages: 0, stats: null, error: null });
    try {
      if (connectionRef.current.state === signalR.HubConnectionState.Disconnected) {
        await connectionRef.current.start();
        setConnected(true);
      }
      await connectionRef.current.invoke('Subscribe', slug);
    } catch (e) {
      setProgress(p => ({ ...p, status: 'error', error: String(e) }));
    }
  }, []);

  return { connected, progress, analyze };
}
