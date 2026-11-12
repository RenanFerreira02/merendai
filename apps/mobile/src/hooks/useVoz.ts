/**
 * useVoz - entrada e saida de voz.
 *
 * Saida: expo-speech (TTS do sistema). Sem custo, sem rede.
 * Entrada: expo-speech-recognition (STT do sistema; no Android recente funciona
 *          offline com o pacote de idioma pt-BR instalado).
 *
 * Memoria/eficiencia:
 *  - Um unico listener por montagem; removido no cleanup.
 *  - `Speech.stop()` no unmount para nao deixar audio tocando em tela fechada.
 *  - Resultados parciais atualizam so um estado de string (sem acumular arrays).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export function useVoz() {
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [transcricao, setTranscricao] = useState('');
  const resolver = useRef<((texto: string) => void) | null>(null);

  useSpeechRecognitionEvent('start', () => setOuvindo(true));
  useSpeechRecognitionEvent('end', () => setOuvindo(false));
  useSpeechRecognitionEvent('result', (ev) => {
    const texto = ev.results?.[0]?.transcript ?? '';
    setTranscricao(texto);
    if (ev.isFinal && resolver.current) {
      resolver.current(texto);
      resolver.current = null;
    }
  });
  useSpeechRecognitionEvent('error', () => {
    setOuvindo(false);
    resolver.current?.('');
    resolver.current = null;
  });

  /** Fala um texto e resolve quando terminar. */
  const falar = useCallback((texto: string) => new Promise<void>((resolve) => {
    Speech.stop();
    setFalando(true);
    Speech.speak(texto, {
      language: 'pt-BR',
      rate: 0.95,          // um pouco mais lento: publico 50+
      pitch: 1.0,
      onDone: () => { setFalando(false); resolve(); },
      onStopped: () => { setFalando(false); resolve(); },
      onError: () => { setFalando(false); resolve(); },
    });
  }), []);

  /** Ouve uma frase e devolve o texto final (string vazia se falhar). */
  const ouvir = useCallback(async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return '';
    setTranscricao('');
    return new Promise<string>((resolve) => {
      resolver.current = resolve;
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });
    });
  }, []);

  const parar = useCallback(() => {
    Speech.stop();
    ExpoSpeechRecognitionModule.stop();
  }, []);

  useEffect(() => () => { Speech.stop(); ExpoSpeechRecognitionModule.abort(); }, []);

  return { falar, ouvir, parar, ouvindo, falando, transcricao };
}
