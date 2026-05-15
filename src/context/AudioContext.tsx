/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from 'react'

type AudioContextType = {
  audioRef: RefObject<HTMLAudioElement | null>
  currentTime: number
  duration: number
  isPlaying: boolean
  sourceUrl: string | null
  setSourceUrl: (url: string | null) => void
  seek: (value: number) => void
  play: () => Promise<void>
  pause: () => void
}

const AudioContext = createContext<AudioContextType | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [sourceUrl, setSourceUrlState] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const setSourceUrl = useCallback((url: string | null) => {
    setSourceUrlState(url)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)

    const audio = audioRef.current
    if (audio) {
      audio.src = url ?? ''
      audio.load()
    }
  }, [])

  const seek = useCallback((value: number) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.currentTime = value
    setCurrentTime(value)
  }, [])

  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !audio.src) {
      return
    }

    await audio.play()
  }, [])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.pause()
  }, [])

  const value = useMemo(
    () => ({
      audioRef,
      currentTime,
      duration,
      isPlaying,
      sourceUrl,
      setSourceUrl,
      seek,
      play,
      pause,
    }),
    [currentTime, duration, isPlaying, sourceUrl, pause, play, seek, setSourceUrl],
  )

  return (
    <AudioContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        className="persistent-audio-player"
        src={sourceUrl ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
    </AudioContext.Provider>
  )
}

export function useAudioPlayer() {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioProvider')
  }

  return context
}
