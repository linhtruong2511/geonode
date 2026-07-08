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
  const [playSpeed, setPlaySpeed] = useState<number>(1); // Hỗ trợ tốc độ phát: 0.5x, 1x, 2x
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Kéo thả chuột để cuộn thanh timeline (Lướt trái phải cho Desktop)
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Sinh dữ liệu thời gian mock mặc định để widget luôn hiển thị và tương tác được
  useEffect(() => {
    if (availableTimes.length === 0) {
      const mockList = [];
      const now = new Date();
      // Sinh 24 giờ gần nhất làm dữ liệu mẫu
      for (let i = 0; i < 24; i++) {
        const d = new Date(now.getTime() - i * 3 * 3600 * 1000); // cách nhau 3 tiếng
        mockList.unshift(d.toISOString());
      }
      setAvailableTimes(mockList);
      setCurrentTime(mockList[mockList.length - 1]);
      setCurrentIndex(mockList.length - 1);
    }
  }, [availableTimes, setAvailableTimes, setCurrentTime]);

  // Fetch layer times khi layer WMS thực tế thay đổi
  useEffect(() => {
    const fetchTimes = async () => {
      if (activeGridLayers.length > 0) {
        const layerName = `geonode:${activeGridLayers[0]}`;
        const times = await WMSCapabilitiesService.fetchLayerTimes(layerName);
        if (times.length > 0) {
          setAvailableTimes(times);
          if (!currentTime || !times.includes(currentTime)) {
            setCurrentTime(times[0]);
            setCurrentIndex(0);
          }
        }
      }
    };
    fetchTimes();
  }, [activeGridLayers]);

  // Đồng bộ index khi currentTime thay đổi ngoại vi
  useEffect(() => {
    if (currentTime && availableTimes.length > 0) {
      const idx = availableTimes.indexOf(currentTime);
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx);
        scrollToIndex(idx);
      }
    }
  }, [currentTime, availableTimes]);

  // Vòng lặp phát hoạt ảnh
  useEffect(() => {
    let interval: any;
    if (isPlayingAnimation && availableTimes.length > 0) {
      const intervalMs = 2000 / playSpeed;
      interval = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % availableTimes.length;
          setCurrentTime(availableTimes[next]);
          return next;
        });
      }, intervalMs);
    }
    return () => clearInterval(interval);
  }, [isPlayingAnimation, availableTimes, setCurrentTime, playSpeed]);

  const scrollToIndex = (index: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const itemWidth = 60; 
    const scrollPos = index * itemWidth - container.clientWidth / 2 + itemWidth / 2;
    
    isScrollingRef.current = true;
    container.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
    setTimeout(() => { isScrollingRef.current = false; }, 300);
  };

  const handleScroll = () => {
    if (!containerRef.current || isScrollingRef.current || isPlayingAnimation || isMouseDown) return;
    const container = containerRef.current;
    const itemWidth = 60;
    const centerPos = container.scrollLeft + container.clientWidth / 2;
    const index = Math.max(0, Math.min(availableTimes.length - 1, Math.floor(centerPos / itemWidth)));
    
    if (index !== currentIndex) {
      setCurrentIndex(index);
      setCurrentTime(availableTimes[index]);
    }
  };

  // Kéo thả chuột cuộn thanh trượt
  const onMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsMouseDown(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    containerRef.current.scrollLeft = scrollLeft - walk;

    // Tìm index gần tâm nhất khi đang kéo
    const itemWidth = 60;
    const centerPos = containerRef.current.scrollLeft + containerRef.current.clientWidth / 2;
    const index = Math.max(0, Math.min(availableTimes.length - 1, Math.floor(centerPos / itemWidth)));
    if (index !== currentIndex) {
      setCurrentIndex(index);
      setCurrentTime(availableTimes[index]);
    }
  };

  const onMouseUpOrLeave = () => {
    setIsMouseDown(false);
    scrollToIndex(currentIndex); // Snap về điểm gần nhất
  };

  const handleDateChange = (dateString: string) => {
    if (!dateString || availableTimes.length === 0) return;
    const targetDate = new Date(dateString);
    let closestIndex = 0;
    let minDiff = Infinity;
    
    availableTimes.forEach((time, index) => {
      const diff = Math.abs(new Date(time).getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });

    setCurrentIndex(closestIndex);
    setCurrentTime(availableTimes[closestIndex]);
    scrollToIndex(closestIndex);
  };

  if (availableTimes.length === 0) return null;

  const getDatePickerValue = () => {
    if (!currentTime) return '';
    try {
      const d = new Date(currentTime);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "15px",
        width: "100%",
        padding: "0 20px",
        marginTop: "30px" // Khoảng trống cho nhãn ngày hiển thị phía trên
      }}
    >
      {/* Nhãn hiển thị thời gian hiện tại nổi bật phía trên thanh trượt */}
      {currentTime && (
        <div style={{
          position: 'absolute',
          top: '-28px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#1e293b',
          color: '#fff',
          padding: '4px 14px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 700,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          zIndex: 10,
          whiteSpace: 'nowrap',
          border: '1px solid #3b82f6'
        }}>
          <i className="fa fa-clock" style={{ marginRight: '6px', color: '#60a5fa' }}></i>
          {new Date(currentTime).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      )}

      {/* Nút Play/Pause */}
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
          transition: "transform 0.2s ease",
          zIndex: 5
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
        title={isPlayingAnimation ? "Tạm dừng" : "Phát hoạt ảnh thời tiết"}
      >
        <i className={`fa ${isPlayingAnimation ? "fa-pause" : "fa-play"}`}></i>
      </button>

      {/* Điều khiển tốc độ phát */}
      <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, zIndex: 5 }}>
        {([0.5, 1, 2] as const).map((speed) => (
          <button
            key={speed}
            onClick={() => setPlaySpeed(speed)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: playSpeed === speed ? '#3b82f6' : '#fff',
              color: playSpeed === speed ? '#fff' : '#475569',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Chọn lịch nhảy nhanh ngày */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, zIndex: 5 }}>
        <input 
          type="date"
          value={getDatePickerValue()}
          onChange={(e) => handleDateChange(e.target.value)}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            outline: 'none',
            color: '#334155',
            fontWeight: 500,
            cursor: 'pointer'
          }}
          title="Chọn ngày nhảy nhanh"
        />
      </div>

      {/* Vùng thanh trượt thời gian chính dạng bánh xe lướt */}
      <div 
        style={{ 
          flex: 1, 
          position: "relative",
          maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
          WebkitMaskImage: "-webkit-linear-gradient(left, transparent, black 15%, black 85%, transparent)",
          background: "rgba(30, 41, 59, 0.08)",
          borderRadius: "30px",
          backdropFilter: "blur(2px)",
          border: '1px solid rgba(226, 232, 240, 0.8)'
        }}
      >
        {/* Kim chỉ thời điểm hiện tại chính giữa */}
        <div style={{
          position: "absolute",
          top: "5px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "2px",
          height: "45px",
          backgroundColor: "#3b82f6",
          boxShadow: "0 0 10px rgba(59, 130, 246, 0.7)",
          zIndex: 2,
          pointerEvents: "none"
        }} />

        {/* Khối danh sách các mốc giờ có thể cuộn / vuốt */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUpOrLeave}
          onMouseLeave={onMouseUpOrLeave}
          style={{
            display: "flex",
            alignItems: "flex-end",
            overflowX: "auto",
            scrollSnapType: isMouseDown ? "none" : "x mandatory",
            padding: "0 50%", 
            height: "55px",
            scrollbarWidth: "none", 
            msOverflowStyle: "none",
            cursor: isMouseDown ? 'grabbing' : 'grab',
            userSelect: 'none'
          }}
          className="no-scrollbar"
        >
          {availableTimes.map((time, idx) => {
            const distance = Math.abs(currentIndex - idx);
            let scale = 1;
            let opacity = 0.4;
            let height = 12;
            let showLabel = false;
            
            if (distance === 0) {
              scale = 1.25;
              opacity = 1;
              height = 24;
              showLabel = true;
            } else if (distance === 1) {
              scale = 1.1;
              opacity = 0.8;
              height = 18;
            } else if (distance === 2) {
              scale = 1;
              opacity = 0.6;
              height = 15;
            } else if (distance < 5) {
              opacity = 0.5;
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
                  paddingBottom: "20px", 
                  scrollSnapAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  transform: `scale(${scale})`,
                  opacity: opacity,
                  position: "relative"
                }}
              >
                {/* Vạch kẻ giờ */}
                <div style={{
                  width: distance === 0 ? "3px" : "2px",
                  height: `${height}px`,
                  backgroundColor: distance === 0 ? "#3b82f6" : "#94a3b8",
                  borderRadius: "2px",
                  boxShadow: distance === 0 ? "0 0 8px rgba(59, 130, 246, 0.4)" : "none"
                }} />
                
                {/* Giờ hiển thị ngắn gọn tránh tràn chữ */}
                {(showLabel || idx % 4 === 0) && (
                  <div style={{
                    position: "absolute",
                    bottom: "2px",
                    fontSize: "9px",
                    fontWeight: distance === 0 ? "bold" : "500",
                    color: distance === 0 ? "#3b82f6" : "#64748b",
                    whiteSpace: "nowrap",
                  }}>
                    {dateObj.getHours() === 0 ? `${dateObj.getDate()}/${dateObj.getMonth() + 1}` : `${dateObj.getHours()}h`}
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
