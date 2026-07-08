import React, { useEffect, useRef, useState } from "react";
import { useWindStore } from "../../stores/useWindStore";
import { WMSCapabilitiesService } from "../../services/WMSCapabilitiesService";

export const TimeSliderControl: React.FC = () => {
  const {
    currentTime,
    setCurrentTime,
    availableTimes,
    setAvailableTimes,
    isPlayingAnimation,
    setIsPlayingAnimation,
    activeGridLayers,
  } = useWindStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Fetch layer times when active layer changes
  useEffect(() => {
    const fetchTimes = async () => {
      if (activeGridLayers.length > 0) {
        // Just use the first active layer for the timeline
        const layerName = `geonode:${activeGridLayers[0]}`;
        const times = await WMSCapabilitiesService.fetchLayerTimes(layerName);
        if (times.length > 0) {
          setAvailableTimes(times);
          // Set to first time if current time is not valid
          if (!currentTime || !times.includes(currentTime)) {
            setCurrentTime(times[0]);
            setCurrentIndex(0);
          }
        }
      }
    };
    fetchTimes();
  }, [activeGridLayers]);

  // Sync index with currentTime
  useEffect(() => {
    if (currentTime && availableTimes.length > 0) {
      const idx = availableTimes.indexOf(currentTime);
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx);
        scrollToIndex(idx);
      }
    }
  }, [currentTime, availableTimes]);

  // Animation Loop
  useEffect(() => {
    let interval: any;
    if (isPlayingAnimation && availableTimes.length > 0) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % availableTimes.length;
          setCurrentTime(availableTimes[next]);
          return next;
        });
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlayingAnimation, availableTimes, setCurrentTime]);

  // Scroll to a specific index
  const scrollToIndex = (index: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const itemWidth = 60; // Approximate width of each tick item
    const scrollPos = index * itemWidth - container.clientWidth / 2 + itemWidth / 2;
    
    isScrollingRef.current = true;
    container.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
    setTimeout(() => { isScrollingRef.current = false; }, 300);
  };

  // Handle manual scroll to update index
  const handleScroll = () => {
    if (!containerRef.current || isScrollingRef.current || isPlayingAnimation) return;
    const container = containerRef.current;
    const itemWidth = 60;
    const centerPos = container.scrollLeft + container.clientWidth / 2;
    const index = Math.max(0, Math.min(availableTimes.length - 1, Math.floor(centerPos / itemWidth)));
    
    if (index !== currentIndex) {
      setCurrentIndex(index);
      setCurrentTime(availableTimes[index]);
    }
  };

  if (availableTimes.length === 0) return null;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        width: "100%",
        padding: "0 20px"
      }}
    >
      <button
        onClick={() => setIsPlayingAnimation(!isPlayingAnimation)}
        style={{
          border: "none",
          background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
          color: "white",
          borderRadius: "50%",
          width: "35px",
          height: "35px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
          transition: "transform 0.2s ease"
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <i className={`fa ${isPlayingAnimation ? "fa-pause" : "fa-play"}`}></i>
      </button>

      <div 
        style={{ 
          flex: 1, 
          position: "relative",
          maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
          WebkitMaskImage: "-webkit-linear-gradient(left, transparent, black 15%, black 85%, transparent)",
          background: "rgba(0, 0, 0, 0.15)", // Very light subtle background to group the slider
          borderRadius: "30px",
          backdropFilter: "blur(2px)"
        }}
      >
        {/* Pointer at the center */}
        <div style={{
          position: "absolute",
          top: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "2px",
          height: "40px",
          backgroundColor: "#3b82f6",
          boxShadow: "0 0 10px rgba(59, 130, 246, 0.5)",
          zIndex: 2,
          pointerEvents: "none"
        }} />

        {/* Scrollable Timeline */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          style={{
            display: "flex",
            alignItems: "flex-end", // Align to bottom so ticks grow up
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            padding: "0 50%", // Use 50% to allow center snapping regardless of container width
            height: "60px",
            scrollbarWidth: "none", // Hide scrollbar for Firefox
            msOverflowStyle: "none" // Hide scrollbar for IE
          }}
          className="no-scrollbar"
        >
          {availableTimes.map((time, idx) => {
            const distance = Math.abs(currentIndex - idx);
            // Fisheye scale calculation
            let scale = 1;
            let opacity = 0.5;
            let height = 12;
            let showLabel = false;
            
            if (distance === 0) {
              scale = 1.2;
              opacity = 1;
              height = 25;
              showLabel = true;
            } else if (distance === 1) {
              scale = 1.1;
              opacity = 0.9;
              height = 18;
            } else if (distance === 2) {
              scale = 1;
              opacity = 0.7;
              height = 15;
            } else if (distance < 5) {
              opacity = 0.6;
            }

            const dateObj = new Date(time);
            
            return (
              <div 
                key={time}
                onClick={() => {
                  setCurrentIndex(idx);
                  setCurrentTime(time);
                  scrollToIndex(idx);
                }}
                style={{
                  minWidth: "60px",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingBottom: "22px", // Space for label
                  scrollSnapAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  transform: `scale(${scale})`,
                  opacity: opacity,
                  position: "relative"
                }}
              >
                {/* Tick Mark */}
                <div style={{
                  width: distance === 0 ? "3px" : "2px",
                  height: `${height}px`,
                  backgroundColor: distance === 0 ? "#3b82f6" : "#64748b",
                  borderRadius: "2px",
                  boxShadow: distance === 0 ? "0 0 8px rgba(59, 130, 246, 0.3)" : "none"
                }} />
                
                {/* Time Label */}
                {(showLabel || idx % 10 === 0) && (
                  <div style={{
                    position: "absolute",
                    bottom: "2px",
                    fontSize: distance === 0 ? "11px" : "10px",
                    fontWeight: "bold",
                    color: distance === 0 ? "#1e293b" : "#475569",
                    whiteSpace: "nowrap",
                  }}>
                    {distance === 0 ? dateObj.toLocaleString() : `${dateObj.getDate()}/${dateObj.getMonth()+1}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}} />
    </div>
  );
};
