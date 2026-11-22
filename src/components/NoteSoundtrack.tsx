import { useEffect, useRef, useState } from "react";

import soundtrackUrl from "../../neu_of_jothable.mp3";

const speeds = [0.5, 0.8, 1, 1.2, 1.5];

export function Soundtrack() {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    const track = audio.current;
    if (!track) return;
    track.volume = 0.35;
    return () => track.pause();
  }, []);

  return (
    <div className="note-soundtrack" aria-label="Neu of Jothable soundtrack" role="group">
      <audio
        ref={audio}
        src={soundtrackUrl}
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError(true); }}
      />
      <button type="button" className="btn btn-outline btn-sm" onClick={() => {
        const track = audio.current;
        if (!track) return;
        if (track.paused) {
          if (track.error) track.load();
          setError(false);
          void track.play().catch(() => setError(true));
        } else {
          track.pause();
        }
      }}>
        {playing ? "Pause music" : "Play music"}
      </button>
      <label>
        Volume
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => {
          const value = Number(event.target.value);
          if (audio.current) audio.current.volume = value;
          setVolume(value);
        }} />
      </label>
      <label>
        Speed
        <select value={speed} onChange={(event) => {
          const value = Number(event.target.value);
          if (audio.current) audio.current.playbackRate = value;
          setSpeed(value);
        }}>
          {speeds.map((value) => <option key={value} value={value}>{value.toFixed(1)}×</option>)}
        </select>
      </label>
      {error && <span role="status">Couldn’t play the soundtrack.</span>}
    </div>
  );
}
