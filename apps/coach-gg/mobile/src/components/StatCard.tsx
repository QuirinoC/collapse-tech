import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface Props {
  name: string;
  winRate: number;
  total: number;
  winCount: number;
  imageUrl?: string;
  type: 'stage' | 'character';
}

function wrColor(wr: number) {
  if (wr >= 60) return '#3fb950';
  if (wr >= 50) return '#d29922';
  return '#f85149';
}

export function StatCard({ name, winRate, total, winCount, imageUrl, type }: Props) {
  const color = wrColor(winRate);
  const losses = total - winCount;
  const isLow = total < 5;

  return (
    <View style={styles.card}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={type === 'character' ? styles.charImg : styles.stageImg} />
      ) : (
        <View style={[type === 'character' ? styles.charImg : styles.stageImg, styles.placeholder]} />
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.record}>{winCount}W – {losses}L</Text>
        {isLow && <Text style={styles.lowData}>Low data</Text>}
      </View>
      <View style={styles.right}>
        <Text style={[styles.winRate, { color }]}>{winRate.toFixed(1)}%</Text>
        <Text style={styles.games}>{total}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#161b22', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#21262d'
  },
  charImg: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  stageImg: { width: 60, height: 36, borderRadius: 8, marginRight: 12 },
  placeholder: { backgroundColor: '#21262d' },
  info: { flex: 1 },
  name: { color: '#e2e8f0', fontWeight: '600', fontSize: 14 },
  record: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  lowData: { color: '#d29922', fontSize: 11, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  winRate: { fontSize: 18, fontWeight: '800' },
  games: { color: '#6e7681', fontSize: 11, marginTop: 2 },
});
