import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressBar } from '../components/ProgressBar';
import { StatCard } from '../components/StatCard';
import { CHARACTER_IMAGES } from '../data/characters';
import { STAGE_IMAGES } from '../data/stages';
import type { ProgressState } from '../hooks/useSignalR';

interface Props {
  slug: string;
  progress: ProgressState;
  onBack: () => void;
}

type Tab = 'stages' | 'characters' | 'matchups';

function sortedByWinrate(obj: Record<string, { winRate: number; total: number; winCount: number }>) {
  return Object.entries(obj).sort(([, a], [, b]) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.total - a.total;
  });
}

export function AnalysisScreen({ slug, progress, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('stages');
  const stats = progress.stats;

  return (
    <LinearGradient colors={['#0d1117', '#161b22', '#0d1117']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.slugText}>{slug}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Progress */}
        {(progress.status === 'connecting' || progress.status === 'running') && (
          <ProgressBar
            currentPage={progress.currentPage}
            totalPages={progress.totalPages}
            status={progress.status}
          />
        )}

        {/* Error */}
        {progress.status === 'error' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠ {progress.error}</Text>
          </View>
        )}

        {/* Tabs */}
        {stats && (
          <>
            <View style={styles.tabs}>
              {(['stages', 'characters', 'matchups'] as Tab[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tab, tab === t && styles.tabActive]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === 'stages' ? '🏟 Stages' : t === 'characters' ? '🎮 Chars' : '📊 Matchups'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {tab === 'stages' && (
                <View style={styles.list}>
                  {sortedByWinrate(stats.winrateByStage).map(([name, data]) => (
                    <StatCard
                      key={name}
                      name={name}
                      winRate={data.winRate}
                      total={data.total}
                      winCount={data.winCount}
                      imageUrl={STAGE_IMAGES[name]}
                      type="stage"
                    />
                  ))}
                </View>
              )}

              {tab === 'characters' && (
                <View style={styles.list}>
                  {sortedByWinrate(stats.winrateByCharacter).map(([name, data]) => (
                    <StatCard
                      key={name}
                      name={name}
                      winRate={data.winRate}
                      total={data.total}
                      winCount={data.winCount}
                      imageUrl={CHARACTER_IMAGES[name]}
                      type="character"
                    />
                  ))}
                </View>
              )}

              {tab === 'matchups' && (
                <View style={styles.list}>
                  {Object.entries(stats.winrateStageByCharacter)
                    .sort(([a], [b]) => {
                      const wrA = stats.winrateByCharacter[a]?.winRate ?? 0;
                      const wrB = stats.winrateByCharacter[b]?.winRate ?? 0;
                      return wrB - wrA;
                    })
                    .map(([charName, stageData]) => {
                      const overall = stats.winrateByCharacter[charName];
                      return (
                        <View key={charName} style={styles.matchupSection}>
                          <View style={styles.matchupHeader}>
                            <Text style={styles.matchupChar}>{charName}</Text>
                            <Text style={[styles.matchupWr, { color: overall?.winRate >= 50 ? '#3fb950' : '#f85149' }]}>
                              {overall?.winRate?.toFixed(1)}%
                            </Text>
                          </View>
                          {sortedByWinrate(stageData).map(([stage, sd]) => (
                            <View key={stage} style={styles.matchupRow}>
                              <Text style={styles.matchupStage}>{stage}</Text>
                              <Text style={styles.matchupRecord}>{sd.winCount}W–{sd.total - sd.winCount}L</Text>
                              <Text style={[styles.matchupStageWr, { color: sd.winRate >= 50 ? '#3fb950' : '#f85149' }]}>
                                {sd.winRate.toFixed(1)}%
                              </Text>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </>
        )}

        {/* Loading state with no data yet */}
        {!stats && progress.status !== 'error' && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {progress.status === 'idle' ? 'Ready' : 'Fetching data...'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {progress.status === 'running'
                ? `Analyzing page ${progress.currentPage} of ${progress.totalPages || '?'}`
                : 'Results will appear as pages load'}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12
  },
  backBtn: { padding: 8 },
  backText: { color: '#7c3aed', fontWeight: '600', fontSize: 15 },
  slugText: { color: '#8b949e', fontSize: 14, fontWeight: '500' },
  errorBox: { margin: 16, padding: 16, backgroundColor: '#1f1015', borderRadius: 12, borderWidth: 1, borderColor: '#f85149' },
  errorText: { color: '#f85149', fontSize: 14 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#161b22', borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 8, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: '#21262d' },
  tabText: { color: '#6e7681', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#e2e8f0', fontWeight: '700' },
  content: { flex: 1 },
  list: { paddingHorizontal: 16 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: '#8b949e', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: '#6e7681', fontSize: 14, textAlign: 'center' },
  matchupSection: {
    backgroundColor: '#161b22', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#21262d'
  },
  matchupHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  matchupChar: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
  matchupWr: { fontWeight: '800', fontSize: 16 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  matchupStage: { flex: 1, color: '#8b949e', fontSize: 13 },
  matchupRecord: { color: '#6e7681', fontSize: 12, marginRight: 8 },
  matchupStageWr: { fontWeight: '700', fontSize: 14, width: 48, textAlign: 'right' },
});
