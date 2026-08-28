import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  onAnalyze: (slug: string) => void;
}

export function HomeScreen({ onAnalyze }: Props) {
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    const trimmed = slug.trim();
    if (!trimmed) { setError('Enter your start.gg slug'); return; }
    setError('');
    onAnalyze(trimmed);
  };

  return (
    <LinearGradient colors={['#0d1117', '#161b22', '#0d1117']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <View style={styles.brand}>
          <Text style={styles.logo}>CoachGG</Text>
          <Text style={styles.tagline}>Super Smash Bros Ultimate · Player Analysis</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Start.gg Slug</Text>
          <TextInput
            style={styles.input}
            value={slug}
            onChangeText={setSlug}
            placeholder="e.g. bc954a2e"
            placeholderTextColor="#6e7681"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="start.gg player slug"
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.btn} onPress={handleSubmit} activeOpacity={0.85}>
            <LinearGradient colors={['#7c3aed', '#4f46e5']} style={styles.btnGrad} start={{x:0,y:0}} end={{x:1,y:0}}>
              <Text style={styles.btnText}>Analyze →</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.hint}>Find your slug at start.gg/user/your-slug</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 48, fontWeight: '800', color: '#e2e8f0', letterSpacing: -2 },
  tagline: { color: '#7c3aed', fontSize: 13, marginTop: 8, textAlign: 'center' },
  card: {
    backgroundColor: '#161b22', borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: '#30363d',
    shadowColor: '#7c3aed', shadowOpacity: 0.2, shadowRadius: 20
  },
  label: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 1 },
  input: {
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d',
    borderRadius: 10, padding: 14, color: '#e2e8f0', fontSize: 16, marginBottom: 8
  },
  error: { color: '#f87171', fontSize: 12, marginBottom: 8 },
  btn: { borderRadius: 10, overflow: 'hidden', marginTop: 8 },
  btnGrad: { padding: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  hint: { color: '#6e7681', fontSize: 12, textAlign: 'center', marginTop: 16 },
});
