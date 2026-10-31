import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechState = 'idle' | 'listening' | 'transcribing' | 'error'
type SpeechEvent = { results: ArrayLike<{ 0: { transcript: string } }> }
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort?: () => void; onresult: ((event: SpeechEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
type SpeechConstructor = new () => SpeechRecognitionLike
function recognitionConstructor(): SpeechConstructor | undefined {
  const speechWindow = window as typeof window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}
export function useSpeechInput() {
  const [state, setState] = useState<SpeechState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const generation = useRef(0)
  const supported = typeof window !== 'undefined' && Boolean(recognitionConstructor())

  // Invalidate before invoking browser methods: stop/abort can still dispatch queued callbacks.
  const release = useCallback((mode: 'stop' | 'abort' | 'detach') => {
    generation.current += 1
    const instance = recognition.current
    recognition.current = null
    if (!instance) return
    instance.onresult = null; instance.onend = null; instance.onerror = null
    try {
      if (mode === 'abort' && instance.abort) instance.abort()
      else if (mode !== 'detach') instance.stop()
    } catch { /* An already-ended recognition still remains invalidated and detached. */ }
  }, [])
  const stop = useCallback(() => { release('stop'); setState('idle') }, [release])
  const reset = useCallback(() => { release('abort'); setTranscript(''); setState('idle') }, [release])
  const start = useCallback(() => {
    const Constructor = recognitionConstructor(); if (!Constructor) return
    release('abort')
    const instance = new Constructor()
    const session = generation.current
    const isCurrent = () => generation.current === session && recognition.current === instance
    instance.lang = 'zh-CN'; instance.interimResults = true; instance.continuous = false
    instance.onresult = (event) => {
      if (!isCurrent()) return
      setState('transcribing'); setTranscript(Array.from(event.results).map((result) => result[0].transcript).join(''))
    }
    instance.onend = () => { if (isCurrent()) { release('detach'); setState('idle') } }
    instance.onerror = () => { if (isCurrent()) { release('abort'); setState('error') } }
    recognition.current = instance
    setTranscript(''); setState('listening')
    try { instance.start() }
    catch { release('abort'); setState('error') }
  }, [release])
  useEffect(() => () => release('abort'), [release])
  return { supported, state, transcript, start, stop, reset }
}
