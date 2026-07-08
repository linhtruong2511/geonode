import React, { useEffect, useState } from "react";
import { useWindStore } from "../../stores/useWindStore";

export const TimeSliderControl: React.FC = () => {
  const {
    currentTime,
    setCurrentTime,
    isPlayingAnimation,
    setIsPlayingAnimation,
  } = useWindStore();

  // Example dummy times for slider
  const times = [
    "2023-09-01T00:00:00Z",
    "2023-09-01T06:00:00Z",
    "2023-09-01T12:00:00Z",
    "2023-09-01T18:00:00Z",
    "2023-09-02T00:00:00Z",
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentTime) {
      const idx = times.indexOf(currentTime);
      if (idx !== -1) setCurrentIndex(idx);
    } else {
      setCurrentTime(times[0]);
    }
  }, [currentTime, setCurrentTime]);

  useEffect(() => {
    let interval: any;
    if (isPlayingAnimation) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % times.length;
          setCurrentTime(times[next]);
          return next;
        });
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlayingAnimation, setCurrentTime, times.length]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "30px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        padding: "10px 20px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "center",
        gap: "15px",
        width: "400px",
      }}
    >
      <button
        onClick={() => setIsPlayingAnimation(!isPlayingAnimation)}
        style={{
          border: "none",
          background: "var(--color-primary, #397aab)",
          color: "white",
          borderRadius: "50%",
          width: "32px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <i className={`fa ${isPlayingAnimation ? "fa-pause" : "fa-play"}`}></i>
      </button>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <input
          type="range"
          min={0}
          max={times.length - 1}
          value={currentIndex}
          onChange={(e) => {
            const idx = parseInt(e.target.value, 10);
            setCurrentIndex(idx);
            setCurrentTime(times[idx]);
          }}
          style={{ width: "100%" }}
        />
        <div
          style={{
            fontSize: "11px",
            textAlign: "center",
            marginTop: "4px",
            color: "#555",
          }}
        >
          {new Date(times[currentIndex]).toLocaleString()}
        </div>
      </div>
    </div>
  );
};
