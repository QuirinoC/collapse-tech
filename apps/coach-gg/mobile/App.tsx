import React, { useState } from 'react';
import { HomeScreen } from './src/screens/HomeScreen';
import { AnalysisScreen } from './src/screens/AnalysisScreen';
import { useSignalR } from './src/hooks/useSignalR';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const SERVER_URL = 'https://coach.collapsetechnologies.com';

export default function App() {
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const { progress, analyze, reset } = useSignalR(SERVER_URL);

  const handleAnalyze = (slug: string) => {
    setCurrentSlug(slug);
    analyze(slug);
  };

  const handleBack = () => {
    reset();
    setCurrentSlug(null);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {currentSlug ? (
        <AnalysisScreen
          slug={currentSlug}
          progress={progress}
          onBack={handleBack}
        />
      ) : (
        <HomeScreen onAnalyze={handleAnalyze} />
      )}
    </GestureHandlerRootView>
  );
}
