import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  currentPage: number;
  totalPages: number;
  status: string;
}

export function ProgressBar({ currentPage, totalPages, status }: Props) {
  const pct = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
  const label = status === 'connecting' ? 'Connecting...'
    : totalPages === 0 ? 'Starting analysis...'
    : `Page ${currentPage} of ${totalPages}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.liveRow}>
          <View style={styles.pulseDot} />
          <Text style={styles.liveText}>Live Analysis</Text>
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.track}>
        <LinearGradient
          colors={['#7c3aed', '#4f46e5']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${Math.max(pct, 3)}%` as any }]}
        />
      </View>
      {totalPages > 0 && (
        <Text style={styles.pct}>{pct.toFixed(0)}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#161b22', borderRadius: 12, margin: 16, borderWidth: 1, borderColor: '#30363d' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7c3aed' },
  liveText: { color: '#7c3aed', fontWeight: '600', fontSize: 13 },
  label: { color: '#8b949e', fontSize: 12 },
  track: { height: 6, backgroundColor: '#21262d', borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  pct: { color: '#e2e8f0', fontSize: 12, textAlign: 'right', marginTop: 6 },
});
